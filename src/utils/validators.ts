import Joi from 'joi';
import { UserRole, Gender, PaymentMode, PaymentStatus, VisitType, TestCategory, InventoryCategory } from '../types';

// Common validation schemas
export const objectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Invalid ObjectId format');

export const paginationSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10)
});

export const dateRangeSchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate'))
}).with('startDate', 'endDate');

// Authentication schemas
export const loginSchema = Joi.object({
  username: Joi.string().trim().lowercase().required(),
  password: Joi.string().min(6).required()
});

export const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required()
});

// Branch schemas
export const createBranchSchema = Joi.object({
  name: Joi.string().trim().required(),
  address: Joi.string().trim().required(),
  contact: Joi.string().trim().required(),
  email: Joi.string().email().trim().lowercase().required()
});

// User schemas
export const createUserSchema = Joi.object({
  username: Joi.string().trim().lowercase().required(),
  name: Joi.string().trim().required(),
  email: Joi.string().email().trim().lowercase().required(),
  phone: Joi.string().trim().required(),
  role: Joi.string().valid(...Object.values(UserRole)).required(),
  branchId: Joi.string().when('role', {
    is: UserRole.ADMIN,
    then: Joi.optional(),
    otherwise: Joi.required()
  }),
  accessLevel: Joi.array().items(Joi.string().trim()).default([]),
  password: Joi.string().min(6).required().messages({
    'string.min': 'Password must be at least 6 characters long',
    'any.required': 'Password is required'
  })
});

export const updateUserSchema = Joi.object({
  name: Joi.string().trim(),
  email: Joi.string().email().trim().lowercase(),
  phone: Joi.string().trim(),
  isActive: Joi.boolean(),
  accessLevel: Joi.array().items(Joi.string().trim())
});

// Doctor schemas
export const createDoctorSchema = Joi.object({
  name: Joi.string().trim().required(),
  specialization: Joi.string().trim().required(),
  contact: Joi.string().trim().required(),
  email: Joi.string().email().trim().lowercase().required(),
  consultationFee: Joi.number().min(0).required(),
  commissionRate: Joi.number().min(0).max(100).required(),
  availableBranches: Joi.array().items(Joi.string()).min(1).required()
});

export const updateDoctorSchema = Joi.object({
  name: Joi.string().trim(),
  specialization: Joi.string().trim(),
  contact: Joi.string().trim(),
  email: Joi.string().email().trim().lowercase(),
  consultationFee: Joi.number().min(0),
  commissionRate: Joi.number().min(0).max(100),
  availableBranches: Joi.array().items(Joi.string()).min(1),
  isActive: Joi.boolean()
}).min(1); // At least one field must be provided

// Patient schemas
export const createPatientSchema = Joi.object({
  name: Joi.string().trim().required(),
  age: Joi.number().integer().min(0).max(150).required(),
  dob: Joi.date().required(),
  gender: Joi.string().valid(...Object.values(Gender)).required(),
  contact: Joi.string().trim().required(),
  address: Joi.string().trim().required(),
  branchId: Joi.string().trim().optional() // Allow admins to specify branchId
});

// Visit schemas
export const createVisitSchema = Joi.object({
  patientId: Joi.string().required(),
  doctorId: objectIdSchema.required(),
  consultationFee: Joi.number().min(0).required(),
  paymentMode: Joi.string().valid(...Object.values(PaymentMode)).required(),
  paymentStatus: Joi.string().valid(...Object.values(PaymentStatus)).default(PaymentStatus.PENDING),
  nextVisitDate: Joi.date(),
  visitType: Joi.string().valid(...Object.values(VisitType)).default(VisitType.CONSULTATION),
  branchId: Joi.string().trim().optional() // Allow admins to specify branchId
});

// Prescription schemas
export const createPrescriptionSchema = Joi.object({
  visitId: objectIdSchema.required(),
  vitals: Joi.object({
    height: Joi.number().min(0).required(),
    weight: Joi.number().min(0).required(),
    bp: Joi.string().trim().required(),
    spo2: Joi.number().min(0).max(100).required(),
    temperature: Joi.number().min(0).required()
  }).required(),
  examination: Joi.object({
    complaints: Joi.string().trim().required(),
    findings: Joi.string().trim().required(),
    diagnosis: Joi.string().trim().required()
  }).required(),
  testsRecommended: Joi.array().items(objectIdSchema).default([]),
  medicinesRecommended: Joi.array().items(Joi.object({
    medicineName: Joi.string().trim().required(),
    dosage: Joi.string().trim().required(),
    duration: Joi.string().trim().required(),
    instructions: Joi.string().trim().required()
  })).default([])
});

// Test schemas
export const createTestSchema = Joi.object({
  testName: Joi.string().trim().required(),
  category: Joi.string().valid(...Object.values(TestCategory)).required(),
  price: Joi.number().min(0).required(),
  commissionRate: Joi.number().min(0).max(100).required(),
  availableBranches: Joi.array().items(Joi.string()).min(1).required()
});

export const updateTestSchema = Joi.object({
  testName: Joi.string().trim(),
  category: Joi.string().valid(...Object.values(TestCategory)),
  price: Joi.number().min(0),
  commissionRate: Joi.number().min(0).max(100),
  availableBranches: Joi.array().items(Joi.string()).min(1),
  isActive: Joi.boolean()
}).min(1); // At least one field must be provided

// Test Order schemas
export const createTestOrderSchema = Joi.object({
  patientId: Joi.string().required(),
  visitId: objectIdSchema.required(),
  referringDoctorId: objectIdSchema.required(),
  tests: Joi.array().items(Joi.object({
    testId: objectIdSchema.required(),
    testName: Joi.string().trim().required(),
    price: Joi.number().min(0).required()
  })).min(1).required(),
  paymentMode: Joi.string().valid(...Object.values(PaymentMode)).required(),
  paymentStatus: Joi.string().valid(...Object.values(PaymentStatus)).default(PaymentStatus.PENDING),
  branchId: Joi.string().trim().optional() // Allow admins to specify branchId
});

// Inventory schemas
export const createInventorySchema = Joi.object({
  itemName: Joi.string().trim().required(),
  category: Joi.string().valid(...Object.values(InventoryCategory)).required(),
  quantity: Joi.number().integer().min(0).required(),
  minStockLevel: Joi.number().integer().min(0).required(),
  maxStockLevel: Joi.number().integer().min(Joi.ref('minStockLevel')).required(),
  unitPrice: Joi.number().min(0).required(),
  supplier: Joi.string().trim().required(),
  expiryDate: Joi.date().required(),
  branchId: Joi.string().trim().optional() // Allow admins to specify branchId
});

export const updateInventorySchema = Joi.object({
  itemName: Joi.string().trim(),
  quantity: Joi.number().integer().min(0),
  minStockLevel: Joi.number().integer().min(0),
  maxStockLevel: Joi.number().integer().min(0),
  unitPrice: Joi.number().min(0),
  supplier: Joi.string().trim(),
  expiryDate: Joi.date()
});

// Expense schemas
export const createExpenseSchema = Joi.object({
  title: Joi.string().trim().required(),
  description: Joi.string().trim().required(),
  amount: Joi.number().min(0).required(),
  category: Joi.string().trim().required(),
  date: Joi.date().default(new Date())
});

// Employee schemas
export const createEmployeeSchema = Joi.object({
  userId: objectIdSchema.required(),
  designation: Joi.string().trim().required(),
  department: Joi.string().trim().required(),
  joiningDate: Joi.date().required(),
  salary: Joi.number().min(0).required(),
  branchId: Joi.string().trim().optional() // Allow admins to specify branchId
});

export const createTaskSchema = Joi.object({
  employeeId: Joi.string().required(),
  title: Joi.string().trim().required(),
  description: Joi.string().trim().required(),
  dueDate: Joi.date().required()
});

export const createLeaveSchema = Joi.object({
  leaveType: Joi.string().trim().required(),
  fromDate: Joi.date().required(),
  toDate: Joi.date().min(Joi.ref('fromDate')).required(),
  reason: Joi.string().trim().required()
});

export const createComplaintSchema = Joi.object({
  subject: Joi.string().trim().required(),
  description: Joi.string().trim().required()
});

export const patientIdParamSchema = Joi.object({
  patientId: Joi.string().required()
});

// Common parameter validation schemas
export const idParamSchema = Joi.object({
  id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid ID format'
  })
});

// Flexible ID schema that accepts both ObjectId and custom IDs
export const flexibleIdParamSchema = Joi.object({
  id: Joi.string().required().messages({
    'string.empty': 'ID is required'
  })
});

// Branch ID parameter validation schema
export const branchIdParamSchema = Joi.object({
  branchId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid branch ID format',
    'any.required': 'Branch ID is required'
  })
});

// Generic query validation for listing endpoints
export const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().trim().allow(''),
  status: Joi.string().trim(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  branchId: Joi.string()
}).with('startDate', 'endDate');