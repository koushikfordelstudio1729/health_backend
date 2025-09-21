import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { PatientVisit, TestOrder, Commission, Expense } from '../models';
import { PaymentStatus } from '../types';
import { logger } from '../utils/logger';

export class AccountsController {
  static async getDailyCollection(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { branchId, date, startDate, endDate } = req.query;
      const user = req.user;

      // Date filtering
      let dateFilter: any = {};
      if (date) {
        const targetDate = new Date(date as string);
        dateFilter = {
          createdAt: {
            $gte: new Date(targetDate.setHours(0, 0, 0, 0)),
            $lte: new Date(targetDate.setHours(23, 59, 59, 999))
          }
        };
      } else if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        };
      } else {
        // Default to today
        const today = new Date();
        dateFilter = {
          createdAt: {
            $gte: new Date(today.setHours(0, 0, 0, 0)),
            $lte: new Date(today.setHours(23, 59, 59, 999))
          }
        };
      }

      // Branch filtering
      const branchFilter: any = {};
      const isAdmin = user?.role === 'ADMIN';
      
      if (!isAdmin) {
        branchFilter.branchId = user?.branchId;
      } else if (branchId) {
        branchFilter.branchId = branchId;
      }

      // For admin users, group by branch; for others, group by payment mode only
      const groupBy = isAdmin && !branchId ? 
        { branchId: '$branchId', paymentMode: '$paymentMode' } : 
        { paymentMode: '$paymentMode' };

      // Get consultation collections
      const consultationCollection = await PatientVisit.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter,
            paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] }
          }
        },
        {
          $group: {
            _id: groupBy,
            totalAmount: { $sum: '$consultationFee' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Get test collections
      const testCollection = await TestOrder.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter,
            paymentStatus: { $in: [PaymentStatus.PAID, PaymentStatus.PARTIAL] }
          }
        },
        {
          $group: {
            _id: groupBy,
            totalAmount: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Get expenses
      const expensesTotal = await Expense.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter
          }
        },
        {
          $group: {
            _id: isAdmin && !branchId ? '$branchId' : null,
            totalExpenses: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      if (isAdmin && !branchId) {
        // Return branch-wise data for admin
        const branchDataMap = new Map();

        // Process consultation collections
        consultationCollection.forEach(item => {
          const branchId = item._id.branchId;
          const paymentMode = item._id.paymentMode;
          
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              collections: new Map(),
              totalCollection: 0,
              totalExpenses: 0,
              netCollection: 0,
              transactionCount: 0
            });
          }

          const branchData = branchDataMap.get(branchId);
          const existing = branchData.collections.get(paymentMode) || {
            paymentMode,
            consultationAmount: 0,
            testAmount: 0,
            totalAmount: 0,
            consultationCount: 0,
            testCount: 0,
            totalCount: 0
          };

          existing.consultationAmount = item.totalAmount;
          existing.consultationCount = item.count;
          existing.totalAmount += item.totalAmount;
          existing.totalCount += item.count;
          branchData.collections.set(paymentMode, existing);
          branchData.totalCollection += item.totalAmount;
          branchData.transactionCount += item.count;
        });

        // Process test collections
        testCollection.forEach(item => {
          const branchId = item._id.branchId;
          const paymentMode = item._id.paymentMode;
          
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              collections: new Map(),
              totalCollection: 0,
              totalExpenses: 0,
              netCollection: 0,
              transactionCount: 0
            });
          }

          const branchData = branchDataMap.get(branchId);
          const existing = branchData.collections.get(paymentMode) || {
            paymentMode,
            consultationAmount: 0,
            testAmount: 0,
            totalAmount: 0,
            consultationCount: 0,
            testCount: 0,
            totalCount: 0
          };

          existing.testAmount = item.totalAmount;
          existing.testCount = item.count;
          existing.totalAmount += item.totalAmount;
          existing.totalCount += item.count;
          branchData.collections.set(paymentMode, existing);
          branchData.totalCollection += item.totalAmount;
          branchData.transactionCount += item.count;
        });

        // Process expenses
        expensesTotal.forEach(item => {
          const branchId = item._id;
          if (branchDataMap.has(branchId)) {
            const branchData = branchDataMap.get(branchId);
            branchData.totalExpenses = item.totalExpenses;
            branchData.netCollection = branchData.totalCollection - item.totalExpenses;
          }
        });

        // Format response for branch-wise data
        const branchWiseData = Array.from(branchDataMap.values()).map(branch => ({
          branchId: branch.branchId,
          collections: Array.from(branch.collections.values()),
          summary: {
            totalCollection: branch.totalCollection,
            totalExpenses: branch.totalExpenses,
            netCollection: branch.netCollection,
            transactionCount: branch.transactionCount
          }
        }));

        const grandTotal = {
          totalCollection: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalCollection, 0),
          totalExpenses: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalExpenses, 0),
          transactionCount: branchWiseData.reduce((sum, branch) => sum + branch.summary.transactionCount, 0)
        };

        res.json({
          success: true,
          data: {
            date: date || new Date().toISOString().split('T')[0],
            type: 'branch-wise',
            branches: branchWiseData,
            grandTotal: {
              ...grandTotal,
              netCollection: grandTotal.totalCollection - grandTotal.totalExpenses
            }
          }
        });

      } else {
        // Original logic for single branch or non-admin users
        const paymentModeMap = new Map();
        
        // Process consultation collections
        consultationCollection.forEach(item => {
          const paymentMode = typeof item._id === 'object' ? item._id.paymentMode : item._id;
          const existing = paymentModeMap.get(paymentMode) || { 
            paymentMode, 
            consultationAmount: 0, 
            testAmount: 0, 
            totalAmount: 0,
            consultationCount: 0,
            testCount: 0,
            totalCount: 0
          };
          existing.consultationAmount = item.totalAmount;
          existing.consultationCount = item.count;
          existing.totalAmount += item.totalAmount;
          existing.totalCount += item.count;
          paymentModeMap.set(paymentMode, existing);
        });

        // Process test collections
        testCollection.forEach(item => {
          const paymentMode = typeof item._id === 'object' ? item._id.paymentMode : item._id;
          const existing = paymentModeMap.get(paymentMode) || { 
            paymentMode, 
            consultationAmount: 0, 
            testAmount: 0, 
            totalAmount: 0,
            consultationCount: 0,
            testCount: 0,
            totalCount: 0
          };
          existing.testAmount = item.totalAmount;
          existing.testCount = item.count;
          existing.totalAmount += item.totalAmount;
          existing.totalCount += item.count;
          paymentModeMap.set(paymentMode, existing);
        });

        const collections = Array.from(paymentModeMap.values());
        const totalCollection = collections.reduce((sum, item) => sum + item.totalAmount, 0);
        const totalExpenses = expensesTotal[0]?.totalExpenses || 0;

        res.json({
          success: true,
          data: {
            date: date || new Date().toISOString().split('T')[0],
            branchId: branchFilter.branchId || 'ALL',
            collections,
            summary: {
              totalCollection,
              totalExpenses,
              netCollection: totalCollection - totalExpenses,
              transactionCount: collections.reduce((sum, item) => sum + item.totalCount, 0)
            }
          }
        });
      }

    } catch (error) {
      logger.error('Error getting daily collection:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get daily collection data'
      });
    }
  }

  static async getPaymentSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { branchId, startDate, endDate, paymentMode } = req.query;
      const user = req.user;

      // Date filtering
      let dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        };
      } else {
        // Default to last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        dateFilter = {
          createdAt: { $gte: thirtyDaysAgo }
        };
      }

      // Branch filtering
      const branchFilter: any = {};
      const isAdmin = user?.role === 'ADMIN';
      
      if (!isAdmin) {
        branchFilter.branchId = user?.branchId;
      } else if (branchId) {
        branchFilter.branchId = branchId;
      }

      // Payment mode filtering
      const paymentFilter: any = {};
      if (paymentMode) {
        paymentFilter.paymentMode = paymentMode;
      }

      // For admin users, group by branch; for others, group by payment mode and status only
      const groupBy = isAdmin && !branchId ? 
        { branchId: '$branchId', paymentMode: '$paymentMode', paymentStatus: '$paymentStatus' } : 
        { paymentMode: '$paymentMode', paymentStatus: '$paymentStatus' };

      // Get payment summary from visits
      const visitPayments = await PatientVisit.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter,
            ...paymentFilter,
            paymentStatus: { $ne: PaymentStatus.PENDING }
          }
        },
        {
          $group: {
            _id: groupBy,
            totalAmount: { $sum: '$consultationFee' },
            count: { $sum: 1 }
          }
        }
      ]);

      // Get payment summary from test orders
      const testPayments = await TestOrder.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter,
            ...paymentFilter,
            paymentStatus: { $ne: PaymentStatus.PENDING }
          }
        },
        {
          $group: {
            _id: groupBy,
            totalAmount: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        }
      ]);

      if (isAdmin && !branchId) {
        // Return branch-wise data for admin
        const branchDataMap = new Map();

        // Process visit payments
        [...visitPayments, ...testPayments].forEach(item => {
          const branchId = item._id.branchId;
          const paymentMode = item._id.paymentMode;
          const paymentStatus = item._id.paymentStatus;
          const key = `${paymentMode}_${paymentStatus}`;

          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              paymentSummary: new Map(),
              totalAmount: 0,
              totalCount: 0
            });
          }

          const branchData = branchDataMap.get(branchId);
          const existing = branchData.paymentSummary.get(key) || {
            paymentMode,
            paymentStatus,
            totalAmount: 0,
            count: 0
          };

          existing.totalAmount += item.totalAmount;
          existing.count += item.count;
          branchData.paymentSummary.set(key, existing);
          branchData.totalAmount += item.totalAmount;
          branchData.totalCount += item.count;
        });

        // Format response for branch-wise data
        const branchWiseData = Array.from(branchDataMap.values()).map(branch => ({
          branchId: branch.branchId,
          paymentSummary: Array.from(branch.paymentSummary.values()),
          summary: {
            totalAmount: branch.totalAmount,
            totalCount: branch.totalCount
          }
        }));

        const grandTotal = {
          totalAmount: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalAmount, 0),
          totalCount: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalCount, 0)
        };

        res.json({
          success: true,
          data: {
            type: 'branch-wise',
            branches: branchWiseData,
            grandTotal,
            period: {
              startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              endDate: endDate || new Date().toISOString().split('T')[0]
            }
          }
        });

      } else {
        // Original logic for single branch or non-admin users
        const paymentSummary = [...visitPayments, ...testPayments].reduce((acc, item) => {
          const paymentMode = typeof item._id === 'object' ? item._id.paymentMode : item._id;
          const paymentStatus = typeof item._id === 'object' ? item._id.paymentStatus : item._id;
          const key = `${paymentMode}_${paymentStatus}`;
          
          if (!acc[key]) {
            acc[key] = {
              paymentMode,
              paymentStatus,
              totalAmount: 0,
              count: 0
            };
          }
          acc[key].totalAmount += item.totalAmount;
          acc[key].count += item.count;
          return acc;
        }, {} as any);

        res.json({
          success: true,
          data: {
            paymentSummary: Object.values(paymentSummary),
            period: {
              startDate: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              endDate: endDate || new Date().toISOString().split('T')[0]
            }
          }
        });
      }

    } catch (error) {
      logger.error('Error getting payment summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payment summary'
      });
    }
  }

  static async getOutstandingDues(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { branchId, patientId, limit = 50, offset = 0 } = req.query;
      const user = req.user;

      // Branch filtering
      const branchFilter: any = {};
      const isAdmin = user?.role === 'ADMIN';
      
      if (!isAdmin) {
        branchFilter.branchId = user?.branchId;
      } else if (branchId) {
        branchFilter.branchId = branchId;
      }

      // Patient filtering
      const patientFilter: any = {};
      if (patientId) {
        patientFilter.patientId = patientId;
      }

      if (isAdmin && !branchId) {
        // Return branch-wise data for admin
        const visitAmountByBranch = await PatientVisit.aggregate([
          {
            $match: {
              ...patientFilter,
              paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
            }
          },
          {
            $group: {
              _id: '$branchId',
              totalAmount: { $sum: '$consultationFee' },
              count: { $sum: 1 }
            }
          }
        ]);

        const testAmountByBranch = await TestOrder.aggregate([
          {
            $match: {
              ...patientFilter,
              paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
            }
          },
          {
            $group: {
              _id: '$branchId',
              totalAmount: { $sum: '$totalAmount' },
              count: { $sum: 1 }
            }
          }
        ]);

        // Get sample records for each branch (limited for performance)
        const visitsByBranch = await PatientVisit.aggregate([
          {
            $match: {
              ...patientFilter,
              paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
            }
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: '$branchId',
              visits: { $push: '$$ROOT' }
            }
          },
          {
            $project: {
              _id: 1,
              visits: { $slice: ['$visits', Number(limit)] }
            }
          }
        ]);

        const testsByBranch = await TestOrder.aggregate([
          {
            $match: {
              ...patientFilter,
              paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
            }
          },
          { $sort: { createdAt: -1 } },
          {
            $group: {
              _id: '$branchId',
              tests: { $push: '$$ROOT' }
            }
          },
          {
            $project: {
              _id: 1,
              tests: { $slice: ['$tests', Number(limit)] }
            }
          }
        ]);

        // Combine branch data
        const branchDataMap = new Map();

        visitAmountByBranch.forEach(item => {
          const branchId = item._id;
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              outstandingVisits: [],
              outstandingTests: [],
              summary: {
                totalVisitsDue: 0,
                totalTestsDue: 0,
                totalVisitAmount: 0,
                totalTestAmount: 0,
                grandTotal: 0
              }
            });
          }
          const branchData = branchDataMap.get(branchId);
          branchData.summary.totalVisitsDue = item.count;
          branchData.summary.totalVisitAmount = item.totalAmount;
          branchData.summary.grandTotal += item.totalAmount;
        });

        testAmountByBranch.forEach(item => {
          const branchId = item._id;
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              outstandingVisits: [],
              outstandingTests: [],
              summary: {
                totalVisitsDue: 0,
                totalTestsDue: 0,
                totalVisitAmount: 0,
                totalTestAmount: 0,
                grandTotal: 0
              }
            });
          }
          const branchData = branchDataMap.get(branchId);
          branchData.summary.totalTestsDue = item.count;
          branchData.summary.totalTestAmount = item.totalAmount;
          branchData.summary.grandTotal += item.totalAmount;
        });

        // Add sample records
        visitsByBranch.forEach(item => {
          if (branchDataMap.has(item._id)) {
            branchDataMap.get(item._id).outstandingVisits = item.visits;
          }
        });

        testsByBranch.forEach(item => {
          if (branchDataMap.has(item._id)) {
            branchDataMap.get(item._id).outstandingTests = item.tests;
          }
        });

        const branchWiseData = Array.from(branchDataMap.values());
        const grandTotal = {
          totalVisitsDue: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalVisitsDue, 0),
          totalTestsDue: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalTestsDue, 0),
          totalVisitAmount: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalVisitAmount, 0),
          totalTestAmount: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalTestAmount, 0),
          grandTotal: branchWiseData.reduce((sum, branch) => sum + branch.summary.grandTotal, 0)
        };

        res.json({
          success: true,
          data: {
            type: 'branch-wise',
            branches: branchWiseData,
            grandTotal,
            pagination: {
              limit: Number(limit),
              offset: Number(offset),
              note: 'Sample records shown per branch due to branch-wise grouping'
            }
          }
        });

      } else {
        // Original logic for single branch or non-admin users
        const outstandingVisits = await PatientVisit.find({
          ...branchFilter,
          ...patientFilter,
          paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
        })
        .populate('doctorId', 'name specialization')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset));

        const outstandingTests = await TestOrder.find({
          ...branchFilter,
          ...patientFilter,
          paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
        })
        .populate('referringDoctorId', 'name specialization')
        .populate('createdBy', 'name')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(offset));

        // Calculate totals
        const totalOutstandingVisits = await PatientVisit.countDocuments({
          ...branchFilter,
          ...patientFilter,
          paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
        });

        const totalOutstandingTests = await TestOrder.countDocuments({
          ...branchFilter,
          ...patientFilter,
          paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
        });

        // Calculate amount totals
        const visitAmountTotal = await PatientVisit.aggregate([
          {
            $match: {
              ...branchFilter,
              ...patientFilter,
              paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
            }
          },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$consultationFee' }
            }
          }
        ]);

        const testAmountTotal = await TestOrder.aggregate([
          {
            $match: {
              ...branchFilter,
              ...patientFilter,
              paymentStatus: { $in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] }
            }
          },
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$totalAmount' }
            }
          }
        ]);

        res.json({
          success: true,
          data: {
            outstandingVisits,
            outstandingTests,
            summary: {
              totalVisitsDue: totalOutstandingVisits,
              totalTestsDue: totalOutstandingTests,
              totalVisitAmount: visitAmountTotal[0]?.totalAmount || 0,
              totalTestAmount: testAmountTotal[0]?.totalAmount || 0,
              grandTotal: (visitAmountTotal[0]?.totalAmount || 0) + (testAmountTotal[0]?.totalAmount || 0)
            },
            pagination: {
              limit: Number(limit),
              offset: Number(offset),
              total: totalOutstandingVisits + totalOutstandingTests
            }
          }
        });
      }

    } catch (error) {
      logger.error('Error getting outstanding dues:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get outstanding dues'
      });
    }
  }

  static async getRevenueAnalytics(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { branchId, period = 'monthly', startDate, endDate } = req.query;
      const user = req.user;

      // Branch filtering
      const branchFilter: any = {};
      const isAdmin = user?.role === 'ADMIN';
      
      if (!isAdmin) {
        branchFilter.branchId = user?.branchId;
      } else if (branchId) {
        branchFilter.branchId = branchId;
      }

      // Date filtering based on period
      let dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        };
      } else {
        const now = new Date();
        switch (period) {
          case 'daily':
            dateFilter = {
              createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7) }
            };
            break;
          case 'weekly':
            dateFilter = {
              createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 28) }
            };
            break;
          case 'monthly':
            dateFilter = {
              createdAt: { $gte: new Date(now.getFullYear(), now.getMonth() - 12, 1) }
            };
            break;
          case 'yearly':
            dateFilter = {
              createdAt: { $gte: new Date(now.getFullYear() - 5, 0, 1) }
            };
            break;
        }
      }

      // Group by format based on period
      let groupFormat: any;
      switch (period) {
        case 'daily':
          groupFormat = {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          };
          break;
        case 'weekly':
          groupFormat = {
            year: { $year: '$createdAt' },
            week: { $week: '$createdAt' }
          };
          break;
        case 'monthly':
          groupFormat = {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          };
          break;
        case 'yearly':
          groupFormat = {
            year: { $year: '$createdAt' }
          };
          break;
      }

      // For admin users, group by branch as well
      const finalGroupFormat = isAdmin && !branchId ? 
        { ...groupFormat, branchId: '$branchId' } : 
        groupFormat;

      // Get revenue from consultations
      const consultationRevenue = await PatientVisit.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter,
            paymentStatus: PaymentStatus.PAID
          }
        },
        {
          $group: {
            _id: finalGroupFormat,
            revenue: { $sum: '$consultationFee' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1, '_id.branchId': 1 } }
      ]);

      // Get revenue from tests
      const testRevenue = await TestOrder.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter,
            paymentStatus: PaymentStatus.PAID
          }
        },
        {
          $group: {
            _id: finalGroupFormat,
            revenue: { $sum: '$totalAmount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1, '_id.branchId': 1 } }
      ]);

      // Get expenses
      const expenses = await Expense.aggregate([
        {
          $match: {
            ...dateFilter,
            ...branchFilter
          }
        },
        {
          $group: {
            _id: finalGroupFormat,
            expenses: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1, '_id.branchId': 1 } }
      ]);

      if (isAdmin && !branchId) {
        // Return branch-wise analytics for admin
        const branchDataMap = new Map();

        // Process consultation revenue
        consultationRevenue.forEach(item => {
          const branchId = item._id.branchId;
          const periodKey = JSON.stringify({
            year: item._id.year,
            month: item._id.month,
            day: item._id.day,
            week: item._id.week
          });

          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              analytics: new Map(),
              totalSummary: {
                totalRevenue: 0,
                totalExpenses: 0,
                netRevenue: 0
              }
            });
          }

          const branchData = branchDataMap.get(branchId);
          const existing = branchData.analytics.get(periodKey) || {
            period: {
              year: item._id.year,
              month: item._id.month,
              day: item._id.day,
              week: item._id.week
            },
            consultationRevenue: 0,
            consultationCount: 0,
            testRevenue: 0,
            testCount: 0,
            totalRevenue: 0,
            expenses: 0,
            netRevenue: 0
          };

          existing.consultationRevenue = item.revenue;
          existing.consultationCount = item.count;
          existing.totalRevenue += item.revenue;
          existing.netRevenue += item.revenue;
          branchData.analytics.set(periodKey, existing);
          branchData.totalSummary.totalRevenue += item.revenue;
          branchData.totalSummary.netRevenue += item.revenue;
        });

        // Process test revenue
        testRevenue.forEach(item => {
          const branchId = item._id.branchId;
          const periodKey = JSON.stringify({
            year: item._id.year,
            month: item._id.month,
            day: item._id.day,
            week: item._id.week
          });

          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              analytics: new Map(),
              totalSummary: {
                totalRevenue: 0,
                totalExpenses: 0,
                netRevenue: 0
              }
            });
          }

          const branchData = branchDataMap.get(branchId);
          const existing = branchData.analytics.get(periodKey) || {
            period: {
              year: item._id.year,
              month: item._id.month,
              day: item._id.day,
              week: item._id.week
            },
            consultationRevenue: 0,
            consultationCount: 0,
            testRevenue: 0,
            testCount: 0,
            totalRevenue: 0,
            expenses: 0,
            netRevenue: 0
          };

          existing.testRevenue = item.revenue;
          existing.testCount = item.count;
          existing.totalRevenue += item.revenue;
          existing.netRevenue += item.revenue;
          branchData.analytics.set(periodKey, existing);
          branchData.totalSummary.totalRevenue += item.revenue;
          branchData.totalSummary.netRevenue += item.revenue;
        });

        // Process expenses
        expenses.forEach(item => {
          const branchId = item._id.branchId;
          const periodKey = JSON.stringify({
            year: item._id.year,
            month: item._id.month,
            day: item._id.day,
            week: item._id.week
          });

          if (branchDataMap.has(branchId)) {
            const branchData = branchDataMap.get(branchId);
            const existing = branchData.analytics.get(periodKey);
            if (existing) {
              existing.expenses = item.expenses;
              existing.netRevenue = existing.totalRevenue - item.expenses;
              branchData.totalSummary.totalExpenses += item.expenses;
              branchData.totalSummary.netRevenue = branchData.totalSummary.totalRevenue - branchData.totalSummary.totalExpenses;
            }
          }
        });

        // Format response for branch-wise data
        const branchWiseData = Array.from(branchDataMap.values()).map(branch => ({
          branchId: branch.branchId,
          analytics: Array.from(branch.analytics.values()).sort((a: any, b: any) => {
            if (a.period.year !== b.period.year) return a.period.year - b.period.year;
            if (a.period.month && b.period.month && a.period.month !== b.period.month) return a.period.month - b.period.month;
            if (a.period.day && b.period.day) return a.period.day - b.period.day;
            if (a.period.week && b.period.week) return a.period.week - b.period.week;
            return 0;
          }),
          totalSummary: branch.totalSummary
        }));

        const grandTotal = {
          totalRevenue: branchWiseData.reduce((sum, branch) => sum + branch.totalSummary.totalRevenue, 0),
          totalExpenses: branchWiseData.reduce((sum, branch) => sum + branch.totalSummary.totalExpenses, 0),
          netRevenue: branchWiseData.reduce((sum, branch) => sum + branch.totalSummary.netRevenue, 0)
        };

        res.json({
          success: true,
          data: {
            type: 'branch-wise',
            branches: branchWiseData,
            period: period as string,
            grandTotal
          }
        });

      } else {
        // Original logic for single branch or non-admin users
        const revenueMap = new Map();
        
        consultationRevenue.forEach(item => {
          const key = JSON.stringify(item._id);
          revenueMap.set(key, {
            period: item._id,
            consultationRevenue: item.revenue,
            consultationCount: item.count,
            testRevenue: 0,
            testCount: 0,
            totalRevenue: item.revenue,
            expenses: 0,
            netRevenue: item.revenue
          });
        });

        testRevenue.forEach(item => {
          const key = JSON.stringify(item._id);
          const existing = revenueMap.get(key) || {
            period: item._id,
            consultationRevenue: 0,
            consultationCount: 0,
            testRevenue: 0,
            testCount: 0,
            totalRevenue: 0,
            expenses: 0,
            netRevenue: 0
          };
          existing.testRevenue = item.revenue;
          existing.testCount = item.count;
          existing.totalRevenue += item.revenue;
          existing.netRevenue += item.revenue;
          revenueMap.set(key, existing);
        });

        expenses.forEach(item => {
          const key = JSON.stringify(item._id);
          const existing = revenueMap.get(key);
          if (existing) {
            existing.expenses = item.expenses;
            existing.netRevenue = existing.totalRevenue - item.expenses;
          }
        });

        const analytics = Array.from(revenueMap.values()).sort((a, b) => {
          // Sort by year, then month, then day/week
          if (a.period.year !== b.period.year) return a.period.year - b.period.year;
          if (a.period.month && b.period.month && a.period.month !== b.period.month) return a.period.month - b.period.month;
          if (a.period.day && b.period.day) return a.period.day - b.period.day;
          if (a.period.week && b.period.week) return a.period.week - b.period.week;
          return 0;
        });

        res.json({
          success: true,
          data: {
            analytics,
            period: period as string,
            totalSummary: {
              totalRevenue: analytics.reduce((sum, item) => sum + item.totalRevenue, 0),
              totalExpenses: analytics.reduce((sum, item) => sum + item.expenses, 0),
              netRevenue: analytics.reduce((sum, item) => sum + item.netRevenue, 0)
            }
          }
        });
      }

    } catch (error) {
      logger.error('Error getting revenue analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get revenue analytics'
      });
    }
  }

  static async getCommissionSummary(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { branchId, doctorId, startDate, endDate, paymentStatus } = req.query;
      const user = req.user;

      // Branch filtering
      const branchFilter: any = {};
      const isAdmin = user?.role === 'ADMIN';
      
      if (!isAdmin) {
        branchFilter.branchId = user?.branchId;
      } else if (branchId) {
        branchFilter.branchId = branchId;
      }

      // Date filtering
      let dateFilter: any = {};
      if (startDate && endDate) {
        const endOfDay = new Date(endDate as string);
        endOfDay.setHours(23, 59, 59, 999);
        dateFilter = {
          calculatedDate: {
            $gte: new Date(startDate as string),
            $lte: endOfDay
          }
        };
      }

      // Doctor filtering
      const doctorFilter: any = {};
      if (doctorId) {
        doctorFilter.doctorId = doctorId;
      }

      // Payment status filtering
      const statusFilter: any = {};
      if (paymentStatus) {
        statusFilter.paymentStatus = paymentStatus;
      }

      if (isAdmin && !branchId) {
        // Return branch-wise data for admin
        const commissionSummary = await Commission.aggregate([
          {
            $match: {
              ...dateFilter,
              ...doctorFilter,
              ...statusFilter
            }
          },
          {
            $lookup: {
              from: 'doctors',
              localField: 'doctorId',
              foreignField: '_id',
              as: 'doctor'
            }
          },
          {
            $unwind: '$doctor'
          },
          {
            $group: {
              _id: {
                branchId: '$branchId',
                doctorId: '$doctorId',
                doctorName: '$doctor.name',
                paymentStatus: '$paymentStatus'
              },
              totalCommission: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          {
            $group: {
              _id: {
                branchId: '$_id.branchId',
                doctorId: '$_id.doctorId',
                doctorName: '$_id.doctorName'
              },
              commissionBreakdown: {
                $push: {
                  paymentStatus: '$_id.paymentStatus',
                  amount: '$totalCommission',
                  count: '$count'
                }
              },
              totalCommission: { $sum: '$totalCommission' }
            }
          },
          { $sort: { '_id.branchId': 1, totalCommission: -1 } }
        ]);

        // Group by branch
        const branchDataMap = new Map();
        
        commissionSummary.forEach(item => {
          const branchId = item._id.branchId;
          
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              commissionSummary: [],
              totalCommission: 0,
              totalTransactions: 0
            });
          }

          const branchData = branchDataMap.get(branchId);
          branchData.commissionSummary.push({
            doctorId: item._id.doctorId,
            doctorName: item._id.doctorName,
            commissionBreakdown: item.commissionBreakdown,
            totalCommission: item.totalCommission
          });
          
          branchData.totalCommission += item.totalCommission;
          branchData.totalTransactions += item.commissionBreakdown.reduce((sum: number, breakdown: any) => sum + breakdown.count, 0);
        });

        const branchWiseData = Array.from(branchDataMap.values());
        const grandTotal = {
          totalCommission: branchWiseData.reduce((sum, branch) => sum + branch.totalCommission, 0),
          totalTransactions: branchWiseData.reduce((sum, branch) => sum + branch.totalTransactions, 0)
        };

        res.json({
          success: true,
          data: {
            type: 'branch-wise',
            branches: branchWiseData,
            grandTotal,
            period: {
              startDate: startDate || null,
              endDate: endDate || null
            }
          }
        });

      } else {
        // Original logic for single branch or non-admin users
        const commissionSummary = await Commission.aggregate([
          {
            $match: {
              ...dateFilter,
              ...branchFilter,
              ...doctorFilter,
              ...statusFilter
            }
          },
          {
            $lookup: {
              from: 'doctors',
              localField: 'doctorId',
              foreignField: '_id',
              as: 'doctor'
            }
          },
          {
            $unwind: '$doctor'
          },
          {
            $group: {
              _id: {
                doctorId: '$doctorId',
                doctorName: '$doctor.name',
                paymentStatus: '$paymentStatus'
              },
              totalCommission: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          {
            $group: {
              _id: {
                doctorId: '$_id.doctorId',
                doctorName: '$_id.doctorName'
              },
              commissionBreakdown: {
                $push: {
                  paymentStatus: '$_id.paymentStatus',
                  amount: '$totalCommission',
                  count: '$count'
                }
              },
              totalCommission: { $sum: '$totalCommission' }
            }
          },
          { $sort: { totalCommission: -1 } }
        ]);

        res.json({
          success: true,
          data: {
            commissionSummary,
            period: {
              startDate: startDate || null,
              endDate: endDate || null
            }
          }
        });
      }

    } catch (error) {
      logger.error('Error getting commission summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get commission summary'
      });
    }
  }

  static async getTestRevenue(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { branchId, testCategory, startDate, endDate } = req.query;
      const user = req.user;

      // Branch filtering
      const branchFilter: any = {};
      const isAdmin = user?.role === 'ADMIN';
      
      if (!isAdmin) {
        branchFilter.branchId = user?.branchId;
      } else if (branchId) {
        branchFilter.branchId = branchId;
      }

      // Date filtering
      let dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter = {
          createdAt: {
            $gte: new Date(startDate as string),
            $lte: new Date(endDate as string)
          }
        };
      }

      if (isAdmin && !branchId) {
        // Return branch-wise data for admin
        const testRevenue = await TestOrder.aggregate([
          {
            $match: {
              ...dateFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          { $unwind: '$tests' },
          {
            $lookup: {
              from: 'tests',
              localField: 'tests.testId',
              foreignField: '_id',
              as: 'testDetails'
            }
          },
          { $unwind: '$testDetails' },
          ...(testCategory ? [{ $match: { 'testDetails.category': testCategory } }] : []),
          {
            $group: {
              _id: {
                branchId: '$branchId',
                testId: '$testDetails._id',
                testName: '$testDetails.testName',
                category: '$testDetails.category'
              },
              totalRevenue: { $sum: '$tests.price' },
              totalCommission: { $sum: { $multiply: ['$tests.price', { $divide: ['$testDetails.commissionRate', 100] }] } },
              orderCount: { $sum: 1 }
            }
          },
          { $sort: { '_id.branchId': 1, totalRevenue: -1 } }
        ]);

        const categoryRevenue = await TestOrder.aggregate([
          {
            $match: {
              ...dateFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          { $unwind: '$tests' },
          {
            $lookup: {
              from: 'tests',
              localField: 'tests.testId',
              foreignField: '_id',
              as: 'testDetails'
            }
          },
          { $unwind: '$testDetails' },
          ...(testCategory ? [{ $match: { 'testDetails.category': testCategory } }] : []),
          {
            $group: {
              _id: {
                branchId: '$branchId',
                category: '$testDetails.category'
              },
              totalRevenue: { $sum: '$tests.price' },
              orderCount: { $sum: 1 }
            }
          },
          { $sort: { '_id.branchId': 1, totalRevenue: -1 } }
        ]);

        // Group by branch
        const branchDataMap = new Map();

        // Process test revenue
        testRevenue.forEach(item => {
          const branchId = item._id.branchId;
          
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              testRevenue: [],
              categoryRevenue: [],
              summary: {
                totalRevenue: 0,
                totalCommission: 0,
                totalOrders: 0
              }
            });
          }

          const branchData = branchDataMap.get(branchId);
          branchData.testRevenue.push({
            testId: item._id.testId,
            testName: item._id.testName,
            category: item._id.category,
            totalRevenue: item.totalRevenue,
            totalCommission: item.totalCommission,
            orderCount: item.orderCount
          });

          branchData.summary.totalRevenue += item.totalRevenue;
          branchData.summary.totalCommission += item.totalCommission;
          branchData.summary.totalOrders += item.orderCount;
        });

        // Process category revenue
        categoryRevenue.forEach(item => {
          const branchId = item._id.branchId;
          
          if (branchDataMap.has(branchId)) {
            const branchData = branchDataMap.get(branchId);
            branchData.categoryRevenue.push({
              category: item._id.category,
              totalRevenue: item.totalRevenue,
              orderCount: item.orderCount
            });
          }
        });

        const branchWiseData = Array.from(branchDataMap.values());
        const grandTotal = {
          totalRevenue: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalRevenue, 0),
          totalCommission: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalCommission, 0),
          totalOrders: branchWiseData.reduce((sum, branch) => sum + branch.summary.totalOrders, 0)
        };

        res.json({
          success: true,
          data: {
            type: 'branch-wise',
            branches: branchWiseData,
            grandTotal,
            period: {
              startDate: startDate || null,
              endDate: endDate || null
            },
            filter: {
              testCategory: testCategory || 'ALL'
            }
          }
        });

      } else {
        // Original logic for single branch or non-admin users
        const testRevenue = await TestOrder.aggregate([
          {
            $match: {
              ...dateFilter,
              ...branchFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          { $unwind: '$tests' },
          {
            $lookup: {
              from: 'tests',
              localField: 'tests.testId',
              foreignField: '_id',
              as: 'testDetails'
            }
          },
          { $unwind: '$testDetails' },
          ...(testCategory ? [{ $match: { 'testDetails.category': testCategory } }] : []),
          {
            $group: {
              _id: {
                testId: '$testDetails._id',
                testName: '$testDetails.testName',
                category: '$testDetails.category'
              },
              totalRevenue: { $sum: '$tests.price' },
              totalCommission: { $sum: { $multiply: ['$tests.price', { $divide: ['$testDetails.commissionRate', 100] }] } },
              orderCount: { $sum: 1 }
            }
          },
          { $sort: { totalRevenue: -1 } }
        ]);

        // Get category-wise summary
        const categoryRevenue = await TestOrder.aggregate([
          {
            $match: {
              ...dateFilter,
              ...branchFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          { $unwind: '$tests' },
          {
            $lookup: {
              from: 'tests',
              localField: 'tests.testId',
              foreignField: '_id',
              as: 'testDetails'
            }
          },
          { $unwind: '$testDetails' },
          ...(testCategory ? [{ $match: { 'testDetails.category': testCategory } }] : []),
          {
            $group: {
              _id: '$testDetails.category',
              totalRevenue: { $sum: '$tests.price' },
              orderCount: { $sum: 1 }
            }
          },
          { $sort: { totalRevenue: -1 } }
        ]);

        res.json({
          success: true,
          data: {
            testRevenue,
            categoryRevenue,
            period: {
              startDate: startDate || null,
              endDate: endDate || null
            },
            filter: {
              testCategory: testCategory || 'ALL'
            }
          }
        });
      }

    } catch (error) {
      logger.error('Error getting test revenue:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get test revenue'
      });
    }
  }

  static async getFinancialStatement(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { branchId, month, year } = req.query;
      const user = req.user;

      if (!month || !year) {
        res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
        return;
      }

      // Branch filtering
      const branchFilter: any = {};
      const isAdmin = user?.role === 'ADMIN';
      
      if (!isAdmin) {
        branchFilter.branchId = user?.branchId;
      } else if (branchId) {
        branchFilter.branchId = branchId;
      }

      // Month date filter
      const startDate = new Date(Number(year), Number(month) - 1, 1);
      const endDate = new Date(Number(year), Number(month), 0, 23, 59, 59, 999);
      
      const dateFilter = {
        createdAt: { $gte: startDate, $lte: endDate }
      };

      if (isAdmin && !branchId) {
        // Return branch-wise data for admin
        const consultationRevenue = await PatientVisit.aggregate([
          {
            $match: {
              ...dateFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          {
            $group: {
              _id: '$branchId',
              totalRevenue: { $sum: '$consultationFee' },
              count: { $sum: 1 }
            }
          }
        ]);

        const testRevenue = await TestOrder.aggregate([
          {
            $match: {
              ...dateFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          {
            $group: {
              _id: '$branchId',
              totalRevenue: { $sum: '$totalAmount' },
              count: { $sum: 1 }
            }
          }
        ]);

        const commissionsPaid = await Commission.aggregate([
          {
            $match: {
              calculatedDate: { $gte: startDate, $lte: endDate },
              paymentStatus: PaymentStatus.PAID
            }
          },
          {
            $group: {
              _id: '$branchId',
              totalCommissions: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ]);

        const expensesByBranchAndCategory = await Expense.aggregate([
          {
            $match: {
              date: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: {
                branchId: '$branchId',
                category: '$category'
              },
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          { $sort: { '_id.branchId': 1, totalAmount: -1 } }
        ]);

        // Group by branch
        const branchDataMap = new Map();

        // Process consultation revenue
        consultationRevenue.forEach(item => {
          const branchId = item._id;
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              revenue: {
                consultations: { amount: 0, count: 0 },
                tests: { amount: 0, count: 0 },
                total: 0
              },
              expenses: {
                byCategory: [],
                total: 0
              },
              commissions: {
                paid: 0,
                count: 0
              },
              netIncome: 0,
              profitMargin: 0
            });
          }
          const branchData = branchDataMap.get(branchId);
          branchData.revenue.consultations.amount = item.totalRevenue;
          branchData.revenue.consultations.count = item.count;
          branchData.revenue.total += item.totalRevenue;
        });

        // Process test revenue
        testRevenue.forEach(item => {
          const branchId = item._id;
          if (!branchDataMap.has(branchId)) {
            branchDataMap.set(branchId, {
              branchId,
              revenue: {
                consultations: { amount: 0, count: 0 },
                tests: { amount: 0, count: 0 },
                total: 0
              },
              expenses: {
                byCategory: [],
                total: 0
              },
              commissions: {
                paid: 0,
                count: 0
              },
              netIncome: 0,
              profitMargin: 0
            });
          }
          const branchData = branchDataMap.get(branchId);
          branchData.revenue.tests.amount = item.totalRevenue;
          branchData.revenue.tests.count = item.count;
          branchData.revenue.total += item.totalRevenue;
        });

        // Process commissions
        commissionsPaid.forEach(item => {
          const branchId = item._id;
          if (branchDataMap.has(branchId)) {
            const branchData = branchDataMap.get(branchId);
            branchData.commissions.paid = item.totalCommissions;
            branchData.commissions.count = item.count;
          }
        });

        // Process expenses by category
        const expensesByCategoryMap = new Map();
        expensesByBranchAndCategory.forEach(item => {
          const branchId = item._id.branchId;
          const category = item._id.category;

          if (!expensesByCategoryMap.has(branchId)) {
            expensesByCategoryMap.set(branchId, new Map());
          }

          expensesByCategoryMap.get(branchId).set(category, {
            _id: category,
            totalAmount: item.totalAmount,
            count: item.count
          });

          if (branchDataMap.has(branchId)) {
            branchDataMap.get(branchId).expenses.total += item.totalAmount;
          }
        });

        // Finalize branch data
        branchDataMap.forEach((branchData, branchId) => {
          if (expensesByCategoryMap.has(branchId)) {
            branchData.expenses.byCategory = Array.from(expensesByCategoryMap.get(branchId).values());
          }
          
          branchData.netIncome = branchData.revenue.total - branchData.expenses.total - branchData.commissions.paid;
          branchData.profitMargin = branchData.revenue.total > 0 ? 
            ((branchData.netIncome / branchData.revenue.total) * 100).toFixed(2) : 0;
        });

        const branchWiseData = Array.from(branchDataMap.values());
        const grandTotal = {
          revenue: {
            consultations: {
              amount: branchWiseData.reduce((sum, branch) => sum + branch.revenue.consultations.amount, 0),
              count: branchWiseData.reduce((sum, branch) => sum + branch.revenue.consultations.count, 0)
            },
            tests: {
              amount: branchWiseData.reduce((sum, branch) => sum + branch.revenue.tests.amount, 0),
              count: branchWiseData.reduce((sum, branch) => sum + branch.revenue.tests.count, 0)
            },
            total: branchWiseData.reduce((sum, branch) => sum + branch.revenue.total, 0)
          },
          expenses: {
            total: branchWiseData.reduce((sum, branch) => sum + branch.expenses.total, 0)
          },
          commissions: {
            paid: branchWiseData.reduce((sum, branch) => sum + branch.commissions.paid, 0),
            count: branchWiseData.reduce((sum, branch) => sum + branch.commissions.count, 0)
          },
          netIncome: branchWiseData.reduce((sum, branch) => sum + branch.netIncome, 0)
        };

        grandTotal.revenue.total = grandTotal.revenue.consultations.amount + grandTotal.revenue.tests.amount;
        const grandTotalProfitMargin = grandTotal.revenue.total > 0 ? 
          ((grandTotal.netIncome / grandTotal.revenue.total) * 100).toFixed(2) : 0;

        res.json({
          success: true,
          data: {
            month: Number(month),
            year: Number(year),
            type: 'branch-wise',
            branches: branchWiseData,
            grandTotal: {
              ...grandTotal,
              profitMargin: grandTotalProfitMargin
            }
          }
        });

      } else {
        // Original logic for single branch or non-admin users
        const consultationRevenue = await PatientVisit.aggregate([
          {
            $match: {
              ...dateFilter,
              ...branchFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$consultationFee' },
              count: { $sum: 1 }
            }
          }
        ]);

        const testRevenue = await TestOrder.aggregate([
          {
            $match: {
              ...dateFilter,
              ...branchFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$totalAmount' },
              count: { $sum: 1 }
            }
          }
        ]);

        const commissionsPaid = await Commission.aggregate([
          {
            $match: {
              calculatedDate: { $gte: startDate, $lte: endDate },
              ...branchFilter,
              paymentStatus: PaymentStatus.PAID
            }
          },
          {
            $group: {
              _id: null,
              totalCommissions: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ]);

        const expensesByCategory = await Expense.aggregate([
          {
            $match: {
              date: { $gte: startDate, $lte: endDate },
              ...branchFilter
            }
          },
          {
            $group: {
              _id: '$category',
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          },
          { $sort: { totalAmount: -1 } }
        ]);

        const totalExpenses = expensesByCategory.reduce((sum, exp) => sum + exp.totalAmount, 0);
        const totalRevenue = (consultationRevenue[0]?.totalRevenue || 0) + (testRevenue[0]?.totalRevenue || 0);
        const totalCommissions = commissionsPaid[0]?.totalCommissions || 0;
        const netIncome = totalRevenue - totalExpenses - totalCommissions;

        res.json({
          success: true,
          data: {
            month: Number(month),
            year: Number(year),
            branchId: branchFilter.branchId || 'ALL',
            revenue: {
              consultations: {
                amount: consultationRevenue[0]?.totalRevenue || 0,
                count: consultationRevenue[0]?.count || 0
              },
              tests: {
                amount: testRevenue[0]?.totalRevenue || 0,
                count: testRevenue[0]?.count || 0
              },
              total: totalRevenue
            },
            expenses: {
              byCategory: expensesByCategory,
              total: totalExpenses
            },
            commissions: {
              paid: totalCommissions,
              count: commissionsPaid[0]?.count || 0
            },
            netIncome,
            profitMargin: totalRevenue > 0 ? ((netIncome / totalRevenue) * 100).toFixed(2) : 0
          }
        });
      }

    } catch (error) {
      logger.error('Error getting financial statement:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get financial statement'
      });
    }
  }
}