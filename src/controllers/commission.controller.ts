import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Commission } from '../models';
import { CommissionService } from '../services/commission.service';
import { ResponseHelper } from '../utils/helpers';
import { logger } from '../utils/logger';
import { PaymentStatus } from '../types';

export class CommissionController {
  
  static async getDoctorCommissions(req: AuthRequest, res: Response) {
    try {
      const { doctorId, startDate, endDate } = req.query;
      const user = req.user;

      if (!doctorId) {
        return res.status(400).json(ResponseHelper.error('Doctor ID is required', 400));
      }

      logger.info(`Fetching commissions for doctor: ${doctorId}`);

      const result = await CommissionService.getDoctorCommissions(
        doctorId as string,
        startDate as string,
        endDate as string
      );

      if (!result || !result.success) {
        logger.error('Service returned error:', result);
        return res.status(result?.statusCode || 500).json(result || ResponseHelper.error('Service error'));
      }

      logger.info(`Doctor commissions retrieved for ${doctorId} by user ${user?.userId}`);
      return res.json(result);

    } catch (error) {
      logger.error('Get doctor commissions error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch doctor commissions'));
    }
  }

  static async getCommissionReports(req: AuthRequest, res: Response) {
    try {
      const { branchId, startDate, endDate } = req.query;
      const user = req.user;

      // Branch filtering for non-admin users
      let filterBranchId = branchId as string;
      if (user?.role !== 'ADMIN' && user?.branchId) {
        filterBranchId = user.branchId;
      }

      const result = await CommissionService.getCommissionReports(
        filterBranchId,
        startDate as string,
        endDate as string
      );

      if (!result.success) {
        return res.status(result.statusCode || 500).json(result);
      }

      logger.info(`Commission reports retrieved by user ${user?.userId}`);
      return res.json(result);

    } catch (error) {
      logger.error('Get commission reports error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to get commission reports'));
    }
  }

  static async payCommission(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!id) {
        return res.status(400).json(ResponseHelper.error('Commission ID is required', 400));
      }

      const result = await CommissionService.payCommission(id, user?.userId || 'Unknown');

      if (!result.success) {
        return res.status(result.statusCode || 500).json(result);
      }

      logger.info(`Commission ${id} marked as paid by user ${user?.userId}`);
      return res.json(result);

    } catch (error) {
      logger.error('Pay commission error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to pay commission'));
    }
  }

  static async bulkPayCommissions(req: AuthRequest, res: Response) {
    try {
      const { commissionIds } = req.body;
      const user = req.user;

      if (!commissionIds || !Array.isArray(commissionIds) || commissionIds.length === 0) {
        return res.status(400).json(ResponseHelper.error('Commission IDs array is required', 400));
      }

      const result = await CommissionService.bulkPayCommissions(commissionIds, user?.userId || 'Unknown');

      if (!result.success) {
        return res.status(result.statusCode || 500).json(result);
      }

      logger.info(`Bulk commission payment processed for ${commissionIds.length} commissions by user ${user?.userId}`);
      return res.json(result);

    } catch (error) {
      logger.error('Bulk pay commissions error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to process bulk commission payments'));
    }
  }

  static async getCommissionById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const user = req.user;

      if (!id) {
        return res.status(400).json(ResponseHelper.error('Commission ID is required', 400));
      }

      const commission = await Commission.findById(id)
        .populate('doctorId', 'name email specialization doctorId')
        .populate('orderId', 'orderId totalAmount patientId');

      if (!commission) {
        return res.status(404).json(ResponseHelper.error('Commission not found', 404));
      }

      // Branch access control for non-admin users
      if (user?.role !== 'ADMIN' && user?.branchId && commission.branchId !== user.branchId) {
        return res.status(403).json(ResponseHelper.error('Access denied for this commission', 403));
      }

      logger.info(`Commission ${id} retrieved by user ${user?.userId}`);
      return res.json(ResponseHelper.success(commission, 'Commission retrieved successfully'));

    } catch (error) {
      logger.error('Get commission by ID error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to get commission details'));
    }
  }

  static async getPendingCommissions(req: AuthRequest, res: Response) {
    try {
      const { branchId, doctorId, limit = 50, offset = 0 } = req.query;
      const user = req.user;

      // Build query filters
      const filters: any = {
        paymentStatus: PaymentStatus.PENDING
      };

      // Branch filtering
      if (user?.role !== 'ADMIN') {
        filters.branchId = user?.branchId;
      } else if (branchId) {
        filters.branchId = branchId;
      }

      if (doctorId) {
        filters.doctorId = doctorId;
      }

      const [commissions, totalCount] = await Promise.all([
        Commission.find(filters)
          .populate('doctorId', 'name email specialization doctorId')
          .populate('orderId', 'orderId totalAmount patientId createdAt')
          .sort({ calculatedDate: -1 })
          .limit(Number(limit))
          .skip(Number(offset)),
        Commission.countDocuments(filters)
      ]);

      // Calculate total pending amount
      const totalPendingAmount = await Commission.aggregate([
        { $match: filters },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      const result = {
        commissions,
        pagination: {
          total: totalCount,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: Number(offset) + Number(limit) < totalCount
        },
        summary: {
          totalPendingCommissions: totalCount,
          totalPendingAmount: totalPendingAmount[0]?.totalAmount || 0
        }
      };

      logger.info(`Pending commissions retrieved by user ${user?.userId}`);
      return res.json(ResponseHelper.success(result, 'Pending commissions retrieved successfully'));

    } catch (error) {
      logger.error('Get pending commissions error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to get pending commissions'));
    }
  }

  static async calculateCommission(req: AuthRequest, res: Response) {
    try {
      const { orderId } = req.params;
      const user = req.user;

      if (!orderId) {
        return res.status(400).json(ResponseHelper.error('Order ID is required', 400));
      }

      const result = await CommissionService.calculateCommission(orderId);

      if (!result.success) {
        return res.status(result.statusCode || 500).json(result);
      }

      logger.info(`Commission calculated for order ${orderId} by user ${user?.userId}`);
      return res.json(result);

    } catch (error) {
      logger.error('Calculate commission error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to calculate commission'));
    }
  }
}