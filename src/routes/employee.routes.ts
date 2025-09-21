import { Router } from 'express';
import { EmployeeController } from '../controllers/employee.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeBranchManager, checkBranchAccess, logAccess, checkSelfOrAdmin, authorizeAdmin } from '../middleware/rbac.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validation.middleware';
import { 
  createEmployeeSchema,
  createTaskSchema,
  createLeaveSchema,
  createComplaintSchema,
  listQuerySchema,
  idParamSchema
} from '../utils/validators';
import Joi from 'joi';

const router = Router();

// Apply authentication and logging to all employee routes
router.use(authenticate);
router.use(checkBranchAccess);
router.use(logAccess);

// Employee Management (Branch Manager only)
router.post('/', 
  authorizeBranchManager, 
  validate(createEmployeeSchema), 
  EmployeeController.createEmployee
);

router.get('/', 
  authorizeBranchManager, 
  validateQuery(listQuerySchema), 
  EmployeeController.getEmployees
);

router.get('/branch/:branchId', 
  authorizeAdmin, 
  validateParams(Joi.object({
    branchId: Joi.string().required()
  })),
  validateQuery(listQuerySchema), 
  EmployeeController.getEmployeesByBranch
);

router.get('/:id/details', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  EmployeeController.getEmployeeDetails
);

// Task Management
router.post('/tasks', 
  authorizeBranchManager, 
  validate(createTaskSchema), 
  EmployeeController.assignTask
);

router.put('/:id/tasks', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  validate(Joi.object({
    taskId: Joi.string().required(),
    status: Joi.string().valid('PENDING', 'IN_PROGRESS', 'COMPLETED').required(),
    completedDate: Joi.date().optional()
  })),
  EmployeeController.updateTaskStatus
);

// Leave Management
router.post('/leaves', 
  validate(createLeaveSchema), 
  EmployeeController.applyLeave
);

router.put('/:id/leaves', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  validate(Joi.object({
    leaveId: Joi.string().required(),
    status: Joi.string().valid('PENDING', 'APPROVED', 'REJECTED').required()
  })),
  EmployeeController.updateLeaveStatus
);

// Complaint Management
router.post('/complaints', 
  validate(createComplaintSchema), 
  EmployeeController.submitComplaint
);

router.put('/:id/complaints', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  validate(Joi.object({
    complaintId: Joi.string().required(),
    status: Joi.string().valid('OPEN', 'IN_PROGRESS', 'RESOLVED').required()
  })),
  EmployeeController.updateComplaintStatus
);

// Employee Self-Service Dashboard
router.get('/dashboard', 
  EmployeeController.getEmployeeDashboard
);

export { router as employeeRoutes };