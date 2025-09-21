import { Router } from 'express';
import { AdminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeAdmin, authorizeBranchManager, authorizeOPDStaff, logAccess } from '../middleware/rbac.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validation.middleware';
import { 
  createBranchSchema, 
  createUserSchema, 
  updateUserSchema,
  createDoctorSchema,
  updateDoctorSchema,
  createTestSchema,
  updateTestSchema,
  listQuerySchema,
  idParamSchema,
  flexibleIdParamSchema
} from '../utils/validators';

const router = Router();

// Apply authentication and logging to all admin routes
router.use(authenticate);
router.use(logAccess);

// Branch Management (Admin only)
router.post('/branches', 
  authorizeAdmin, 
  validate(createBranchSchema), 
  AdminController.createBranch
);

router.get('/branches', 
  authorizeAdmin,
  validateQuery(listQuerySchema), 
  AdminController.getBranches
);

router.get('/branches/:branchId', 
  AdminController.getBranch
);

router.put('/branches/:id', 
  authorizeAdmin, 
  validateParams(idParamSchema),
  validate(createBranchSchema), 
  AdminController.updateBranch
);

// User Management (Admin and Branch Manager)
router.post('/users', 
  authorizeBranchManager, 
  validate(createUserSchema), 
  AdminController.createUser
);

router.get('/users', 
  authorizeBranchManager, 
  validateQuery(listQuerySchema), 
  AdminController.getUsers
);

router.put('/users/:id', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  validate(updateUserSchema), 
  AdminController.updateUser
);

// Doctor Management (Admin only)
router.post('/doctors', 
  authorizeAdmin, 
  validate(createDoctorSchema), 
  AdminController.createDoctor
);

router.get('/doctors', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  AdminController.getDoctors
);

router.put('/doctors/:id', 
  authorizeAdmin, 
  validateParams(flexibleIdParamSchema),
  validate(updateDoctorSchema), 
  AdminController.updateDoctor
);

// Test Management (Admin only)
router.post('/tests', 
  authorizeAdmin, 
  validate(createTestSchema), 
  AdminController.createTest
);

router.get('/tests', 
  authorizeOPDStaff, 
  validateQuery(listQuerySchema), 
  AdminController.getTests
);

router.put('/tests/:id', 
  authorizeAdmin, 
  validateParams(idParamSchema),
  validate(updateTestSchema), 
  AdminController.updateTest
);

// Dashboard and Reports
router.get('/dashboard', 
  validateQuery(listQuerySchema), 
  AdminController.getDashboard
);

export { router as adminRoutes };