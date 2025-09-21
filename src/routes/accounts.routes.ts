import { Router } from 'express';
import { AccountsController } from '../controllers/accounts.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validation.middleware';
import { UserRole } from '../types';
import Joi from 'joi';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

// Daily collection report - Admin, Branch Manager, OPD Staff
router.get('/daily-collection',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.OPD_STAFF]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    date: Joi.date().optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  }).options({ allowUnknown: true })),
  AccountsController.getDailyCollection
);

// Payment mode summary
router.get('/payment-summary',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.OPD_STAFF]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    paymentMode: Joi.string().optional()
  }).options({ allowUnknown: true })),
  AccountsController.getPaymentSummary
);

// Outstanding dues report
router.get('/outstanding',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.OPD_STAFF]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    patientId: Joi.string().optional(),
    limit: Joi.number().min(1).max(100).default(50),
    offset: Joi.number().min(0).default(0)
  }).options({ allowUnknown: true })),
  AccountsController.getOutstandingDues
);

// Revenue analytics
router.get('/revenue-analytics',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    period: Joi.string().valid('daily', 'weekly', 'monthly', 'yearly').default('monthly'),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  }).options({ allowUnknown: true })),
  AccountsController.getRevenueAnalytics
);

// Commission summary by doctor
router.get('/commission-summary',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    doctorId: Joi.string().optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    paymentStatus: Joi.string().valid('PAID', 'PENDING').optional()
  }).options({ allowUnknown: true })),
  AccountsController.getCommissionSummary
);

// Test-wise revenue report
router.get('/test-revenue',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    testCategory: Joi.string().optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  }).options({ allowUnknown: true })),
  AccountsController.getTestRevenue
);

// Monthly financial statement
router.get('/financial-statement',
  authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]),
  validate(Joi.object({
    branchId: Joi.string().optional(),
    month: Joi.number().min(1).max(12).required(),
    year: Joi.number().min(2020).required()
  }).options({ allowUnknown: true })),
  AccountsController.getFinancialStatement
);

export { router as accountsRoutes };