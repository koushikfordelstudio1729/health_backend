import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Employee, User } from '../models';
import { ResponseHelper, QueryHelper } from '../utils/helpers';
import { IDGenerator } from '../utils/idGenerator';
import { EmailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { TaskStatus, LeaveStatus, ComplaintStatus } from '../types';

export class EmployeeController {
  // Employee Management
  static async createEmployee(req: AuthRequest, res: Response) {
    try {
      const { userId, designation, department, joiningDate, salary, branchId: requestBranchId } = req.body;
      // For admin users, allow branchId from request body, otherwise use user's branchId
      const branchId = req.user?.branchId || requestBranchId;

      if (!branchId) {
        return res.status(400).json(ResponseHelper.error('Branch ID required', 400));
      }

      // Verify user exists and belongs to the same branch (or if admin, just verify user exists)
      const userQuery = req.user?.role === 'ADMIN' ? { _id: userId, isActive: true } : { _id: userId, branchId, isActive: true };
      const user = await User.findOne(userQuery);
      if (!user) {
        return res.status(404).json(ResponseHelper.error('User not found or not in the same branch', 404));
      }

      // Check if employee record already exists for this user
      const existingEmployee = await Employee.findOne({ userId });
      if (existingEmployee) {
        return res.status(400).json(ResponseHelper.error('Employee record already exists for this user', 400));
      }

      const employeeId = await IDGenerator.generateEmployeeId(branchId);

      const employee = new Employee({
        employeeId,
        userId,
        designation,
        department,
        joiningDate: new Date(joiningDate),
        salary,
        tasks: [],
        leaves: [],
        complaints: [],
        branchId
      });

      await employee.save();

      await employee.populate('userId', 'name email phone role');

      logger.info(`Employee created: ${employeeId} by user ${req.user?.userId}`);

      return res.status(201).json(ResponseHelper.success(employee, 'Employee created successfully'));
    } catch (error) {
      logger.error('Create employee error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create employee'));
    }
  }

  static async getEmployees(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, department, designation } = req.query;
      const branchId = req.user?.branchId;

      const query = QueryHelper.buildFilterQuery({ search, department, designation }, branchId);

      if (search) {
        // We'll need to search in populated user data, so we'll do this differently
        const users = await User.find({
          name: { $regex: search, $options: 'i' },
          isActive: true
        }).select('_id');

        const userIds = users.map(user => user._id);
        query.$or = [
          { userId: { $in: userIds } },
          { employeeId: { $regex: search, $options: 'i' } },
          { department: { $regex: search, $options: 'i' } },
          { designation: { $regex: search, $options: 'i' } }
        ];
      }

      const employees = await Employee.find(query)
        .populate('userId', 'name email phone role isActive')
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Employee.countDocuments(query);

      // Add computed fields
      const enhancedEmployees = employees.map(emp => ({
        ...emp.toObject(),
        activeTasks: emp.tasks.filter(task => task.status !== TaskStatus.COMPLETED).length,
        pendingLeaves: emp.leaves.filter(leave => leave.status === LeaveStatus.PENDING).length,
        openComplaints: emp.complaints.filter(complaint => complaint.status === ComplaintStatus.OPEN).length
      }));

      return res.json(ResponseHelper.paginated(enhancedEmployees, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get employees error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch employees'));
    }
  }

  static async getEmployeesByBranch(req: AuthRequest, res: Response) {
    try {
      const { branchId } = req.params;
      const { page = 1, limit = 10, search, department, designation } = req.query;

      const query = QueryHelper.buildFilterQuery({ search, department, designation }, branchId);

      if (search) {
        // We'll need to search in populated user data, so we'll do this differently
        const users = await User.find({
          name: { $regex: search, $options: 'i' },
          isActive: true
        }).select('_id');

        const userIds = users.map(user => user._id);
        query.$or = [
          { userId: { $in: userIds } },
          { employeeId: { $regex: search, $options: 'i' } },
          { department: { $regex: search, $options: 'i' } },
          { designation: { $regex: search, $options: 'i' } }
        ];
      }

      const employees = await Employee.find(query)
        .populate('userId', 'name email phone role isActive')
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Employee.countDocuments(query);

      // Add computed fields
      const enhancedEmployees = employees.map(emp => ({
        ...emp.toObject(),
        activeTasks: emp.tasks.filter(task => task.status !== TaskStatus.COMPLETED).length,
        pendingLeaves: emp.leaves.filter(leave => leave.status === LeaveStatus.PENDING).length,
        openComplaints: emp.complaints.filter(complaint => complaint.status === ComplaintStatus.OPEN).length
      }));

      return res.json(ResponseHelper.paginated(enhancedEmployees, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get employees by branch error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch employees'));
    }
  }

  static async getEmployeeDetails(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const branchId = req.user?.branchId;

      const employee = await Employee.findOne({
        _id: id,
        ...(branchId && { branchId })
      }).populate('userId', 'name email phone role isActive');

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee not found', 404));
      }

      // Get task summary
      const taskSummary = {
        total: employee.tasks.length,
        pending: employee.tasks.filter(task => task.status === TaskStatus.PENDING).length,
        inProgress: employee.tasks.filter(task => task.status === TaskStatus.IN_PROGRESS).length,
        completed: employee.tasks.filter(task => task.status === TaskStatus.COMPLETED).length
      };

      // Get leave summary
      const leaveSummary = {
        total: employee.leaves.length,
        pending: employee.leaves.filter(leave => leave.status === LeaveStatus.PENDING).length,
        approved: employee.leaves.filter(leave => leave.status === LeaveStatus.APPROVED).length,
        rejected: employee.leaves.filter(leave => leave.status === LeaveStatus.REJECTED).length
      };

      // Get complaint summary
      const complaintSummary = {
        total: employee.complaints.length,
        open: employee.complaints.filter(complaint => complaint.status === ComplaintStatus.OPEN).length,
        inProgress: employee.complaints.filter(complaint => complaint.status === ComplaintStatus.IN_PROGRESS).length,
        resolved: employee.complaints.filter(complaint => complaint.status === ComplaintStatus.RESOLVED).length
      };

      return res.json(ResponseHelper.success({
        employee,
        summaries: {
          tasks: taskSummary,
          leaves: leaveSummary,
          complaints: complaintSummary
        }
      }, 'Employee details retrieved successfully'));
    } catch (error) {
      logger.error('Get employee details error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch employee details'));
    }
  }

  // Task Management
  static async assignTask(req: AuthRequest, res: Response) {
    try {
      const { employeeId, title, description, dueDate } = req.body;
      const branchId = req.user?.branchId;

      const employee = await Employee.findOne({
        employeeId,
        ...(branchId && { branchId })
      }).populate('userId', 'name email');

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee not found', 404));
      }

      const taskId = await IDGenerator.generateTaskId(employee.branchId);

      const newTask = {
        taskId,
        title,
        description,
        status: TaskStatus.PENDING,
        assignedDate: new Date(),
        dueDate: new Date(dueDate)
      };

      employee.tasks.push(newTask);
      await employee.save();

      // Send email notification
      const userData = employee.userId as any;
      if (userData.email) {
        await EmailService.sendTaskAssignmentEmail(
          userData.email,
          userData.name,
          title,
          new Date(dueDate)
        );
      }

      logger.info(`Task assigned: ${taskId} to employee ${employeeId} by user ${req.user?.userId}`);

      return res.status(201).json(ResponseHelper.success(newTask, 'Task assigned successfully'));
    } catch (error) {
      logger.error('Assign task error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to assign task'));
    }
  }

  static async updateTaskStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { taskId, status, completedDate } = req.body;
      const branchId = req.user?.branchId;

      const employee = await Employee.findOne({
        _id: id,
        ...(branchId && { branchId })
      });

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee not found', 404));
      }

      const taskIndex = employee.tasks.findIndex(task => task.taskId === taskId);
      if (taskIndex === -1) {
        return res.status(404).json(ResponseHelper.error('Task not found', 404));
      }

      employee.tasks[taskIndex].status = status;
      
      if (status === TaskStatus.COMPLETED) {
        employee.tasks[taskIndex].completedDate = completedDate ? new Date(completedDate) : new Date();
      }

      await employee.save();

      logger.info(`Task status updated: ${taskId} to ${status} by user ${req.user?.userId}`);

      return res.json(ResponseHelper.success(employee.tasks[taskIndex], 'Task status updated successfully'));
    } catch (error) {
      logger.error('Update task status error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update task status'));
    }
  }

  // Leave Management
  static async applyLeave(req: AuthRequest, res: Response) {
    try {
      const { leaveType, fromDate, toDate, reason } = req.body;
      const userId = req.user?._id;

      // Find employee by user ID
      const employee = await Employee.findOne({ userId }).populate('userId', 'name email');

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee record not found', 404));
      }

      const leaveId = await IDGenerator.generateLeaveId(employee.branchId);

      const newLeave = {
        leaveId,
        leaveType,
        fromDate: new Date(fromDate),
        toDate: new Date(toDate),
        reason,
        status: LeaveStatus.PENDING,
        appliedDate: new Date()
      };

      employee.leaves.push(newLeave);
      await employee.save();

      logger.info(`Leave applied: ${leaveId} by employee ${employee.employeeId}`);

      return res.status(201).json(ResponseHelper.success(newLeave, 'Leave application submitted successfully'));
    } catch (error) {
      logger.error('Apply leave error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to apply for leave'));
    }
  }

  static async updateLeaveStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { leaveId, status } = req.body;
      const branchId = req.user?.branchId;

      const employee = await Employee.findOne({
        _id: id,
        ...(branchId && { branchId })
      }).populate('userId', 'name email');

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee not found', 404));
      }

      const leaveIndex = employee.leaves.findIndex(leave => leave.leaveId === leaveId);
      if (leaveIndex === -1) {
        return res.status(404).json(ResponseHelper.error('Leave application not found', 404));
      }

      employee.leaves[leaveIndex].status = status;
      await employee.save();

      // Send email notification
      const userData = employee.userId as any;
      const leave = employee.leaves[leaveIndex];
      
      if (userData.email) {
        await EmailService.sendLeaveStatusUpdate(
          userData.email,
          userData.name,
          leave.leaveType,
          status,
          leave.fromDate,
          leave.toDate
        );
      }

      logger.info(`Leave status updated: ${leaveId} to ${status} by user ${req.user?.userId}`);

      return res.json(ResponseHelper.success(employee.leaves[leaveIndex], 'Leave status updated successfully'));
    } catch (error) {
      logger.error('Update leave status error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update leave status'));
    }
  }

  // Complaint Management
  static async submitComplaint(req: AuthRequest, res: Response) {
    try {
      const { subject, description } = req.body;
      const userId = req.user?._id;

      // Find employee by user ID
      const employee = await Employee.findOne({ userId });

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee record not found', 404));
      }

      const complaintId = await IDGenerator.generateComplaintId(employee.branchId);

      const newComplaint = {
        complaintId,
        subject,
        description,
        status: ComplaintStatus.OPEN,
        submittedDate: new Date()
      };

      employee.complaints.push(newComplaint);
      await employee.save();

      logger.info(`Complaint submitted: ${complaintId} by employee ${employee.employeeId}`);

      return res.status(201).json(ResponseHelper.success(newComplaint, 'Complaint submitted successfully'));
    } catch (error) {
      logger.error('Submit complaint error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to submit complaint'));
    }
  }

  static async updateComplaintStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { complaintId, status } = req.body;
      const branchId = req.user?.branchId;

      const employee = await Employee.findOne({
        _id: id,
        ...(branchId && { branchId })
      });

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee not found', 404));
      }

      const complaintIndex = employee.complaints.findIndex(complaint => complaint.complaintId === complaintId);
      if (complaintIndex === -1) {
        return res.status(404).json(ResponseHelper.error('Complaint not found', 404));
      }

      employee.complaints[complaintIndex].status = status;
      await employee.save();

      logger.info(`Complaint status updated: ${complaintId} to ${status} by user ${req.user?.userId}`);

      return res.json(ResponseHelper.success(employee.complaints[complaintIndex], 'Complaint status updated successfully'));
    } catch (error) {
      logger.error('Update complaint status error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update complaint status'));
    }
  }

  // Employee Dashboard for self-service
  static async getEmployeeDashboard(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?._id;

      const employee = await Employee.findOne({ userId }).populate('userId', 'name email role');

      if (!employee) {
        return res.status(404).json(ResponseHelper.error('Employee record not found', 404));
      }

      // Get current tasks
      const activeTasks = employee.tasks.filter(task => task.status !== TaskStatus.COMPLETED);
      
      // Get recent leaves
      const recentLeaves = employee.leaves
        .sort((a, b) => b.appliedDate.getTime() - a.appliedDate.getTime())
        .slice(0, 5);

      // Get recent complaints
      const recentComplaints = employee.complaints
        .sort((a, b) => b.submittedDate.getTime() - a.submittedDate.getTime())
        .slice(0, 5);

      const dashboardData = {
        employee: {
          name: (employee.userId as any).name,
          employeeId: employee.employeeId,
          designation: employee.designation,
          department: employee.department,
          joiningDate: employee.joiningDate
        },
        tasks: {
          active: activeTasks,
          summary: {
            pending: employee.tasks.filter(task => task.status === TaskStatus.PENDING).length,
            inProgress: employee.tasks.filter(task => task.status === TaskStatus.IN_PROGRESS).length,
            completed: employee.tasks.filter(task => task.status === TaskStatus.COMPLETED).length
          }
        },
        leaves: {
          recent: recentLeaves,
          summary: {
            pending: employee.leaves.filter(leave => leave.status === LeaveStatus.PENDING).length,
            approved: employee.leaves.filter(leave => leave.status === LeaveStatus.APPROVED).length,
            rejected: employee.leaves.filter(leave => leave.status === LeaveStatus.REJECTED).length
          }
        },
        complaints: {
          recent: recentComplaints,
          summary: {
            open: employee.complaints.filter(complaint => complaint.status === ComplaintStatus.OPEN).length,
            inProgress: employee.complaints.filter(complaint => complaint.status === ComplaintStatus.IN_PROGRESS).length,
            resolved: employee.complaints.filter(complaint => complaint.status === ComplaintStatus.RESOLVED).length
          }
        }
      };

      return res.json(ResponseHelper.success(dashboardData, 'Employee dashboard retrieved successfully'));
    } catch (error) {
      logger.error('Get employee dashboard error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch employee dashboard'));
    }
  }
}