import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Inventory, User } from '../models';
import { ResponseHelper, QueryHelper, DateHelper } from '../utils/helpers';
import { IDGenerator } from '../utils/idGenerator';
import { EmailService } from '../services/email.service';
import { logger } from '../utils/logger';

export class InventoryController {
  // Inventory Item Management
  static async addInventoryItem(req: AuthRequest, res: Response) {
    try {
      const { itemName, category, quantity, minStockLevel, maxStockLevel, unitPrice, supplier, expiryDate, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;

      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      // Check if item with same name already exists in this branch
      const existingItem = await Inventory.findOne({ itemName, branchId });
      if (existingItem) {
        return res.status(400).json(ResponseHelper.error('Item with this name already exists in this branch', 400));
      }

      const itemId = await IDGenerator.generateItemId(branchId);

      const inventoryItem = new Inventory({
        itemId,
        itemName,
        category,
        quantity,
        minStockLevel,
        maxStockLevel,
        unitPrice,
        supplier,
        expiryDate: new Date(expiryDate),
        branchId,
        lastUpdated: new Date()
      });

      await inventoryItem.save();

      logger.info(`Inventory item added: ${itemId} by user ${req.user?.userId}`);

      return res.status(201).json(ResponseHelper.success(inventoryItem, 'Inventory item added successfully'));
    } catch (error) {
      logger.error('Add inventory item error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to add inventory item'));
    }
  }

  static async getInventoryItems(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, category, lowStock, expiring, branchId: queryBranchId } = req.query;
      // For admin users, allow branchId from query params, otherwise use user's branchId
      const branchId = req.user?.branchId || (queryBranchId as string);

      const query = QueryHelper.buildFilterQuery({ search, category }, branchId);

      if (search) {
        query.$or = [
          { itemName: { $regex: search, $options: 'i' } },
          { itemId: { $regex: search, $options: 'i' } },
          { supplier: { $regex: search, $options: 'i' } }
        ];
      }

      if (lowStock === 'true') {
        query.$expr = { $lte: ['$quantity', '$minStockLevel'] };
      }

      if (expiring === 'true') {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        query.expiryDate = { $lte: thirtyDaysFromNow };
      }

      const items = await Inventory.find(query)
        .sort({ lastUpdated: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Inventory.countDocuments(query);

      // Add computed fields
      const enhancedItems = items.map(item => ({
        ...item.toObject(),
        isLowStock: item.quantity <= item.minStockLevel,
        isExpiringSoon: item.expiryDate <= DateHelper.addDays(new Date(), 30),
        stockValue: item.quantity * item.unitPrice,
        daysToExpiry: Math.ceil((item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      }));

      return res.json(ResponseHelper.paginated(enhancedItems, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get inventory items error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch inventory items'));
    }
  }

  static async getInventoryItemsByBranch(req: AuthRequest, res: Response) {
    try {
      const { branchId } = req.params;
      const { page = 1, limit = 10, search, category, lowStock, expiring } = req.query;

      const query = QueryHelper.buildFilterQuery({ search, category }, branchId);

      if (search) {
        query.$or = [
          { itemName: { $regex: search, $options: 'i' } },
          { itemId: { $regex: search, $options: 'i' } },
          { supplier: { $regex: search, $options: 'i' } }
        ];
      }

      if (lowStock === 'true') {
        query.$expr = { $lte: ['$quantity', '$minStockLevel'] };
      }

      if (expiring === 'true') {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        query.expiryDate = { $lte: thirtyDaysFromNow };
      }

      const items = await Inventory.find(query)
        .sort({ lastUpdated: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Inventory.countDocuments(query);

      const enhancedItems = items.map(item => ({
        ...item.toObject(),
        isLowStock: item.quantity <= item.minStockLevel,
        isExpiringSoon: item.expiryDate <= DateHelper.addDays(new Date(), 30),
        stockValue: item.quantity * item.unitPrice,
        daysToExpiry: Math.ceil((item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
      }));

      return res.json(ResponseHelper.paginated(enhancedItems, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get inventory items by branch error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch inventory items'));
    }
  }

  static async updateInventoryItem(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const branchId = req.user?.branchId;

      const item = await Inventory.findOne({
        _id: id,
        ...(branchId && { branchId })
      });

      if (!item) {
        return res.status(404).json(ResponseHelper.error('Inventory item not found', 404));
      }

      // Update allowed fields
      const allowedFields = ['itemName', 'quantity', 'minStockLevel', 'maxStockLevel', 'unitPrice', 'supplier', 'expiryDate'];
      const filteredUpdate: any = Object.keys(updateData)
        .filter(key => allowedFields.includes(key))
        .reduce((obj: any, key) => {
          obj[key] = updateData[key];
          return obj;
        }, {});

      // Update lastUpdated timestamp
      filteredUpdate.lastUpdated = new Date();

      Object.assign(item, filteredUpdate);
      await item.save();

      logger.info(`Inventory item updated: ${item.itemId} by user ${req.user?.userId}`);

      return res.json(ResponseHelper.success(item, 'Inventory item updated successfully'));
    } catch (error) {
      logger.error('Update inventory item error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update inventory item'));
    }
  }

  static async deleteInventoryItem(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const branchId = req.user?.branchId;

      const item = await Inventory.findOneAndDelete({
        _id: id,
        ...(branchId && { branchId })
      });

      if (!item) {
        return res.status(404).json(ResponseHelper.error('Inventory item not found', 404));
      }

      logger.info(`Inventory item deleted: ${item.itemId} by user ${req.user?.userId}`);

      return res.json(ResponseHelper.success(null, 'Inventory item deleted successfully'));
    } catch (error) {
      logger.error('Delete inventory item error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to delete inventory item'));
    }
  }

  // Stock Alerts and Notifications
  static async getStockAlerts(req: AuthRequest, res: Response) {
    try {
      const branchId = req.user?.branchId;

      const branchFilter = branchId ? { branchId } : {};

      // Get low stock items
      const lowStockItems = await Inventory.find({
        ...branchFilter,
        $expr: { $lte: ['$quantity', '$minStockLevel'] }
      }).sort({ quantity: 1 });

      // Get expiring items (within 30 days)
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiringItems = await Inventory.find({
        ...branchFilter,
        expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() }
      }).sort({ expiryDate: 1 });

      // Get expired items
      const expiredItems = await Inventory.find({
        ...branchFilter,
        expiryDate: { $lt: new Date() }
      }).sort({ expiryDate: -1 });

      const alerts = {
        lowStock: lowStockItems.map(item => ({
          ...item.toObject(),
          alertType: 'LOW_STOCK',
          severity: item.quantity === 0 ? 'CRITICAL' : 'WARNING',
          message: `${item.itemName} is ${item.quantity === 0 ? 'out of stock' : 'running low'}`
        })),
        expiring: expiringItems.map(item => ({
          ...item.toObject(),
          alertType: 'EXPIRING',
          severity: 'WARNING',
          daysToExpiry: Math.ceil((item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
          message: `${item.itemName} expires in ${Math.ceil((item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days`
        })),
        expired: expiredItems.map(item => ({
          ...item.toObject(),
          alertType: 'EXPIRED',
          severity: 'CRITICAL',
          daysSinceExpiry: Math.ceil((new Date().getTime() - item.expiryDate.getTime()) / (1000 * 60 * 60 * 24)),
          message: `${item.itemName} expired ${Math.ceil((new Date().getTime() - item.expiryDate.getTime()) / (1000 * 60 * 60 * 24))} days ago`
        }))
      };

      const summary = {
        totalAlerts: lowStockItems.length + expiringItems.length + expiredItems.length,
        criticalAlerts: lowStockItems.filter(item => item.quantity === 0).length + expiredItems.length,
        warningAlerts: lowStockItems.filter(item => item.quantity > 0).length + expiringItems.length
      };

      return res.json(ResponseHelper.success({ alerts, summary }, 'Stock alerts retrieved successfully'));
    } catch (error) {
      logger.error('Get stock alerts error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch stock alerts'));
    }
  }

  static async getStockAlertsByBranch(req: AuthRequest, res: Response) {
    try {
      const { branchId } = req.params;

      const lowStockItems = await Inventory.find({
        branchId,
        $expr: { $lte: ['$quantity', '$minStockLevel'] }
      }).sort({ quantity: 1 });

      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      const expiringItems = await Inventory.find({
        branchId,
        expiryDate: { $lte: thirtyDaysFromNow, $gte: new Date() }
      }).sort({ expiryDate: 1 });

      const expiredItems = await Inventory.find({
        branchId,
        expiryDate: { $lt: new Date() }
      }).sort({ expiryDate: -1 });

      const alerts = {
        lowStock: lowStockItems.map(item => ({
          ...item.toObject(),
          alertType: 'LOW_STOCK',
          severity: item.quantity === 0 ? 'CRITICAL' : 'WARNING',
          message: `${item.itemName} is ${item.quantity === 0 ? 'out of stock' : 'running low'}`,
          branchId: item.branchId
        })),
        expiring: expiringItems.map(item => ({
          ...item.toObject(),
          alertType: 'EXPIRING',
          severity: 'WARNING',
          daysToExpiry: Math.ceil((item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
          message: `${item.itemName} expires in ${Math.ceil((item.expiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))} days`,
          branchId: item.branchId
        })),
        expired: expiredItems.map(item => ({
          ...item.toObject(),
          alertType: 'EXPIRED',
          severity: 'CRITICAL',
          daysSinceExpiry: Math.ceil((new Date().getTime() - item.expiryDate.getTime()) / (1000 * 60 * 60 * 24)),
          message: `${item.itemName} expired ${Math.ceil((new Date().getTime() - item.expiryDate.getTime()) / (1000 * 60 * 60 * 24))} days ago`,
          branchId: item.branchId
        }))
      };

      const summary = {
        branchId,
        totalAlerts: lowStockItems.length + expiringItems.length + expiredItems.length,
        criticalAlerts: lowStockItems.filter(item => item.quantity === 0).length + expiredItems.length,
        warningAlerts: lowStockItems.filter(item => item.quantity > 0).length + expiringItems.length
      };

      return res.json(ResponseHelper.success({ alerts, summary }, 'Branch stock alerts retrieved successfully'));
    } catch (error) {
      logger.error('Get branch stock alerts error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch branch stock alerts'));
    }
  }

  static async sendLowStockAlerts(req: AuthRequest, res: Response) {
    try {
      const branchId = req.user?.branchId;

      // Get branch managers and pharmacy staff emails
      const staffQuery: any = {
        role: { $in: ['BRANCH_MANAGER', 'PHARMACY_STAFF'] },
        isActive: true
      };

      if (branchId) {
        staffQuery.branchId = branchId;
      }

      const staff = await User.find(staffQuery).select('email name');

      // Get low stock items
      const lowStockItems = await Inventory.find({
        ...(branchId && { branchId }),
        $expr: { $lte: ['$quantity', '$minStockLevel'] }
      });

      if (lowStockItems.length === 0) {
        return res.json(ResponseHelper.success(null, 'No low stock items found'));
      }

      // Send alerts to each staff member
      const emailPromises = staff.map(async (staffMember) => {
        for (const item of lowStockItems) {
          await EmailService.sendInventoryAlert(
            staffMember.email,
            item.itemName,
            item.quantity,
            item.minStockLevel,
            `Branch ${item.branchId}`
          );
        }
      });

      await Promise.all(emailPromises);

      logger.info(`Low stock alerts sent for ${lowStockItems.length} items to ${staff.length} staff members`);

      return res.json(ResponseHelper.success({
        itemsAlerted: lowStockItems.length,
        staffNotified: staff.length
      }, 'Low stock alerts sent successfully'));
    } catch (error) {
      logger.error('Send low stock alerts error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to send low stock alerts'));
    }
  }

  static async sendLowStockAlertsByBranch(req: AuthRequest, res: Response) {
    try {
      const { branchId } = req.params;

      const staffQuery: any = {
        role: { $in: ['BRANCH_MANAGER', 'PHARMACY_STAFF'] },
        isActive: true,
        branchId: branchId
      };

      const staff = await User.find(staffQuery).select('email name');

      const lowStockItems = await Inventory.find({
        branchId,
        $expr: { $lte: ['$quantity', '$minStockLevel'] }
      });

      if (lowStockItems.length === 0) {
        return res.json(ResponseHelper.success(null, 'No low stock items found for this branch'));
      }

      const emailPromises = staff.map(async (staffMember) => {
        for (const item of lowStockItems) {
          await EmailService.sendInventoryAlert(
            staffMember.email,
            item.itemName,
            item.quantity,
            item.minStockLevel,
            `Branch ${item.branchId}`
          );
        }
      });

      await Promise.all(emailPromises);

      logger.info(`Low stock alerts sent for branch ${branchId}: ${lowStockItems.length} items to ${staff.length} staff members`);

      return res.json(ResponseHelper.success({
        branchId,
        itemsAlerted: lowStockItems.length,
        staffNotified: staff.length
      }, 'Branch low stock alerts sent successfully'));
    } catch (error) {
      logger.error('Send branch low stock alerts error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to send branch low stock alerts'));
    }
  }

  // Inventory Reports
  static async getInventoryReport(req: AuthRequest, res: Response) {
    try {
      const { startDate, endDate } = req.query;
      const branchId = req.user?.branchId;

      const branchFilter = branchId ? { branchId } : {};

      // Get inventory summary by category
      const categoryReport = await Inventory.aggregate([
        { $match: branchFilter },
        {
          $group: {
            _id: '$category',
            totalItems: { $sum: 1 },
            totalValue: { $sum: { $multiply: ['$quantity', '$unitPrice'] } },
            lowStockItems: {
              $sum: {
                $cond: [
                  { $lte: ['$quantity', '$minStockLevel'] },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { totalValue: -1 } }
      ]);

      // Get top suppliers
      const supplierReport = await Inventory.aggregate([
        { $match: branchFilter },
        {
          $group: {
            _id: '$supplier',
            itemsSupplied: { $sum: 1 },
            totalValue: { $sum: { $multiply: ['$quantity', '$unitPrice'] } }
          }
        },
        { $sort: { totalValue: -1 } },
        { $limit: 10 }
      ]);

      // Overall statistics
      const totalItems = await Inventory.countDocuments(branchFilter);
      const totalValue = await Inventory.aggregate([
        { $match: branchFilter },
        { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } }
      ]);

      const lowStockCount = await Inventory.countDocuments({
        ...branchFilter,
        $expr: { $lte: ['$quantity', '$minStockLevel'] }
      });

      const reportData = {
        summary: {
          totalItems,
          totalValue: totalValue[0]?.total || 0,
          lowStockItems: lowStockCount,
          lowStockPercentage: totalItems > 0 ? ((lowStockCount / totalItems) * 100).toFixed(2) : 0
        },
        categoryBreakdown: categoryReport,
        topSuppliers: supplierReport,
        generatedAt: new Date(),
        reportPeriod: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Current'
        }
      };

      return res.json(ResponseHelper.success(reportData, 'Inventory report generated successfully'));
    } catch (error) {
      logger.error('Get inventory report error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to generate inventory report'));
    }
  }

  static async getInventoryReportByBranch(req: AuthRequest, res: Response) {
    try {
      const { branchId } = req.params;
      const { startDate, endDate } = req.query;

      const categoryReport = await Inventory.aggregate([
        { $match: { branchId } },
        {
          $group: {
            _id: '$category',
            totalItems: { $sum: 1 },
            totalValue: { $sum: { $multiply: ['$quantity', '$unitPrice'] } },
            lowStockItems: {
              $sum: {
                $cond: [
                  { $lte: ['$quantity', '$minStockLevel'] },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { totalValue: -1 } }
      ]);

      const supplierReport = await Inventory.aggregate([
        { $match: { branchId } },
        {
          $group: {
            _id: '$supplier',
            itemsSupplied: { $sum: 1 },
            totalValue: { $sum: { $multiply: ['$quantity', '$unitPrice'] } }
          }
        },
        { $sort: { totalValue: -1 } },
        { $limit: 10 }
      ]);

      const totalItems = await Inventory.countDocuments({ branchId });
      const totalValue = await Inventory.aggregate([
        { $match: { branchId } },
        { $group: { _id: null, total: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } }
      ]);

      const lowStockCount = await Inventory.countDocuments({
        branchId,
        $expr: { $lte: ['$quantity', '$minStockLevel'] }
      });

      const reportData = {
        branchId,
        summary: {
          totalItems,
          totalValue: totalValue[0]?.total || 0,
          lowStockItems: lowStockCount,
          lowStockPercentage: totalItems > 0 ? ((lowStockCount / totalItems) * 100).toFixed(2) : 0
        },
        categoryBreakdown: categoryReport,
        topSuppliers: supplierReport,
        generatedAt: new Date(),
        reportPeriod: {
          startDate: startDate || 'All time',
          endDate: endDate || 'Current'
        }
      };

      return res.json(ResponseHelper.success(reportData, 'Branch inventory report generated successfully'));
    } catch (error) {
      logger.error('Get branch inventory report error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to generate branch inventory report'));
    }
  }
}