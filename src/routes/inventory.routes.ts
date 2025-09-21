import { Router } from 'express';
import { InventoryController } from '../controllers/inventory.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorizePharmacyStaff, checkBranchAccess, logAccess } from '../middleware/rbac.middleware';
import { validate, validateParams, validateQuery } from '../middleware/validation.middleware';
import { 
  createInventorySchema,
  updateInventorySchema,
  listQuerySchema,
  idParamSchema,
  branchIdParamSchema
} from '../utils/validators';

const router = Router();

// Apply authentication and logging to all inventory routes
router.use(authenticate);
router.use(checkBranchAccess);
router.use(logAccess);

// Inventory Item Management
router.post('/items', 
  authorizePharmacyStaff, 
  validate(createInventorySchema), 
  InventoryController.addInventoryItem
);

router.get('/items', 
  authorizePharmacyStaff, 
  validateQuery(listQuerySchema), 
  InventoryController.getInventoryItems
);

router.get('/items/branch/:branchId', 
  authorizePharmacyStaff, 
  validateParams(branchIdParamSchema),
  InventoryController.getInventoryItemsByBranch
);

router.put('/items/:id', 
  authorizePharmacyStaff, 
  validateParams(idParamSchema),
  validate(updateInventorySchema), 
  InventoryController.updateInventoryItem
);

router.delete('/items/:id', 
  authorizePharmacyStaff, 
  validateParams(idParamSchema),
  InventoryController.deleteInventoryItem
);

// Stock Alerts
router.get('/alerts', 
  authorizePharmacyStaff, 
  InventoryController.getStockAlerts
);

router.get('/alerts/branch/:branchId', 
  authorizePharmacyStaff, 
  validateParams(branchIdParamSchema),
  InventoryController.getStockAlertsByBranch
);

router.post('/alerts/send', 
  authorizePharmacyStaff, 
  InventoryController.sendLowStockAlerts
);

router.post('/alerts/send/branch/:branchId', 
  authorizePharmacyStaff, 
  validateParams(branchIdParamSchema),
  InventoryController.sendLowStockAlertsByBranch
);

// Reports
router.get('/reports', 
  authorizePharmacyStaff, 
  validateQuery(listQuerySchema), 
  InventoryController.getInventoryReport
);

router.get('/reports/branch/:branchId', 
  authorizePharmacyStaff, 
  validateParams(branchIdParamSchema),
  validateQuery(listQuerySchema), 
  InventoryController.getInventoryReportByBranch
);

export { router as inventoryRoutes };