import { Commission, TestOrder, Doctor } from '../models';
import { CommissionHelper, ResponseHelper } from '../utils/helpers';
import { logger } from '../utils/logger';
import { EmailService } from './email.service';
import { CommissionType, PaymentStatus } from '../types';

export class CommissionService {
  static async calculateCommission(orderId: string): Promise<any> {
    try {
      const order = await TestOrder.findById(orderId)
        .populate('referringDoctorId', 'name email')
        .populate('tests.testId', 'commissionRate');

      if (!order) {
        return ResponseHelper.error('Order not found', 404);
      }

      const doctor = order.referringDoctorId as any;
      
      // Check if there's a referring doctor
      if (!doctor) {
        return ResponseHelper.error('No referring doctor found for commission calculation', 400);
      }
      
      let totalCommission = 0;
      let totalAmount = 0;
      let commissionRateSum = 0;
      let validTestsCount = 0;

      // Calculate commission for each test
      for (const test of order.tests) {
        const testData = test.testId as any;
        if (testData && testData.commissionRate >= 0 && testData.commissionRate <= 100) {
          totalCommission += CommissionHelper.calculateCommission(test.price, testData.commissionRate);
          totalAmount += test.price;
          commissionRateSum += testData.commissionRate;
          validTestsCount++;
        }
      }

      // Calculate average percentage
      const averagePercentage = validTestsCount > 0 ? commissionRateSum / validTestsCount : 0;

      // Check if commission already exists for this order
      const existingCommission = await Commission.findOne({ orderId: order._id });
      
      if (existingCommission) {
        return ResponseHelper.error('Commission already calculated for this order', 400);
      }

      // Create commission record
      const commission = new Commission({
        doctorId: order.referringDoctorId,
        patientId: order.patientId,
        orderId: order._id,
        commissionType: CommissionType.TEST_REFERRAL,
        amount: Math.round(totalCommission * 100) / 100, // Round to 2 decimal places
        percentage: Math.round(averagePercentage * 100) / 100, // Round to 2 decimal places
        branchId: order.branchId
      });

      await commission.save();

      logger.info(`Commission calculated: ₹${totalCommission} for doctor ${doctor.name} (Order: ${order.orderId})`);

      return ResponseHelper.success({
        commission,
        order: {
          orderId: order.orderId,
          totalAmount: order.totalAmount,
          commissionAmount: totalCommission
        },
        doctor: {
          name: doctor.name,
          email: doctor.email
        }
      }, 'Commission calculated successfully');

    } catch (error) {
      logger.error('Commission calculation error:', error);
      return ResponseHelper.error('Failed to calculate commission');
    }
  }

  static async getDoctorCommissions(doctorId: string, startDate?: string, endDate?: string): Promise<any> {
    try {
      // Handle both ObjectId and string formats
      const query: any = { doctorId };

      if (startDate && endDate) {
        query.calculatedDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      const commissions = await Commission.find(query)
        .populate('orderId', 'orderId totalAmount')
        .sort({ calculatedDate: -1 });

      const summary = {
        totalCommissions: commissions.length,
        totalAmount: commissions.reduce((sum, comm) => sum + comm.amount, 0),
        paidAmount: commissions
          .filter(comm => comm.paymentStatus === PaymentStatus.PAID)
          .reduce((sum, comm) => sum + comm.amount, 0),
        pendingAmount: commissions
          .filter(comm => comm.paymentStatus === PaymentStatus.PENDING)
          .reduce((sum, comm) => sum + comm.amount, 0)
      };

      return ResponseHelper.success({
        commissions,
        summary
      }, 'Doctor commissions retrieved successfully');

    } catch (error) {
      logger.error('Get doctor commissions error:', error);
      return ResponseHelper.error('Failed to fetch doctor commissions');
    }
  }

  static async payCommission(commissionId: string, paidBy: string): Promise<any> {
    try {
      const commission = await Commission.findById(commissionId)
        .populate('doctorId', 'name email');

      if (!commission) {
        return ResponseHelper.error('Commission not found', 404);
      }

      if (commission.paymentStatus === PaymentStatus.PAID) {
        return ResponseHelper.error('Commission already paid', 400);
      }

      commission.paymentStatus = PaymentStatus.PAID;
      commission.paymentDate = new Date();
      await commission.save();

      const doctor = commission.doctorId as any;

      // Send email notification
      await EmailService.sendCommissionNotification(
        doctor.email,
        doctor.name,
        commission.amount,
        commission.calculatedDate.toLocaleDateString()
      );

      logger.info(`Commission paid: ₹${commission.amount} to doctor ${doctor.name} by user ${paidBy}`);

      return ResponseHelper.success(commission, 'Commission payment processed successfully');

    } catch (error) {
      logger.error('Pay commission error:', error);
      return ResponseHelper.error('Failed to process commission payment');
    }
  }

  static async getCommissionReports(branchId?: string, startDate?: string, endDate?: string): Promise<any> {
    try {
      const query: any = {};

      if (branchId) query.branchId = branchId;

      if (startDate && endDate) {
        query.calculatedDate = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        };
      }

      // Aggregate commission data by doctor
      const doctorCommissions = await Commission.aggregate([
        { $match: query },
        {
          $group: {
            _id: '$doctorId',
            totalCommissions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            paidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$paymentStatus', PaymentStatus.PAID] },
                  '$amount',
                  0
                ]
              }
            },
            pendingAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$paymentStatus', PaymentStatus.PENDING] },
                  '$amount',
                  0
                ]
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
            _id: 1,
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

      // Get overall summary
      const overallSummary = await Commission.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalCommissions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            paidAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$paymentStatus', PaymentStatus.PAID] },
                  '$amount',
                  0
                ]
              }
            },
            pendingAmount: {
              $sum: {
                $cond: [
                  { $eq: ['$paymentStatus', PaymentStatus.PENDING] },
                  '$amount',
                  0
                ]
              }
            }
          }
        }
      ]);

      return ResponseHelper.success({
        doctorCommissions,
        summary: overallSummary[0] || {
          totalCommissions: 0,
          totalAmount: 0,
          paidAmount: 0,
          pendingAmount: 0
        }
      }, 'Commission reports retrieved successfully');

    } catch (error) {
      logger.error('Get commission reports error:', error);
      return ResponseHelper.error('Failed to fetch commission reports');
    }
  }

  static async bulkPayCommissions(commissionIds: string[], paidBy: string): Promise<any> {
    try {
      const commissions = await Commission.find({
        _id: { $in: commissionIds },
        paymentStatus: PaymentStatus.PENDING
      }).populate('doctorId', 'name email');

      if (commissions.length === 0) {
        return ResponseHelper.error('No pending commissions found', 404);
      }

      const results = [];
      
      for (const commission of commissions) {
        commission.paymentStatus = PaymentStatus.PAID;
        commission.paymentDate = new Date();
        await commission.save();

        const doctor = commission.doctorId as any;

        // Send email notification
        await EmailService.sendCommissionNotification(
          doctor.email,
          doctor.name,
          commission.amount,
          commission.calculatedDate.toLocaleDateString()
        );

        results.push({
          commissionId: commission._id,
          doctorName: doctor.name,
          amount: commission.amount,
          paid: true
        });

        logger.info(`Commission paid: ₹${commission.amount} to doctor ${doctor.name} by user ${paidBy}`);
      }

      const totalAmount = results.reduce((sum, result) => sum + result.amount, 0);

      return ResponseHelper.success({
        paidCommissions: results.length,
        totalAmount,
        results
      }, `${results.length} commission payments processed successfully`);

    } catch (error) {
      logger.error('Bulk pay commissions error:', error);
      return ResponseHelper.error('Failed to process bulk commission payments');
    }
  }
}