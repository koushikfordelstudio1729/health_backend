import { Router } from 'express';
import { LabController } from '../controllers/lab.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeLabStaff, checkBranchAccess, logAccess } from '../middleware/rbac.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validation.middleware';
import { uploadSingle, requireFile, validateFile } from '../middleware/upload.middleware';
import { uploadLimiter } from '../middleware/security.middleware';
import { 
  listQuerySchema,
} from '../utils/validators';
import Joi from 'joi';

const router = Router();

// Apply authentication and logging to all Lab routes
router.use(authenticate);
router.use(logAccess);

// Test Queue Management
router.get('/test-queue', 
  authorizeLabStaff,
  checkBranchAccess,
  validateQuery(listQuerySchema), 
  LabController.getTestQueue
);

router.put('/tests/:orderId/status', 
  authorizeLabStaff, 
  validateParams(Joi.object({
    orderId: Joi.string().required()
  })),
  validate(Joi.object({
    testId: Joi.string().required(),
    status: Joi.string().valid('PENDING', 'COLLECTED', 'PROCESSING', 'COMPLETED').required(),
    collectionDate: Joi.date().optional(),
    completionDate: Joi.date().optional()
  })),
  LabController.updateTestStatus
);

// Sample Collection
router.get('/collections/pending', 
  authorizeLabStaff,
  checkBranchAccess, 
  validateQuery(listQuerySchema), 
  LabController.getPendingCollections
);

router.put('/collections/:orderId', 
  authorizeLabStaff, 
  validateParams(Joi.object({
    orderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
      'string.pattern.base': 'Invalid ObjectId format'
    })
  })),
  validate(Joi.object({
    testId: Joi.string().required(),
    collectionDate: Joi.date().default(new Date()),
    collectionNotes: Joi.string().optional()
  })),
  LabController.updateSampleCollection
);

// Report Management
router.post('/reports/upload', 
  authorizeLabStaff,
  uploadLimiter,
  uploadSingle('reportFile'),
  requireFile,
  validateFile,
  validate(Joi.object({
    orderId: Joi.string().required(),
    testId: Joi.string().required(),
    patientId: Joi.string().required()
  })),
  LabController.uploadTestReport
);

router.get('/reports/:orderId', 
  authorizeLabStaff, 
  validateParams(Joi.object({
    orderId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
      'string.pattern.base': 'Invalid ObjectId format'
    })
  })),
  LabController.getTestReports
);

router.get('/reports/download/:reportId', 
  authorizeLabStaff, 
  validateParams(Joi.object({
    reportId: Joi.string().required()
  })),
  LabController.downloadTestReport
);

// Lab Dashboard
router.get('/dashboard', 
  authorizeLabStaff,
  checkBranchAccess, 
  validateQuery(Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  })), 
  LabController.getLabDashboard
);

export { router as labRoutes };