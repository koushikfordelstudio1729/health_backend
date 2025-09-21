import { Router } from 'express';
import { CommissionController } from '../controllers/commission.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validation.middleware';
import { UserRole } from '../types';
import Joi from 'joi';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Get doctor commission summary - Admin, Branch Manager
router.get('/doctors',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    doctorId: Joi.string().optional(),
    branchId: Joi.string().optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    paymentStatus: Joi.string().valid('PAID', 'PENDING').optional()
  }).options({ allowUnknown: true })),
  CommissionController.getDoctorCommissions
);

// Get commission reports - Admin, Branch Manager
router.get('/reports',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    doctorId: Joi.string().optional()
  }).options({ allowUnknown: true })),
  CommissionController.getCommissionReports
);

// Mark commission as paid - Admin, Branch Manager
router.put('/:id/pay',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    paymentMethod: Joi.string().optional(),
    paymentReference: Joi.string().optional(),
    notes: Joi.string().optional()
  })),
  CommissionController.payCommission
);

// Bulk pay commissions - Admin, Branch Manager
router.post('/bulk-pay',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    commissionIds: Joi.array().items(Joi.string()).min(1).required()
  })),
  CommissionController.bulkPayCommissions
);

// Get specific commission details - Admin, Branch Manager
router.get('/:id',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    id: Joi.string().required()
  })),
  CommissionController.getCommissionById
);

// Get pending commissions - Admin, Branch Manager
router.get('/pending/list',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    doctorId: Joi.string().optional(),
    limit: Joi.number().min(1).max(100).default(50),
    offset: Joi.number().min(0).default(0)
  }).options({ allowUnknown: true })),
  CommissionController.getPendingCommissions
);

// Calculate commission for an order - Admin, Branch Manager
router.post('/calculate/:orderId',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    orderId: Joi.string().required()
  })),
  CommissionController.calculateCommission
);

export { router as commissionRoutes };