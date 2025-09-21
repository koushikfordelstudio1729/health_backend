import { Router } from 'express';
import { ReportsController } from '../controllers/reports.controller';
import { authenticate, optionalAuth } from '../middleware/auth.middleware';
import { authorizeBranchManager, checkBranchAccess, logAccess } from '../middleware/rbac.middleware';
import { validateParams, validateQuery } from '../middleware/validation.middleware';
import Joi from 'joi';

const router = Router();

// Public QR code access (no authentication required)
router.get('/qr/:orderId', 
  validateParams(Joi.object({
    orderId: Joi.string().required()
  })),
  validateQuery(Joi.object({
    patient: Joi.string().optional()
  })),
  ReportsController.getReportsByQR
);

router.get('/download/:reportId', 
  validateParams(Joi.object({
    reportId: Joi.string().required()
  })),
  ReportsController.downloadReport
);

// Protected routes require authentication
router.use(authenticate);
router.use(checkBranchAccess);
router.use(logAccess);

// Revenue Reports
router.get('/revenue', 
  authorizeBranchManager,
  validateQuery(Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    groupBy: Joi.string().valid('day', 'month').default('day')
  })),
  ReportsController.getRevenueReport
);

// Commission Reports
router.get('/commissions', 
  authorizeBranchManager,
  validateQuery(Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    doctorId: Joi.string().optional(),
    paymentStatus: Joi.string().valid('PENDING', 'PAID').optional()
  })),
  ReportsController.getCommissionReports
);

// Daily Collection Sheet
router.get('/daily-collection', 
  authorizeBranchManager,
  validateQuery(Joi.object({
    date: Joi.date().optional()
  })),
  ReportsController.getDailyCollection
);

// Payment Summary
router.get('/payment-summary', 
  authorizeBranchManager,
  validateQuery(Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional(),
    paymentMode: Joi.string().valid('CASH', 'CARD', 'ONLINE', 'CASH_ONLINE', 'CASH_CARD', 'INSURANCE', 'DUE').optional()
  })),
  ReportsController.getPaymentSummary
);

export { router as reportsRoutes };