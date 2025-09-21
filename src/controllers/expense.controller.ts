import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Expense } from '../models';
import { ResponseHelper, QueryHelper } from '../utils/helpers';
import { IDGenerator } from '../utils/idGenerator';
import { logger } from '../utils/logger';

export class ExpenseController {
  // Create expense
  static async createExpense(req: AuthRequest, res: Response) {
    try {
      const { title, description, amount, category, date, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;
      
      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      const expenseId = await IDGenerator.generateExpenseId(branchId);
      
      const expense = new Expense({
        expenseId,
        title,
        description,
        amount,
        category,
        date: date ? new Date(date) : new Date(),
        branchId,
        createdBy: req.user?._id,
        attachments: []
      });

      await expense.save();
      
      logger.info(`Expense created: ${expenseId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(expense, 'Expense created successfully'));
    } catch (error) {
      logger.error('Create expense error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create expense'));
    }
  }

  // Get expenses
  static async getExpenses(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, category, sortBy, sortOrder } = req.query;
      const branchId = req.user?.branchId;
      
      const query = QueryHelper.buildFilterQuery({ search, category }, branchId);
      
      // Add search functionality for expenses
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { expenseId: { $regex: search, $options: 'i' } }
        ];
      }

      // Add category filter
      if (category) {
        query.category = category;
      }

      const sort = QueryHelper.buildSortQuery(sortBy as string, sortOrder as string);
      
      const expenses = await Expense.find(query)
        .populate('createdBy', 'name email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Expense.countDocuments(query);

      return res.json(ResponseHelper.paginated(expenses, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get expenses error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch expenses'));
    }
  }

  // Get expense by ID
  static async getExpenseById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const branchId = req.user?.branchId;

      const expense = await Expense.findOne({
        _id: id,
        ...(branchId && { branchId })
      }).populate('createdBy', 'name email');

      if (!expense) {
        return res.status(404).json(ResponseHelper.error('Expense not found', 404));
      }

      return res.json(ResponseHelper.success(expense, 'Expense details retrieved successfully'));
    } catch (error) {
      logger.error('Get expense by ID error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch expense'));
    }
  }

  // Update expense
  static async updateExpense(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { title, description, amount, category, date } = req.body;
      const branchId = req.user?.branchId;

      const expense = await Expense.findOne({
        _id: id,
        ...(branchId && { branchId })
      });

      if (!expense) {
        return res.status(404).json(ResponseHelper.error('Expense not found', 404));
      }

      // Update fields
      if (title !== undefined) expense.title = title;
      if (description !== undefined) expense.description = description;
      if (amount !== undefined) expense.amount = amount;
      if (category !== undefined) expense.category = category;
      if (date !== undefined) expense.date = new Date(date);

      await expense.save();

      logger.info(`Expense updated: ${expense.expenseId} by user ${req.user?.userId}`);

      return res.json(ResponseHelper.success(expense, 'Expense updated successfully'));
    } catch (error) {
      logger.error('Update expense error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update expense'));
    }
  }

  // Delete expense
  static async deleteExpense(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const branchId = req.user?.branchId;

      const expense = await Expense.findOne({
        _id: id,
        ...(branchId && { branchId })
      });

      if (!expense) {
        return res.status(404).json(ResponseHelper.error('Expense not found', 404));
      }

      await Expense.deleteOne({ _id: id });

      logger.info(`Expense deleted: ${expense.expenseId} by user ${req.user?.userId}`);

      return res.json(ResponseHelper.success(null, 'Expense deleted successfully'));
    } catch (error) {
      logger.error('Delete expense error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to delete expense'));
    }
  }

  // Get expense summary/dashboard
  static async getExpenseSummary(req: AuthRequest, res: Response) {
    try {
      const branchId = req.user?.branchId;
      const { startDate, endDate } = req.query;
      
      // Default to current month if no dates provided
      const start = startDate ? new Date(startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const end = endDate ? new Date(endDate as string) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

      const matchFilter: any = {
        date: { $gte: start, $lte: end }
      };
      
      if (branchId) {
        matchFilter.branchId = branchId;
      }

      // Total expenses
      const totalExpenses = await Expense.aggregate([
        { $match: matchFilter },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ]);

      // Expenses by category
      const expensesByCategory = await Expense.aggregate([
        { $match: matchFilter },
        { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        { $sort: { total: -1 } }
      ]);

      // Recent expenses
      const recentExpenses = await Expense.find(matchFilter)
        .populate('createdBy', 'name')
        .sort({ date: -1 })
        .limit(5);

      return res.json(ResponseHelper.success({
        summary: {
          totalAmount: totalExpenses[0]?.total || 0,
          totalCount: totalExpenses[0]?.count || 0,
          period: { start, end }
        },
        byCategory: expensesByCategory,
        recent: recentExpenses
      }, 'Expense summary retrieved successfully'));
    } catch (error) {
      logger.error('Get expense summary error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch expense summary'));
    }
  }
}