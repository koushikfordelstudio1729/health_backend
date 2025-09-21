import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { TestOrder, PatientVisit, Commission, TestReport } from '../models';
import { ResponseHelper, DateHelper } from '../utils/helpers';
import { logger } from '../utils/logger';
import { PaymentStatus } from '../types';

export class ReportsController {
  // QR Code Report Access
  static async getReportsByQR(req: AuthRequest, res: Response) {
    try {
      const { orderId } = req.params;
      const { patient: patientId } = req.query;

      // Find the test order
      const testOrder = await TestOrder.findOne({ orderId })
        .populate('referringDoctorId', 'name specialization')
        .populate('tests.testId', 'testName category');

      if (!testOrder) {
        return res.status(404).json(ResponseHelper.error('Test order not found', 404));
      }

      // Verify QR code matches
      if (patientId && testOrder.patientId !== patientId) {
        return res.status(403).json(ResponseHelper.error('Invalid QR code', 403));
      }

      // Get test reports
      const reports = await TestReport.find({ 
        orderId: testOrder._id,
        isActive: true 
      })
        .populate('testId', 'testName category')
        .populate('uploadedBy', 'name');

      // Check if all tests are completed
      const allCompleted = testOrder.tests.every(test => test.status === 'COMPLETED');

      const response = {
        order: {
          orderId: testOrder.orderId,
          patientInfo: testOrder.patientId,
          doctorInfo: testOrder.referringDoctorId,
          tests: testOrder.tests,
          totalAmount: testOrder.totalAmount,
          paymentStatus: testOrder.paymentStatus,
          createdAt: testOrder.createdAt
        },
        reports: reports.map(report => ({
          reportId: report.reportId,
          testName: (report.testId as any).testName,
          testCategory: (report.testId as any).category,
          downloadUrl: report.reportFile.cloudinaryUrl,
          uploadedAt: report.uploadedAt,
          uploadedBy: (report.uploadedBy as any).name
        })),
        status: {
          allCompleted,
          reportsAvailable: reports.length,
          totalTests: testOrder.tests.length
        }
      };

      return res.json(ResponseHelper.success(response, 'Reports retrieved successfully'));
    } catch (error) {
      logger.error('Get reports by QR error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch reports'));
    }
  }

  static async downloadReport(req: AuthRequest, res: Response) {
    try {
      const { reportId } = req.params;

      const report = await TestReport.findOne({ 
        reportId,
        isActive: true 
      })
        .populate('orderId', 'orderId patientId')
        .populate('testId', 'testName');

      if (!report) {
        return res.status(404).json(ResponseHelper.error('Report not found', 404));
      }

      // Return download information
      return res.json(ResponseHelper.success({
        reportId: report.reportId,
        testName: (report.testId as any).testName,
        orderId: (report.orderId as any).orderId,
        patientId: (report.orderId as any).patientId,
        downloadUrl: report.reportFile.cloudinaryUrl,
        filename: report.reportFile.originalName,
        fileSize: report.reportFile.fileSize,
        mimeType: report.reportFile.mimeType
      }, 'Report download information retrieved'));
    } catch (error) {
      logger.error('Download report error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to get report download information'));
    }
  }

  // Revenue Reports
  static async getRevenueReport(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;
      const branchId = req.user?.branchId;

      const dateRange = DateHelper.getDateRange(startDate as string, endDate as string);
      const branchFilter = branchId ? { branchId } : {};

      // Revenue from test orders
      const testOrderRevenue = await TestOrder.aggregate([
        {
          $match: {
            ...branchFilter,
            paymentStatus: PaymentStatus.PAID,
            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$totalAmount' },
            totalOrders: { $sum: 1 },
            averageOrderValue: { $avg: '$totalAmount' }
          }
        }
      ]);

      // Revenue from consultations
      const consultationRevenue = await PatientVisit.aggregate([
        {
          $match: {
            ...branchFilter,
            paymentStatus: PaymentStatus.PAID,
            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$consultationFee' },
            totalVisits: { $sum: 1 },
            averageConsultationFee: { $avg: '$consultationFee' }
          }
        }
      ]);

      // Daily/Monthly breakdown
      let groupFormat;
      if (groupBy === 'month') {
        groupFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } };
      } else {
        groupFormat = { year: { $year: '$createdAt' }, month: { $month: '$createdAt' }, day: { $dayOfMonth: '$createdAt' } };
      }

      const dailyRevenue = await TestOrder.aggregate([
        {
          $match: {
            ...branchFilter,
            paymentStatus: PaymentStatus.PAID,
            createdAt: { $gte: dateRange.start, $lte: dateRange.end }
          }
        },
        {
          $group: {
            _id: groupFormat,
            revenue: { $sum: '$totalAmount' },
            orders: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
      ]);

      const revenueData = {
        summary: {
          testOrderRevenue: testOrderRevenue[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0 },
          consultationRevenue: consultationRevenue[0] || { totalRevenue: 0, totalVisits: 0, averageConsultationFee: 0 },
          totalRevenue: (testOrderRevenue[0]?.totalRevenue || 0) + (consultationRevenue[0]?.totalRevenue || 0)
        },
        breakdown: dailyRevenue,
        period: {
          startDate: dateRange.start,
          endDate: dateRange.end,
          groupBy
        }
      };

      return res.json(ResponseHelper.success(revenueData, 'Revenue report generated successfully'));
    } catch (error) {
      logger.error('Get revenue report error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to generate revenue report'));
    }
  }

  // Commission Reports
  static async getCommissionReports(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, doctorId, paymentStatus } = req.query;
      const branchId = req.user?.branchId;

      const dateRange = DateHelper.getDateRange(startDate as string, endDate as string);
      const matchQuery: any = {
        calculatedDate: { $gte: dateRange.start, $lte: dateRange.end }
      };

      if (branchId) matchQuery.branchId = branchId;
      if (doctorId) matchQuery.doctorId = doctorId;
      if (paymentStatus) matchQuery.paymentStatus = paymentStatus;

      // Commission summary by doctor
      const commissionsByDoctor = await Commission.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$doctorId',
            totalCommissions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            paidAmount: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', PaymentStatus.PAID] }, '$amount', 0]
              }
            },
            pendingAmount: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', PaymentStatus.PENDING] }, '$amount', 0]
              }
            }
          }
        },
        {
          $lookup: {
            from: 'doctors',
            localField: '_id',
            foreignField: '_id',
            as: 'doctor'
          }
        },
        { $unwind: '$doctor' },
        {
          $project: {
            doctorName: '$doctor.name',
            doctorId: '$doctor.doctorId',
            specialization: '$doctor.specialization',
            totalCommissions: 1,
            totalAmount: 1,
            paidAmount: 1,
            pendingAmount: 1
          }
        },
        { $sort: { totalAmount: -1 } }
      ]);

      // Overall commission statistics
      const overallStats = await Commission.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: null,
            totalCommissions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            paidAmount: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', PaymentStatus.PAID] }, '$amount', 0]
              }
            },
            pendingAmount: {
              $sum: {
                $cond: [{ $eq: ['$paymentStatus', PaymentStatus.PENDING] }, '$amount', 0]
              }
            }
          }
        }
      ]);

      const reportData = {
        summary: overallStats[0] || {
          totalCommissions: 0,
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0
        },
        doctorBreakdown: commissionsByDoctor,
        period: {
          startDate: dateRange.start,
          endDate: dateRange.end
        }
      };

      return res.json(ResponseHelper.success(reportData, 'Commission report generated successfully'));
    } catch (error) {
      logger.error('Get commission reports error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to generate commission report'));
    }
  }

  // Daily Collection Sheet
  static async getDailyCollection(req: AuthRequest, res: Response) {
    try {
      const { date = new Date().toISOString().split('T')[0] } = req.query;
      const branchId = req.user?.branchId;

      const targetDate = new Date(date as string);
      const nextDate = new Date(targetDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const dateFilter = {
        createdAt: { $gte: targetDate, $lt: nextDate }
      };

      const branchFilter = branchId ? { branchId } : {};

      // Test order collections
      const testOrderCollections = await TestOrder.find({
        ...branchFilter,
        ...dateFilter,
        paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] }
      })
        .populate('referringDoctorId', 'name')
        .select('orderId patientId referringDoctorId totalAmount paymentMode paymentStatus createdAt')
        .sort({ createdAt: 1 });

      // Consultation collections
      const consultationCollections = await PatientVisit.find({
        ...branchFilter,
        ...dateFilter,
        paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] }
      })
        .populate('doctorId', 'name')
        .select('visitId patientId doctorId consultationFee paymentMode paymentStatus visitDate')
        .sort({ visitDate: 1 });

      // Payment mode summary
      const paymentModeSummary = await TestOrder.aggregate([
        {
          $match: {
            ...branchFilter,
            ...dateFilter,
            paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] }
          }
        },
        {
          $group: {
            _id: '$paymentMode',
            count: { $sum: 1 },
            amount: { $sum: '$totalAmount' }
          }
        }
      ]);

      // Add consultation payment modes
      const consultationPaymentSummary = await PatientVisit.aggregate([
        {
          $match: {
            ...branchFilter,
            ...dateFilter,
            paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] }
          }
        },
        {
          $group: {
            _id: '$paymentMode',
            count: { $sum: 1 },
            amount: { $sum: '$consultationFee' }
          }
        }
      ]);

      // Combine payment mode summaries
      const combinedPaymentSummary: any = {};
      [...paymentModeSummary, ...consultationPaymentSummary].forEach((item: any) => {
        if (!combinedPaymentSummary[item._id]) {
          combinedPaymentSummary[item._id] = { count: 0, amount: 0 };
        }
        combinedPaymentSummary[item._id].count += item.count;
        combinedPaymentSummary[item._id].amount += item.amount;
      });

      const totalCollection = Object.values(combinedPaymentSummary).reduce((sum, item: any) => sum + item.amount, 0);

      const collectionData = {
        date: targetDate,
        collections: {
          testOrders: testOrderCollections,
          consultations: consultationCollections
        },
        summary: {
          totalTestOrders: testOrderCollections.length,
          totalConsultations: consultationCollections.length,
          totalCollection,
          paymentModeBreakdown: Object.entries(combinedPaymentSummary).map(([mode, data]: [string, any]) => ({
            paymentMode: mode,
            count: data.count,
            amount: data.amount
          }))
        }
      };

      return res.json(ResponseHelper.success(collectionData, 'Daily collection sheet generated successfully'));
    } catch (error) {
      logger.error('Get daily collection error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to generate daily collection sheet'));
    }
  }

  // Payment Summary Report
  static async getPaymentSummary(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate, paymentMode } = req.query;
      const branchId = req.user?.branchId;

      const dateRange = DateHelper.getDateRange(startDate as string, endDate as string);
      const branchFilter = branchId ? { branchId } : {};
      const dateFilter = { createdAt: { $gte: dateRange.start, $lte: dateRange.end } };

      const matchQuery: any = {
        ...branchFilter,
        ...dateFilter,
        ...(paymentMode && { paymentMode })
      };

      // Payment status summary
      const paymentStatusSummary = await TestOrder.aggregate([
        { $match: matchQuery },
        {
          $group: {
            _id: '$paymentStatus',
            count: { $sum: 1 },
            amount: { $sum: '$totalAmount' }
          }
        }
      ]);

      // Outstanding payments
      const outstandingPayments = await TestOrder.find({
        ...branchFilter,
        paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
      })
        .select('orderId patientId totalAmount paymentStatus createdAt')
        .sort({ createdAt: -1 })
        .limit(50);

      const summaryData = {
        period: {
          startDate: dateRange.start,
          endDate: dateRange.end
        },
        paymentStatusBreakdown: paymentStatusSummary,
        outstandingPayments: outstandingPayments.map(order => ({
          orderId: order.orderId,
          patientId: order.patientId,
          amount: order.totalAmount,
          paymentStatus: order.paymentStatus,
          daysPending: Math.floor((new Date().getTime() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24))
        })),
        summary: {
          totalOutstanding: outstandingPayments.reduce((sum, order) => sum + order.totalAmount, 0),
          totalPaid: paymentStatusSummary.find(item => item._id === PaymentStatus.PAID)?.amount || 0,
          totalPending: paymentStatusSummary.find(item => item._id === PaymentStatus.PENDING)?.amount || 0
        }
      };

      return res.json(ResponseHelper.success(summaryData, 'Payment summary generated successfully'));
    } catch (error) {
      logger.error('Get payment summary error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to generate payment summary'));
    }
  }
}