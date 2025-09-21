import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { Branch, User, Doctor, Test, Patient, TestOrder, Commission,  } from '../models';
import { ResponseHelper,  } from '../utils/helpers';
import { IDGenerator } from '../utils/idGenerator';
import { EmailService } from '../services/email.service';
import { logger } from '../utils/logger';
import { UserRole, PaymentStatus } from '../types';

export class AdminController {

  // Branch Management
  static async createBranch(req: AuthRequest, res: Response) {
    try {
      const { name, address, contact, email } = req.body;
      
      const branchId = await IDGenerator.generateBranchId();
      
      const branch = new Branch({
        branchId,
        name,
        address,
        contact,
        email
      });

      await branch.save();
      
      logger.info(`Branch created: ${branchId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(branch, 'Branch created successfully'));
    } catch (error) {
      logger.error('Create branch error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create branch'));
    }
  }

  static async getBranches(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search } = req.query;
      
      const query: any = { isActive: true };
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { branchId: { $regex: search, $options: 'i' } },
          { contact: { $regex: search, $options: 'i' } }
        ];
      }

      const branches = await Branch.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Branch.countDocuments(query);

      return res.json(ResponseHelper.paginated(branches, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get branches error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch branches'));
    }
  }

  static async getBranch(req: AuthRequest, res: Response) {
    try {
      const { branchId } = req.params;
      
      // Try to find by branchId first, then by MongoDB _id if it looks like an ObjectId
      let branch;
      if (branchId.match(/^[0-9a-fA-F]{24}$/)) {
        // If it looks like a MongoDB ObjectId, search by _id
        branch = await Branch.findById(branchId);
      } else {
        // Otherwise, search by branchId field
        branch = await Branch.findOne({ branchId, isActive: true });
      }
      
      // If not found by either method and it's not an ObjectId format, try both
      if (!branch && !branchId.match(/^[0-9a-fA-F]{24}$/)) {
        branch = await Branch.findOne({ 
          $or: [
            { branchId: branchId },
            { _id: branchId }
          ],
          isActive: true 
        });
      }
      
      if (!branch) {
        return res.status(404).json(ResponseHelper.error('Branch not found', 404));
      }

      logger.info(`Branch retrieved: ${branch.branchId} by user ${req.user?.userId}`);
      
      return res.json(ResponseHelper.success(branch, 'Branch retrieved successfully'));
    } catch (error) {
      logger.error('Get branch error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch branch'));
    }
  }

  static async updateBranch(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const branch = await Branch.findByIdAndUpdate(id, updateData, { new: true });
      
      if (!branch) {
        return res.status(404).json(ResponseHelper.error('Branch not found', 404));
      }

      logger.info(`Branch updated: ${branch.branchId} by user ${req.user?.userId}`);
      
      return res.json(ResponseHelper.success(branch, 'Branch updated successfully'));
    } catch (error) {
      logger.error('Update branch error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update branch'));
    }
  }

  // User Management
  static async createUser(req: AuthRequest, res: Response) {
    try {
      const { username, name, email, phone, role, branchId, accessLevel, password } = req.body;
      
      // Check if username or email already exists
      const existingUser = await User.findOne({
        $or: [
          { username: username.toLowerCase() },
          { email: email.toLowerCase() }
        ]
      });

      if (existingUser) {
        return res.status(400).json(ResponseHelper.error('Username or email already exists', 400));
      }

      // Use the password provided by admin
      const userPassword = password;

      const userId = await IDGenerator.generateUserId(branchId || 'ADMIN', role);
      
      const user = new User({
        userId,
        username: username.toLowerCase(),
        password: userPassword, // This will be hashed by the pre-save middleware
        name,
        email: email.toLowerCase(),
        phone,
        role,
        branchId: role === UserRole.ADMIN ? null : branchId,
        accessLevel: accessLevel || [],
        createdBy: req.user?._id
      });

      await user.save();
      
      logger.info(`User created: ${userId} (${role}) by user ${req.user?.userId}`);
      
      // Get branch name for email
      let branchName = undefined;
      if (branchId) {
        const branch = await Branch.findOne({ branchId });
        branchName = branch?.name;
      }

      // Send welcome email with credentials
      try {
        await EmailService.sendUserCreationEmail(
          email.toLowerCase(),
          name,
          username.toLowerCase(),
          userPassword,
          role,
          branchName
        );
        logger.info(`Welcome email sent to new user: ${email}`);
      } catch (emailError) {
        logger.error('Failed to send welcome email:', emailError);
        // Continue with user creation even if email fails
      }

      // Remove password from response
      const userResponse = user.toJSON();
      
      return res.status(201).json(ResponseHelper.success({
        ...userResponse,
        message: 'User created successfully. Welcome email has been sent with login credentials.'
      }, 'User created successfully'));
    } catch (error) {
      logger.error('Create user error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create user'));
    }
  }

  static async getUsers(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, role, branchId, isActive } = req.query;
      
      const query: any = {};
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { userId: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      if (role) query.role = role;
      if (branchId) query.branchId = branchId;
      if (isActive !== undefined) query.isActive = isActive === 'true';

      const users = await User.find(query)
        .populate('createdBy', 'name userId')
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await User.countDocuments(query);

      return res.json(ResponseHelper.paginated(users, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get users error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch users'));
    }
  }

  static async updateUser(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Remove sensitive fields from update
      delete updateData.password;
      delete updateData.userId;
      delete updateData.username;

      const user = await User.findByIdAndUpdate(id, updateData, { new: true });
      
      if (!user) {
        return res.status(404).json(ResponseHelper.error('User not found', 404));
      }

      logger.info(`User updated: ${user.userId} by user ${req.user?.userId}`);
      
      return res.json(ResponseHelper.success(user, 'User updated successfully'));
    } catch (error) {
      logger.error('Update user error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update user'));
    }
  }

  // Doctor Management
  static async createDoctor(req: AuthRequest, res: Response) {
    try {
      const { name, specialization, contact, email, consultationFee, commissionRate, availableBranches } = req.body;
      
      // Check if doctor with same email already exists
      const existingDoctorByEmail = await Doctor.findOne({ 
        email: email.toLowerCase(),
        isActive: true 
      });

      if (existingDoctorByEmail) {
        return res.status(400).json(ResponseHelper.error('Doctor with this email already exists', 400));
      }

      // Check if doctor with same contact already exists
      const existingDoctorByContact = await Doctor.findOne({ 
        contact,
        isActive: true 
      });

      if (existingDoctorByContact) {
        return res.status(400).json(ResponseHelper.error('Doctor with this contact number already exists', 400));
      }

      // Check if doctor with same name and specialization already exists in any of the provided branches
      if (availableBranches && availableBranches.length > 0) {
        const existingDoctorInBranch = await Doctor.findOne({
          name: { $regex: `^${name.trim()}$`, $options: 'i' },
          specialization: { $regex: `^${specialization.trim()}$`, $options: 'i' },
          availableBranches: { $in: availableBranches },
          isActive: true
        });

        if (existingDoctorInBranch) {
          return res.status(400).json(ResponseHelper.error('Doctor with same name and specialization already exists in one of the selected branches', 400));
        }
      }
      
      const doctorId = await IDGenerator.generateDoctorId();
      
      const doctor = new Doctor({
        doctorId,
        name: name.trim(),
        specialization: specialization.trim(),
        contact,
        email: email.toLowerCase(),
        consultationFee,
        commissionRate,
        availableBranches
      });

      await doctor.save();
      
      logger.info(`Doctor created: ${doctorId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(doctor, 'Doctor created successfully'));
    } catch (error) {
      logger.error('Create doctor error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create doctor'));
    }
  }

  static async getDoctors(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, specialization, branchId, isActive } = req.query;
      
      const query: any = {};
      
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { doctorId: { $regex: search, $options: 'i' } },
          { specialization: { $regex: search, $options: 'i' } }
        ];
      }

      if (specialization) query.specialization = { $regex: specialization, $options: 'i' };
      if (branchId) query.availableBranches = { $in: [branchId] };
      if (isActive !== undefined) query.isActive = isActive === 'true';

      const doctors = await Doctor.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Doctor.countDocuments(query);

      return res.json(ResponseHelper.paginated(doctors, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get doctors error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch doctors'));
    }
  }

  static async updateDoctor(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Try to find doctor by doctorId first, then by MongoDB _id
      let doctor = await Doctor.findOne({ doctorId: id });
      if (!doctor && id.match(/^[0-9a-fA-F]{24}$/)) {
        doctor = await Doctor.findById(id);
      }
      
      if (!doctor) {
        return res.status(404).json(ResponseHelper.error('Doctor not found', 404));
      }

      // Check if trying to deactivate doctor with pending commissions
      if (updateData.isActive === false && doctor.isActive === true) {
        const pendingCommissions = await Commission.countDocuments({
          doctorId: doctor._id,
          paymentStatus: PaymentStatus.PENDING
        });

        if (pendingCommissions > 0) {
          return res.status(400).json(ResponseHelper.error(
            `Cannot deactivate doctor. There are ${pendingCommissions} pending commission payments. Please process all pending commissions first.`, 
            400
          ));
        }

        logger.info(`Deactivating doctor: ${doctor.doctorId} by user ${req.user?.userId}`);
      }

      // Log the update data for debugging
      logger.info(`Updating doctor ${doctor.doctorId} with data:`, updateData);
      
      // Update the doctor
      Object.assign(doctor, updateData);
      await doctor.save();

      logger.info(`Doctor updated: ${doctor.doctorId} by user ${req.user?.userId}, isActive: ${doctor.isActive}`);
      
      return res.json(ResponseHelper.success(doctor, 'Doctor updated successfully'));
    } catch (error) {
      logger.error('Update doctor error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update doctor'));
    }
  }

  // Test Management
  static async createTest(req: AuthRequest, res: Response) {
    try {
      const { testName, category, price, commissionRate, availableBranches } = req.body;
      
      const testId = await IDGenerator.generateTestId();
      
      const test = new Test({
        testId,
        testName,
        category,
        price,
        commissionRate,
        availableBranches
      });

      await test.save();
      
      logger.info(`Test created: ${testId} by user ${req.user?.userId}`);
      
      return res.status(201).json(ResponseHelper.success(test, 'Test created successfully'));
    } catch (error) {
      logger.error('Create test error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to create test'));
    }
  }

  static async getTests(req: AuthRequest, res: Response) {
    try {
      const { page = 1, limit = 10, search, category, branchId, isActive } = req.query;
      
      const query: any = {};
      
      if (search) {
        query.$or = [
          { testName: { $regex: search, $options: 'i' } },
          { testId: { $regex: search, $options: 'i' } }
        ];
      }

      if (category) query.category = category;
      if (branchId) query.availableBranches = { $in: [branchId] };
      if (isActive !== undefined) query.isActive = isActive === 'true';

      const tests = await Test.find(query)
        .sort({ createdAt: -1 })
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Test.countDocuments(query);

      return res.json(ResponseHelper.paginated(tests, total, Number(page), Number(limit)));
    } catch (error) {
      logger.error('Get tests error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch tests'));
    }
  }

  static async updateTest(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const test = await Test.findByIdAndUpdate(id, updateData, { new: true });
      
      if (!test) {
        return res.status(404).json(ResponseHelper.error('Test not found', 404));
      }

      logger.info(`Test updated: ${test.testId} by user ${req.user?.userId}`);
      
      return res.json(ResponseHelper.success(test, 'Test updated successfully'));
    } catch (error) {
      logger.error('Update test error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to update test'));
    }
  }

  // Dashboard and Reports
  static async getDashboard(req: AuthRequest, res: Response) {
    try {
      // Role-based access control for dashboard data
      const userRole = req.user?.role;
      const userBranchId = req.user?.branchId;
      const userAccessLevel = (req.user as any)?.accessLevel || [];
      
      // Determine branch filtering based on user role
      let branchId: string | undefined;
      let allowedDataTypes: string[] = [];
      
      switch (userRole) {
        case UserRole.ADMIN:
          // Admin can see all data and can filter by specific branch via query param
          branchId = req.query.branchId as string;
          allowedDataTypes = ['patients', 'orders', 'revenue', 'commissions', 'staff', 'activities'];
          break;
          
        case UserRole.BRANCH_MANAGER:
          // Branch managers can only see their branch data
          branchId = userBranchId;
          allowedDataTypes = ['patients', 'orders', 'revenue', 'commissions', 'staff', 'activities'];
          break;
          
        case UserRole.OPD_STAFF:
          // OPD staff can see patients, appointments, and basic revenue for their branch
          branchId = userBranchId;
          allowedDataTypes = ['patients', 'orders', 'activities'];
          if (userAccessLevel.includes('VIEW_REVENUE')) allowedDataTypes.push('revenue');
          break;
          
        case UserRole.LAB_STAFF:
          // Lab staff can see test orders and lab-related activities for their branch
          branchId = userBranchId;
          allowedDataTypes = ['orders', 'activities'];
          if (userAccessLevel.includes('VIEW_REVENUE')) allowedDataTypes.push('revenue');
          break;
          
        case UserRole.PHARMACY_STAFF:
          // Pharmacy staff can see basic stats for their branch
          branchId = userBranchId;
          allowedDataTypes = ['orders', 'activities'];
          if (userAccessLevel.includes('VIEW_REVENUE')) allowedDataTypes.push('revenue');
          break;
          
        case UserRole.MARKETING_EMPLOYEE:
          // Marketing employees can see patient stats and commission data
          branchId = userBranchId;
          allowedDataTypes = ['patients', 'commissions', 'activities'];
          break;
          
        case UserRole.GENERAL_EMPLOYEE:
          // General employees have limited access based on their access level
          branchId = userBranchId;
          allowedDataTypes = ['activities'];
          if (userAccessLevel.includes('VIEW_PATIENTS')) allowedDataTypes.push('patients');
          if (userAccessLevel.includes('VIEW_ORDERS')) allowedDataTypes.push('orders');
          if (userAccessLevel.includes('VIEW_REVENUE')) allowedDataTypes.push('revenue');
          break;
          
        default:
          // No access for unknown roles
          return res.status(403).json(ResponseHelper.error('Access denied', 403));
      }
      
      const { startDate, endDate } = req.query;

      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      const yesterdayStart = new Date(now);
      yesterdayStart.setDate(now.getDate() - 1);
      yesterdayStart.setHours(0, 0, 0, 0);
      const yesterdayEnd = new Date(now);
      yesterdayEnd.setDate(now.getDate() - 1);
      yesterdayEnd.setHours(23, 59, 59, 999);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const dateFilter: any = {};
      if (startDate && endDate) {
        dateFilter.createdAt = {
          $gte: new Date(startDate as string),
          $lte: new Date(endDate as string)
        };
      }

      const branchFilter = branchId ? { branchId } : {};

      // Get dashboard statistics with comparisons
      const [
        totalPatients,
        lastMonthPatients,
        newPatientsThisMonth,
        totalOrders,
        pendingOrders,
        yesterdayPendingOrders,
        completedOrders,
        totalRevenue,
        lastMonthRevenue,
        totalCommissions,
        paidCommissions,
        totalStaff,
        newStaffThisWeek,
        recentPatients,
        recentTestOrders,
        recentPayments
      ] = await Promise.all([
        Patient.countDocuments({ ...branchFilter, ...dateFilter }),
        Patient.countDocuments({ ...branchFilter, createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } }),
        Patient.countDocuments({ ...branchFilter, createdAt: { $gte: currentMonthStart } }),
        TestOrder.countDocuments({ ...branchFilter, ...dateFilter }),
        TestOrder.countDocuments({ ...branchFilter, paymentStatus: PaymentStatus.PENDING }),
        TestOrder.countDocuments({ ...branchFilter, paymentStatus: PaymentStatus.PENDING, createdAt: { $gte: yesterdayStart, $lte: yesterdayEnd } }),
        TestOrder.countDocuments({ ...branchFilter, paymentStatus: PaymentStatus.PAID }),
        TestOrder.aggregate([
          { $match: { ...branchFilter, ...dateFilter, paymentStatus: PaymentStatus.PAID } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]),
        TestOrder.aggregate([
          { $match: { ...branchFilter, paymentStatus: PaymentStatus.PAID, createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd } } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } }
        ]),
        Commission.aggregate([
          { $match: { ...branchFilter, ...dateFilter } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        Commission.aggregate([
          { $match: { ...branchFilter, paymentStatus: PaymentStatus.PAID } },
          { $group: { _id: null, total: { $sum: '$amount' } } }
        ]),
        User.countDocuments({ ...branchFilter, isActive: true }),
        User.countDocuments({ ...branchFilter, createdAt: { $gte: weekAgo } }),
        // Recent activities
        Patient.find({ ...branchFilter }).sort({ createdAt: -1 }).limit(5).select('name createdAt'),
        TestOrder.find({ ...branchFilter }).sort({ updatedAt: -1 }).limit(5).select('orderId paymentStatus updatedAt'),
        TestOrder.find({ ...branchFilter, paymentStatus: PaymentStatus.PAID }).sort({ updatedAt: -1 }).limit(5).select('totalAmount updatedAt')
      ]);

      // Calculate percentage changes
      const patientChange = lastMonthPatients > 0 ? Math.round(((totalPatients - lastMonthPatients) / lastMonthPatients) * 100) : 0;
      const pendingTestsChange = yesterdayPendingOrders > 0 ? Math.round(((pendingOrders - yesterdayPendingOrders) / yesterdayPendingOrders) * 100) : 0;
      const revenueChange = lastMonthRevenue[0]?.total > 0 ? Math.round((((totalRevenue[0]?.total || 0) - lastMonthRevenue[0]?.total) / lastMonthRevenue[0]?.total) * 100) : 0;

      // Format recent activities
      const recentActivities: Array<{
        type: string;
        message: string;
        timestamp: Date;
        timeAgo: string;
      }> = [];
      
      // Add recent patient registrations
      recentPatients.forEach(patient => {
        const timeDiff = now.getTime() - patient.createdAt.getTime();
        const minutesAgo = Math.floor(timeDiff / (1000 * 60));
        recentActivities.push({
          type: 'patient_registered',
          message: `New patient registered: ${patient.name}`,
          timestamp: patient.createdAt,
          timeAgo: minutesAgo < 60 ? `${minutesAgo} minutes ago` : `${Math.floor(minutesAgo / 60)} hours ago`
        });
      });

      // Add recent test completions
      recentTestOrders.forEach(order => {
        if (order.paymentStatus === PaymentStatus.PAID) {
          const timeDiff = now.getTime() - order.updatedAt.getTime();
          const minutesAgo = Math.floor(timeDiff / (1000 * 60));
          recentActivities.push({
            type: 'lab_results_completed',
            message: `Lab results completed`,
            timestamp: order.updatedAt,
            timeAgo: minutesAgo < 60 ? `${minutesAgo} minutes ago` : `${Math.floor(minutesAgo / 60)} hours ago`
          });
        }
      });

      // Add recent payments
      recentPayments.forEach(payment => {
        const timeDiff = now.getTime() - payment.updatedAt.getTime();
        const minutesAgo = Math.floor(timeDiff / (1000 * 60));
        recentActivities.push({
          type: 'payment_processed',
          message: `Payment processed: ₹${payment.totalAmount}`,
          timestamp: payment.updatedAt,
          timeAgo: minutesAgo < 60 ? `${minutesAgo} minutes ago` : `${Math.floor(minutesAgo / 60)} hours ago`
        });
      });

      // Sort activities by timestamp and limit to 10
      recentActivities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      const limitedActivities = recentActivities.slice(0, 10);

      // Build dashboard data based on user permissions
      const dashboardData: any = {};
      
      if (allowedDataTypes.includes('patients')) {
        dashboardData.patients = {
          total: totalPatients,
          new: newPatientsThisMonth,
          change: patientChange,
          changeLabel: `${patientChange >= 0 ? '+' : ''}${patientChange}% from last month`
        };
      }
      
      if (allowedDataTypes.includes('orders')) {
        dashboardData.orders = {
          total: totalOrders,
          pending: pendingOrders,
          completed: completedOrders,
          pendingChange: pendingTestsChange,
          pendingChangeLabel: `${pendingTestsChange >= 0 ? '+' : ''}${pendingTestsChange}% from yesterday`
        };
      }
      
      if (allowedDataTypes.includes('revenue')) {
        dashboardData.revenue = {
          total: totalRevenue[0]?.total || 0,
          pending: 0,
          change: revenueChange,
          changeLabel: `${revenueChange >= 0 ? '+' : ''}${revenueChange}% from last month`
        };
      }
      
      if (allowedDataTypes.includes('commissions')) {
        dashboardData.commissions = {
          total: totalCommissions[0]?.total || 0,
          paid: paidCommissions[0]?.total || 0,
          pending: (totalCommissions[0]?.total || 0) - (paidCommissions[0]?.total || 0)
        };
      }
      
      if (allowedDataTypes.includes('staff')) {
        dashboardData.staff = {
          total: totalStaff,
          newThisWeek: newStaffThisWeek,
          changeLabel: `+${newStaffThisWeek} new this week`
        };
      }
      
      if (allowedDataTypes.includes('activities')) {
        dashboardData.recentActivities = limitedActivities;
      }
      
      // Add user context information
      dashboardData.userContext = {
        role: userRole,
        branchId: branchId,
        allowedDataTypes: allowedDataTypes,
        branchName: branchId ? (await Branch.findOne({ branchId }))?.name : 'All Branches'
      };

      return res.json(ResponseHelper.success(dashboardData, 'Dashboard data retrieved successfully'));
    } catch (error) {
      logger.error('Get dashboard error:', error);
      return res.status(500).json(ResponseHelper.error('Failed to fetch dashboard data'));
    }
  }
}