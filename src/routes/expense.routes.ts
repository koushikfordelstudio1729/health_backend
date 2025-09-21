import { Router } from 'express';
import { ExpenseController } from '../controllers/expense.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizeBranchManager, checkBranchAccess, logAccess } from '../middleware/rbac.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validation.middleware';
import { 
  listQuerySchema,
  idParamSchema
} from '../utils/validators';
import Joi from 'joi';

const router = Router();

// Apply authentication and logging to all expense routes
router.use(authenticate);
router.use(checkBranchAccess);
router.use(logAccess);

// Create expense schema
const createExpenseSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  category: Joi.string().trim().required(),
  date: Joi.date().optional(),
  branchId: Joi.string().trim().optional() // Allow admins to specify branchId
});

// Update expense schema
const updateExpenseSchema = Joi.object({
  title: Joi.string().trim().optional(),
  description: Joi.string().trim().optional(),
  amount: Joi.number().min(0).optional(),
  category: Joi.string().trim().optional(),
  date: Joi.date().optional()
}).min(1); // At least one field must be provided

// Expense Management (Branch Manager and Admin only)
router.post('/', 
  authorizeBranchManager, 
  validate(createExpenseSchema), 
  ExpenseController.createExpense
);

router.get('/', 
  authorizeBranchManager, 
  validateQuery(listQuerySchema), 
  ExpenseController.getExpenses
);

router.get('/summary', 
  authorizeBranchManager, 
  validateQuery(Joi.object({
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional()
  })), 
  ExpenseController.getExpenseSummary
);

router.get('/:id', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  ExpenseController.getExpenseById
);

router.put('/:id', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  validate(updateExpenseSchema),
  ExpenseController.updateExpense
);

router.delete('/:id', 
  authorizeBranchManager, 
  validateParams(idParamSchema),
  ExpenseController.deleteExpense
);

export { router as expenseRoutes };