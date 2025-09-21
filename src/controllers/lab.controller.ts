import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { TestOrder, TestReport, Patient } from '../models';
import { ResponseHelper, QueryHelper } from '../utils/helpers';
import { IDGenerator } from '../utils/idGenerator';
import { cloudinary } from '../config/cloudinary';
import { EmailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { TestStatus, PaymentStatus } from '../types';

export class LabController {
  // Test Queue Management
  static async getTestQueue(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, status, search, branchId: queryBranchId } = req.query;
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = (queryBranchId as string) || req.user?.branchId;

      const query = QueryHelper.buildFilterQuery({ status, search }, branchId);
      
      // Add specific lab queue filters
      if (!status) {
        query['tests.status'] = { $in: [TestStatus.PENDING, TestStatus.COLLECTED, TestStatus.PROCESSING] };
      }

      if (search) {
        query.$or = [
          { orderId: { $regex: search, $options: 'i' } },
          { patientId: { $regex: search, $options: 'i' } }
        ];
      }

      const testOrders = await TestOrder.find(query)
        .populate('referringDoctorId', 'name specialization')
        .populate('tests.testId', 'testName category')
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await TestOrder.countDocuments(query);

      // Get patient data separately since patientId is a string reference
      const patientIds = [...new Set(testOrders.map(order => order.patientId))];
      const patients = await Patient.find({ patientId: { $in: patientIds } })
        .select('patientId name age dob gender contact email address branchId isActive createdAt updatedAt');
      
      const patientMap = patients.reduce((map, patient) => {
        map[patient.patientId] = patient;
        return map;
      }, {} as any);

      // Transform data to group tests by patient
      const patientTestsMap = new Map();
      
      testOrders.forEach(order => {
        const patientId = order.patientId;
        
        if (!patientTestsMap.has(patientId)) {
          patientTestsMap.set(patientId, {
            patient: patientMap[patientId],
            orders: []
          });
        }
        
        const patient = patientMap[patientId];
        patientTestsMap.get(patientId).orders.push({
          orderId: order.orderId,
          orderObjectId: order._id,
          referringDoctor: order.referringDoctorId,
          tests: order.tests,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt,
          qrCode: order.qrCode,
          qrDetails: {
            code: order.qrCode,
            patient: {
              patientId: order.patientId,
              name: patient?.name || 'Unknown',
              age: patient?.age || 0,
              gender: patient?.gender || 'Unknown',
              contact: patient?.contact || 'N/A',
              address: patient?.address || 'N/A'
            },
            order: {
              orderId: order.orderId,
              branchId: order.branchId,
              totalAmount: order.totalAmount,
              paymentStatus: order.paymentStatus,
              createdAt: order.createdAt
            },
            doctor: {
              name: (order.referringDoctorId as any)?.name || 'Unknown',
              specialization: (order.referringDoctorId as any)?.specialization || 'N/A'
            },
            tests: {
              all: order.tests.map(test => ({
                testId: (test.testId as any)?._id || test.testId,
                testName: test.testName,
                category: (test.testId as any)?.category || 'Unknown',
                price: test.price,
                status: test.status,
                collectionDate: test.collectionDate || null,
                completionDate: test.completionDate || null
              })),
              summary: {
                total: order.tests.length,
                pending: order.tests.filter(test => test.status === TestStatus.PENDING).length,
                collected: order.tests.filter(test => test.status === TestStatus.COLLECTED).length,
                processing: order.tests.filter(test => test.status === TestStatus.PROCESSING).length,
                completed: order.tests.filter(test => test.status === TestStatus.COMPLETED).length
              }
            }
          }
        });
      });

      const testQueue = Array.from(patientTestsMap.values());

      return res.json(ResponseHelper.paginated(testQueue, total, Number(page), Number(limit), 'Test queue retrieved successfully'));
    } catch (error) {
      logger.error('Get test queue error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch test queue'));
    }
  }

  static async updateTestStatus(req: AuthRequest, res: Response) {
    try {
      const { orderId } = req.params;
      const { testId, status, collectionDate, completionDate, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;

      const testOrder = await TestOrder.findOne({
        _id: orderId,
        ...(branchId && { branchId })
      });

      if (!testOrder) {
        return res.status(404).json(ResponseHelper.error('Test order not found', 404));
      }

      // Find and update the specific test
      const testIndex = testOrder.tests.findIndex(test => test.testId.toString() === testId);
      if (testIndex === -1) {
        return res.status(404).json(ResponseHelper.error('Test not found in this order', 404));
      }

      // Update test status and dates
      testOrder.tests[testIndex].status = status;
      
      if (status === TestStatus.COLLECTED && collectionDate) {
        testOrder.tests[testIndex].collectionDate = new Date(collectionDate);
      }
      
      if (status === TestStatus.COMPLETED && completionDate) {
        testOrder.tests[testIndex].completionDate = new Date(completionDate);
      }

      await testOrder.save();

      // Check if all tests in the order are completed
      const allCompleted = testOrder.tests.every(test => test.status === TestStatus.COMPLETED);
      
      if (allCompleted) {
        // Send notification to patient if email exists
        const patient = await Patient.findOne({ patientId: testOrder.patientId });
        if (patient?.email) {
          await EmailService.sendTestResultNotification(
            patient.email,
            patient.name,
            testOrder.orderId,
            testOrder.qrCode
          );
        }
      }

      logger.info(`Test status updated: ${testOrder.orderId} - ${testId} to ${status} by user ${req.user?.userId}`);
      
      return res.json(ResponseHelper.success(testOrder, 'Test status updated successfully'));
    } catch (error) {
      logger.error('Update test status error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update test status'));
    }
  }

  // Report Management
  static async uploadTestReport(req: AuthRequest, res: Response) {
    try {
      const { orderId, testId, patientId } = req.body;
      const file = req.file;
      const branchId = req.user?.branchId;

      if (!file) {
        return res.status(400).json(ResponseHelper.error('Report file is required', 400));
      }

      // Verify test order exists
      const testOrder = await TestOrder.findOne({
        _id: orderId,
        ...(branchId && { branchId })
      });

      if (!testOrder) {
        return res.status(404).json(ResponseHelper.error('Test order not found', 404));
      }

      // Verify test exists in the order
      const testExists = testOrder.tests.some(test => 
        test.testId.toString() === testId || test.testId === testId
      );
      if (!testExists) {
        logger.error(`Test not found in order. Looking for testId: ${testId}, Available tests:`, 
          testOrder.tests.map(t => ({ testId: t.testId, testName: t.testName }))
        );
        return res.status(404).json(ResponseHelper.error('Test not found in this order', 404));
      }

      // Upload file to Cloudinary using Promise-based approach
      try {
        const uploadResult = await new Promise((resolve, reject) => {
          // Determine resource type and upload options based on file type
          const isPDF = file.mimetype === 'application/pdf';
          
          const uploadOptions = {
            resource_type: isPDF ? ('raw' as const) : ('image' as const), // Use 'raw' for PDFs, 'image' for images
            folder: process.env.CLOUDINARY_FOLDER || 'heal-diagnostic-reports',
            public_id: `${testOrder.orderId}_${testId}_${Date.now()}`,
            allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
            // Only apply transformations to images, not PDFs
            ...(isPDF ? {} : {
              transformation: [
                { quality: 'auto:good' },
                { fetch_format: 'auto' }
              ]
            })
          };

          const uploadStream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
              if (error) {
                logger.error('Cloudinary upload error:', error);
                logger.error('Error details:', JSON.stringify(error, null, 2));
                reject(error);
              } else {
                logger.info(`File uploaded successfully. Type: ${file.mimetype}, Resource Type: ${uploadOptions.resource_type}`);
                resolve(result);
              }
            }
          );
          
          uploadStream.end(file.buffer);
        });

        const result = uploadResult as any;
        
        if (!result) {
          return res.status(500).json(ResponseHelper.error('File upload failed - no result'));
        }

        const reportId = await IDGenerator.generateReportId(testOrder.branchId);

        const testReport = new TestReport({
          reportId,
          orderId: testOrder._id,
          testId,
          patientId,
          reportFile: {
            filename: result.public_id,
            originalName: file.originalname,
            cloudinaryUrl: result.secure_url,
            fileSize: file.size,
            mimeType: file.mimetype
          },
          uploadedBy: req.user?._id
        });

        await testReport.save();

        // Update test status to completed
        const testIndex = testOrder.tests.findIndex(test => 
          test.testId.toString() === testId || test.testId === testId
        );
        if (testIndex !== -1) {
          testOrder.tests[testIndex].status = TestStatus.COMPLETED;
          testOrder.tests[testIndex].completionDate = new Date();
          await testOrder.save();
        }

        logger.info(`Test report uploaded: ${reportId} for order ${testOrder.orderId} by user ${req.user?.userId}`);
        logger.info(`Cloudinary URL: ${result.secure_url}`);
        
        return res.status(201).json(ResponseHelper.success(testReport, 'Test report uploaded successfully'));
        
      } catch (uploadError) {
        logger.error('Cloudinary upload failed:', uploadError);
        return res.status(500).json(ResponseHelper.error('Failed to upload file to cloud storage'));
      }

    } catch (error) {
      logger.error('Upload test report error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to upload test report'));
    }
  }

  static async getTestReports(req: AuthRequest, res: Response) {
    try {
      const { orderId } = req.params;
      const branchId = req.user?.branchId;

      // Verify test order exists and user has access
      const testOrder = await TestOrder.findOne({
        _id: orderId,
        ...(branchId && { branchId })
      });

      if (!testOrder) {
        return res.status(404).json(ResponseHelper.error('Test order not found', 404));
      }

      const reports = await TestReport.find({ 
        orderId: testOrder._id,
        isActive: true 
      })
        .populate('testId', 'testName category')
        .populate('uploadedBy', 'name userId')
        .sort({ uploadedAt: -1 });

      return res.json(ResponseHelper.success(reports, 'Test reports retrieved successfully'));
    } catch (error) {
      logger.error('Get test reports error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch test reports'));
    }
  }

  static async downloadTestReport(req: AuthRequest, res: Response) {
    try {
      const { reportId } = req.params;

      const report = await TestReport.findOne({ 
        reportId,
        isActive: true 
      }).populate('orderId', 'branchId');

      if (!report) {
        return res.status(404).json(ResponseHelper.error('Test report not found', 404));
      }

      // Check branch access
      const orderData = report.orderId as any;
      if (req.user?.branchId && orderData.branchId !== req.user.branchId && req.user.role !== 'ADMIN') {
        return res.status(403).json(ResponseHelper.error('Access denied', 403));
      }

      // For PDFs, ensure the URL includes the file extension for proper handling
      let downloadUrl = report.reportFile.cloudinaryUrl;
      const isPDF = report.reportFile.mimeType === 'application/pdf';
      
      // If it's a PDF and the URL doesn't end with .pdf, add format parameter
      if (isPDF && !downloadUrl.includes('.pdf')) {
        // Add fl_attachment flag for PDFs to force download instead of inline display
        downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
      }

      // Return the Cloudinary URL for download
      return res.json(ResponseHelper.success({
        reportId: report.reportId,
        filename: report.reportFile.originalName,
        downloadUrl: downloadUrl,
        fileSize: report.reportFile.fileSize,
        mimeType: report.reportFile.mimeType,
        uploadedAt: report.uploadedAt
      }, 'Download URL retrieved successfully'));
    } catch (error) {
      logger.error('Download test report error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to get download URL'));
    }
  }

  // Dashboard for Lab Staff
  static async getLabDashboard(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, branchId: queryBranchId } = req.query;
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = (queryBranchId as string) || req.user?.branchId;

      const dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        };
      }

      const branchFilter = branchId ? { branchId } : {};

      // Get lab statistics
      const [
        totalOrders,
        pendingTests,
        completedTests,
        todayCollection,
        recentOrders
      ] = await Promise.all([
        TestOrder.countDocuments({ ...branchFilter, ...dateFilter }),
        TestOrder.aggregate([
          { $match: { ...branchFilter } },
          { $unwind: '$tests' },
          { $match: { 'tests.status': { $in: [TestStatus.PENDING, TestStatus.COLLECTED] } } },
          { $count: 'count' }
        ]),
        TestOrder.aggregate([
          { $match: { ...branchFilter } },
          { $unwind: '$tests' },
          { $match: { 'tests.status': TestStatus.COMPLETED } },
          { $count: 'count' }
        ]),
        TestOrder.aggregate([
          { 
            $match: { 
              ...branchFilter, 
              createdAt: {
                $gte: new Date(new Date().toDateString()),
                $lt: new Date(new Date(Date.now() + 24*60*60*1000).toDateString())
              }
            }
          },
          { $count: 'count' }
        ]),
        TestOrder.find(branchFilter)
          .populate('tests.testId', 'testName')
          .sort({ createdAt: -1 })
          .limit(10)
      ]);

      // Get patient data for recent orders
      const recentPatientIds = [...new Set(recentOrders.map(order => order.patientId))];
      const recentPatients = await Patient.find({ patientId: { $in: recentPatientIds } })
        .select('patientId name contact');
      
      const recentPatientMap = recentPatients.reduce((map, patient) => {
        map[patient.patientId] = patient;
        return map;
      }, {} as any);

      const dashboardData = {
        statistics: {
          totalOrders,
          pendingTests: pendingTests[0]?.count || 0,
          completedTests: completedTests[0]?.count || 0,
          todayCollection: todayCollection[0]?.count || 0
        },
        recentOrders: recentOrders.map(order => ({
          orderId: order.orderId,
          patientName: recentPatientMap[order.patientId]?.name,
          patientContact: recentPatientMap[order.patientId]?.contact,
          testsCount: order.tests.length,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt
        }))
      };

      return res.json(ResponseHelper.success(dashboardData, 'Lab dashboard data retrieved successfully'));
    } catch (error) {
      logger.error('Get lab dashboard error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch lab dashboard data'));
    }
  }

  // Sample Collection Management
  static async updateSampleCollection(req: AuthRequest, res: Response) {
    try {
      const { orderId } = req.params;
      const { testId, collectionDate, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;

      const testOrder = await TestOrder.findOne({
        _id: orderId,
        ...(branchId && { branchId })
      });

      if (!testOrder) {
        return res.status(404).json(ResponseHelper.error('Test order not found', 404));
      }

      // Find and update the specific test
      const testIndex = testOrder.tests.findIndex(test => test.testId.toString() === testId);
      if (testIndex === -1) {
        return res.status(404).json(ResponseHelper.error('Test not found in this order', 404));
      }

      // Update test with collection information
      testOrder.tests[testIndex].status = TestStatus.COLLECTED;
      testOrder.tests[testIndex].collectionDate = new Date(collectionDate || new Date());

      await testOrder.save();

      logger.info(`Sample collected: ${testOrder.orderId} - ${testId} by user ${req.user?.userId}`);
      
      return res.json(ResponseHelper.success(testOrder, 'Sample collection updated successfully'));
    } catch (error) {
      logger.error('Update sample collection error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update sample collection'));
    }
  }

  static async getPendingCollections(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, branchId: queryBranchId } = req.query;
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = (queryBranchId as string) || req.user?.branchId;

      const query: any = {
        'tests.status': TestStatus.PENDING,
        paymentStatus: PaymentStatus.PAID // Only collect samples for paid orders
      };

      if (branchId) {
        query.branchId = branchId;
      }

      const pendingCollections = await TestOrder.find(query)
        .populate('tests.testId', 'testName category')
        .sort({ createdAt: 1 }) // Oldest first for collection queue
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      // Get patient data separately since patientId is a string reference
      const patientIds = [...new Set(pendingCollections.map(order => order.patientId))];
      const patients = await Patient.find({ patientId: { $in: patientIds } })
        .select('patientId name age gender contact');
      
      const patientMap = patients.reduce((map, patient) => {
        map[patient.patientId] = patient;
        return map;
      }, {} as any);

      // Add patient data to each order
      const enrichedCollections = pendingCollections.map(order => ({
        ...order.toObject(),
        patient: patientMap[order.patientId]
      }));

      const total = await TestOrder.countDocuments(query);

      return res.json(ResponseHelper.paginated(enrichedCollections, total, Number(page), Number(limit), 'Pending collections retrieved successfully'));
    } catch (error) {
      logger.error('Get pending collections error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch pending collections'));
    }
  }
}