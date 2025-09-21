import { Router } from 'express';
import { OPDController } from '../controllers/opd.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeOPDStaff, checkBranchAccess, logAccess } from '../middleware/rbac.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validation.middleware';
import { 
  createPatientSchema, 
  createVisitSchema,
  createTestOrderSchema,
  createPrescriptionSchema,
  listQuerySchema,
  idParamSchema,
  patientIdParamSchema
} from '../utils/validators';

const router = Router();

// Apply authentication and logging to all OPD routes
router.use(authenticate);
router.use(checkBranchAccess);
router.use(logAccess);

// Patient Management Routes
router.post('/patients', 
  authorizeOPDStaff, 
  validate(createPatientSchema), 
  OPDController.registerPatient
);

router.get('/patients', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  OPDController.getPatients
);

router.get('/patients/:id', 
  authorizeOPDStaff, 
  validateParams(idParamSchema),
  OPDController.getPatientDetails
);

router.get('/branches/:branchId/patients', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  OPDController.getPatientsByBranch
);

router.get('/branches/:branchId/doctors', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  OPDController.getDoctorsByBranch
);

// Visit Management Routes
router.post('/visits', 
  authorizeOPDStaff, 
  validate(createVisitSchema), 
  OPDController.createVisit
);

router.get('/visits', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  OPDController.getVisits
);

router.put('/visits/:id', 
  authorizeOPDStaff, 
  validateParams(idParamSchema),
  OPDController.updateVisit
);

// Test Order Routes
router.post('/test-orders', 
  authorizeOPDStaff, 
  validate(createTestOrderSchema), 
  OPDController.createTestOrder
);

// Prescription Routes
router.post('/prescriptions', 
  authorizeOPDStaff, 
  validate(createPrescriptionSchema), 
  OPDController.createPrescription
);

// Appointment and Queue Management
router.get('/appointments', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  OPDController.getAppointments
);

// Helper Routes
router.get('/doctors/available', 
  authorizeOPDStaff, 
  OPDController.getAvailableDoctors
);

router.get('/tests/available', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  OPDController.getAvailableTests
);

export { router as opdRoutes };