import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Patient, PatientVisit, Prescription, TestOrder, Doctor, Test } from '../models';
import { ResponseHelper, QueryHelper, CommissionHelper } from '../utils/helpers';
import { IDGenerator } from '../utils/idGenerator';
import { QRService } from '../services/qr.service';
import { CommissionService } from '../services/commission.service';
import { logger } from '../utils/logger';
import { PaymentStatus, TestStatus } from '../types';

export class OPDController {
  // Patient Management
  static async registerPatient(req: AuthRequest, res: Response) {
    try {
      const { name, age, dob, gender, contact, address, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;
      
      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      // Check if patient with same contact already exists in this branch
      const existingPatient = await Patient.findOne({ contact, branchId });
      if (existingPatient) {
        return res.status(400).json(ResponseHelper.error('Patient with this contact number already exists in this branch', 400));
      }

      const patientId = await IDGenerator.generatePatientId(branchId);
      
      const patient = new Patient({
        patientId,
        name,
        age,
        dob: new Date(dob),
        gender,
        contact,
        address,
        branchId,
        registeredBy: req.user?._id
      });

      await patient.save();
      
      logger.info(`Patient registered: ${patientId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(patient, 'Patient registered successfully'));
    } catch (error) {
      logger.error('Register patient error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to register patient'));
    }
  }

  static async getPatients(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, isActive, branchId: queryBranchId } = req.query;
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = req.user?.branchId || (queryBranchId as string);

      const query = QueryHelper.buildFilterQuery({ search, isActive }, branchId);
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { patientId: { $regex: search, $options: 'i' } },
          { contact: { $regex: search, $options: 'i' } }
        ];
      }

      const patients = await Patient.find(query)
        .populate('registeredBy', 'name userId')
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Patient.countDocuments(query);

      return res.json(ResponseHelper.paginated(patients, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get patients error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch patients'));
    }
  }

  static async getPatientDetails(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const branchId = req.user?.branchId;

      const patient = await Patient.findOne({ 
        _id: id, 
        ...(branchId && { branchId }) 
      }).populate('registeredBy', 'name userId');

      if (!patient) {
        return res.status(404).json(ResponseHelper.error('Patient not found', 404));
      }

      // Get recent visits
      const recentVisits = await PatientVisit.find({ patientId: patient.patientId })
        .populate('doctorId', 'name specialization')
        .sort({ visitDate: -1 })
        .limit(5);

      // Get recent test orders
      const recentOrders = await TestOrder.find({ patientId: patient.patientId })
        .populate('tests.testId', 'testName category')
        .sort({ createdAt: -1 })
        .limit(5);

      return res.json(ResponseHelper.success({
        patient,
        recentVisits,
        recentOrders,
        summary: {
          totalVisits: await PatientVisit.countDocuments({ patientId: patient.patientId }),
          totalOrders: await TestOrder.countDocuments({ patientId: patient.patientId }),
          pendingOrders: await TestOrder.countDocuments({ 
            patientId: patient.patientId, 
            paymentStatus: PaymentStatus.PENDING 
          })
        }
      }, 'Patient details retrieved successfully'));
    } catch (error) {
      logger.error('Get patient details error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch patient details'));
    }
  }

  // Visit Management
  static async createVisit(req: AuthRequest, res: Response) {
    try {
      const { patientId, doctorId, consultationFee, paymentMode, paymentStatus, nextVisitDate, visitType, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;

      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      // Verify patient exists
      const patient = await Patient.findOne({ patientId, branchId });
      if (!patient) {
        return res.status(404).json(ResponseHelper.error('Patient not found', 404));
      }

      // Verify doctor exists and is available for this branch
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        return res.status(404).json(ResponseHelper.error('Doctor not found', 404));
      }
      
      // Check if doctor is available for this branch (handle both string and ObjectId formats)
      const isAvailableForBranch = doctor.availableBranches.some(branch => 
        branch.toString() === branchId || branch === branchId
      );
      
      if (!isAvailableForBranch) {
        return res.status(404).json(ResponseHelper.error('Doctor not available for this branch', 404));
      }

      const visitId = await IDGenerator.generateVisitId(branchId);

      const visit = new PatientVisit({
        visitId,
        patientId,
        doctorId,
        branchId,
        visitDate: new Date(),
        consultationFee: consultationFee || doctor.consultationFee,
        paymentMode,
        paymentStatus,
        nextVisitDate: nextVisitDate ? new Date(nextVisitDate) : undefined,
        visitType,
        createdBy: req.user?._id
      });

      await visit.save();
      
      await visit.populate('doctorId', 'name specialization');
      
      logger.info(`Visit created: ${visitId} for patient ${patientId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(visit, 'Visit created successfully'));
    } catch (error) {
      logger.error('Create visit error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create visit'));
    }
  }

  static async updateVisit(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const branchId = req.user?.branchId;

      const visit = await PatientVisit.findOne({ 
        _id: id, 
        ...(branchId && { branchId }) 
      });

      if (!visit) {
        return res.status(404).json(ResponseHelper.error('Visit not found', 404));
      }

      // Update only allowed fields
      const allowedFields = ['consultationFee', 'paymentMode', 'paymentStatus', 'nextVisitDate'];
      const filteredUpdate: any = Object.keys(updateData)
        .filter(key => allowedFields.includes(key))
        .reduce((obj: any, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {});

      Object.assign(visit, filteredUpdate);
      await visit.save();

      logger.info(`Visit updated: ${visit.visitId} by user ${req.user?.userId}`);
      
      return res.json(ResponseHelper.success(visit, 'Visit updated successfully'));
    } catch (error) {
      logger.error('Update visit error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update visit'));
    }
  }

  static async getVisits(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, branchId: queryBranchId, patientId, doctorId, paymentStatus, visitType, startDate, endDate } = req.query;
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = req.user?.branchId || (queryBranchId as string);

      const query: any = {};
      
      if (branchId) {
        query.branchId = branchId;
      }

      if (patientId) {
        query.patientId = patientId;
      }

      if (doctorId) {
        query.doctorId = doctorId;
      }

      if (paymentStatus) {
        query.paymentStatus = paymentStatus;
      }

      if (visitType) {
        query.visitType = visitType;
      }

      if (startDate || endDate) {
        query.visitDate = {};
        if (startDate) {
          query.visitDate.$gte = new Date(startDate as string);
        }
        if (endDate) {
          query.visitDate.$lte = new Date(endDate as string);
        }
      }

      const visits = await PatientVisit.find(query)
        .populate('doctorId', 'name specialization')
        .populate('createdBy', 'name userId')
        .sort({ visitDate: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await PatientVisit.countDocuments(query);

      return res.json(ResponseHelper.paginated(visits, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get visits error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch visits'));
    }
  }

  // Test Order Management
  static async createTestOrder(req: AuthRequest, res: Response) {
    try {
      const { patientId, visitId, referringDoctorId, tests, paymentMode, paymentStatus, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;

      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      // Verify patient and visit exist
      const [patient, visit] = await Promise.all([
        Patient.findOne({ patientId, branchId }),
        PatientVisit.findById(visitId)
      ]);

      if (!patient) {
        return res.status(404).json(ResponseHelper.error('Patient not found', 404));
      }

      if (!visit) {
        return res.status(404).json(ResponseHelper.error('Visit not found', 404));
      }

      // Verify all tests exist and calculate total amount
      const testIds = tests.map((test: any) => test.testId);
      const testDetails = await Test.find({ _id: { $in: testIds }, isActive: true });

      if (testDetails.length !== tests.length) {
        return res.status(400).json(ResponseHelper.error('Some tests are not found or inactive', 400));
      }

      // Calculate total amount and commission
      let totalAmount = 0;
      let commissionAmount = 0;
      const orderTests = tests.map((orderTest: any) => {
        const testDetail = testDetails.find(t => t._id.toString() === orderTest.testId);
        if (testDetail) {
          totalAmount += orderTest.price || testDetail.price;
          commissionAmount += CommissionHelper.calculateCommission(
            orderTest.price || testDetail.price, 
            testDetail.commissionRate
          );
        }
        return {
          testId: orderTest.testId,
          testName: orderTest.testName || testDetail?.testName,
          price: orderTest.price || testDetail?.price,
          status: TestStatus.PENDING
        };
      });

      const orderId = await IDGenerator.generateOrderId(branchId);
      const qrString = QRService.generateQRString(orderId, patientId);
      const labId = `${branchId}-LAB001`; // Default lab assignment

      const testOrder = new TestOrder({
        orderId,
        patientId,
        visitId,
        referringDoctorId,
        tests: orderTests,
        totalAmount,
        commissionAmount,
        paymentMode,
        paymentStatus,
        qrCode: qrString,
        labId,
        branchId,
        createdBy: req.user?._id
      });

      await testOrder.save();

      // Calculate commission for the referring doctor (if there is one)
      if (referringDoctorId) {
        const commissionResult = await CommissionService.calculateCommission(testOrder._id.toString());
        if (!commissionResult.success) {
          logger.warn(`Commission calculation failed for order ${testOrder._id}: ${commissionResult.message}`);
        }
      }

      await testOrder.populate([
        { path: 'referringDoctorId', select: 'name specialization' },
        { path: 'tests.testId', select: 'testName category' }
      ]);

      logger.info(`Test order created: ${orderId} for patient ${patientId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(testOrder, 'Test order created successfully'));
    } catch (error) {
      logger.error('Create test order error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create test order'));
    }
  }

  // Prescription Management
  static async createPrescription(req: AuthRequest, res: Response) {
    try {
      const { visitId, vitals, examination, testsRecommended, medicinesRecommended } = req.body;
      const branchId = req.user?.branchId;

      // Verify visit exists
      const visit = await PatientVisit.findById(visitId).populate('doctorId');
      if (!visit) {
        return res.status(404).json(ResponseHelper.error('Visit not found', 404));
      }

      if (branchId && visit.branchId !== branchId) {
        return res.status(403).json(ResponseHelper.error('Access denied for this visit', 403));
      }

      const prescriptionId = await IDGenerator.generatePrescriptionId(visit.branchId);

      const prescription = new Prescription({
        prescriptionId,
        visitId,
        patientId: visit.patientId,
        doctorId: (visit.doctorId as any)._id || visit.doctorId,
        vitals,
        examination,
        testsRecommended: testsRecommended || [],
        medicinesRecommended: medicinesRecommended || []
      });

      await prescription.save();

      await prescription.populate([
        { path: 'doctorId', select: 'name specialization' },
        { path: 'testsRecommended', select: 'testName category price' }
      ]);

      logger.info(`Prescription created: ${prescriptionId} for visit ${visit.visitId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(prescription, 'Prescription created successfully'));
    } catch (error) {
      logger.error('Create prescription error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create prescription'));
    }
  }

  // Appointments/Queue Management
  static async getAppointments(req: AuthRequest, res: Response) {
    try {
      const { date, doctorId } = req.query;
      const branchId = req.user?.branchId;

      const query: any = {};
      
      if (branchId) query.branchId = branchId;
      
      if (date) {
        const startDate = new Date(date as string);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 1);
        
        query.visitDate = {
          $gte: startDate,
          $lt: endDate
        };
      } else {
        // Default to today's appointments
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        query.visitDate = {
          $gte: new Date(today.toDateString()),
          $lt: new Date(tomorrow.toDateString())
        };
      }
      
      if (doctorId) query.doctorId = doctorId;

      const appointments = await PatientVisit.find(query)
        .populate('doctorId', 'name specialization')
        .sort({ visitDate: 1 });

      return res.json(ResponseHelper.success(appointments, 'Appointments retrieved successfully'));
    } catch (error) {
      logger.error('Get appointments error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch appointments'));
    }
  }

  static async getAvailableDoctors(req: AuthRequest, res: Response) {
    try {
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = req.user?.branchId || (req.query.branchId as string);

      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      const doctors = await Doctor.find({ 
        availableBranches: branchId,
        isActive: true 
      }).select('doctorId name specialization consultationFee');

      return res.json(ResponseHelper.success(doctors, 'Available doctors retrieved successfully'));
    } catch (error) {
      logger.error('Get available doctors error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch available doctors'));
    }
  }

  static async getAvailableTests(req: AuthRequest, res: Response) {
    try {
      const { category, branchId: queryBranchId } = req.query;
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = req.user?.branchId || (queryBranchId as string);

      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      const query: any = { 
        availableBranches: branchId,
        isActive: true 
      };

      if (category) {
        query.category = category;
      }

      const tests = await Test.find(query).select('testId testName category price commissionRate');

      return res.json(ResponseHelper.success(tests, 'Available tests retrieved successfully'));
    } catch (error) {
      logger.error('Get available tests error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch available tests'));
    }
  }

  static async getPatientsByBranch(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, isActive } = req.query;
      const { branchId } = req.params;

      // Check if user has access to this branch (admin can access all branches)
      if (req.user?.branchId && req.user.branchId !== branchId) {
        return res.status(403).json(ResponseHelper.error('Access denied for this branch', 403));
      }

      const query = QueryHelper.buildFilterQuery({ search, isActive }, branchId);
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { patientId: { $regex: search, $options: 'i' } },
          { contact: { $regex: search, $options: 'i' } }
        ];
      }

      const patients = await Patient.find(query)
        .populate('registeredBy', 'name userId')
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Patient.countDocuments(query);

      return res.json(ResponseHelper.paginated(patients, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get patients by branch error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch patients for branch'));
    }
  }

  static async getDoctorsByBranch(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, isActive, specialization } = req.query;
      const { branchId } = req.params;

      // Check if user has access to this branch (admin can access all branches)
      if (req.user?.branchId && req.user.branchId !== branchId) {
        return res.status(403).json(ResponseHelper.error('Access denied for this branch', 403));
      }

      const query: any = { 
        availableBranches: branchId
      };

      if (isActive !== undefined) {
        query.isActive = isActive === 'true';
      } else {
        query.isActive = true; // Default to active doctors
      }

      if (specialization) {
        query.specialization = { $regex: specialization, $options: 'i' };
      }

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { doctorId: { $regex: search, $options: 'i' } },
          { specialization: { $regex: search, $options: 'i' } }
        ];
      }

      const doctors = await Doctor.find(query)
        .select('doctorId name specialization consultationFee commissionRate contact email isActive')
        .sort({ name: 1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Doctor.countDocuments(query);

      return res.json(ResponseHelper.paginated(doctors, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get doctors by branch error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch doctors for branch'));
    }
  }

}