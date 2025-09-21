import { User } from '../models';
import { JWTHelper, ResponseHelper } from '../utils/helpers';
import { logger } from '../utils/logger';
import { UserRole } from '../types';

export class AuthService {
  static async login(username: string, password: string) {
    try {
      // Find user with password field included
      const user = await User.findOne({ 
        username: username.toLowerCase(), 
        isActive: true 
      }).select('+password');

      if (!user) {
        return ResponseHelper.error('Invalid username or password', 401);
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return ResponseHelper.error('Invalid username or password', 401);
      }

      // Update last login and store refresh token
      user.lastLogin = new Date();

      // Generate tokens
      const payload = {
        userId: user.userId,
        role: user.role,
        branchId: user.branchId
      };

      const { accessToken, refreshToken } = JWTHelper.generateTokens(payload);
      
      // Store refresh token in database
      user.refreshToken = refreshToken;
      await user.save();

      // Remove password from user object
      const userResponse = user.toJSON();

      logger.info(`User ${username} logged in successfully`);

      return ResponseHelper.success({
        user: userResponse,
        tokens: {
          accessToken,
          refreshToken
        }
      }, 'Login successful');

    } catch (error) {
      logger.error('Login error:', error);
      return ResponseHelper.error('Login failed', 500);
    }
  }

  static async refreshToken(refreshToken: string) {
    try {
      const payload = JWTHelper.verifyRefreshToken(refreshToken);
      
      // Verify user still exists, is active, and refresh token matches
      const user = await User.findOne({ 
        userId: payload.userId, 
        isActive: true,
        refreshToken: refreshToken
      });

      if (!user) {
        return ResponseHelper.error('Invalid refresh token', 401);
      }

      // Generate new tokens
      const newPayload = {
        userId: user.userId,
        role: user.role,
        branchId: user.branchId
      };

      const tokens = JWTHelper.generateTokens(newPayload);
      
      // Update stored refresh token
      user.refreshToken = tokens.refreshToken;
      await user.save();

      return ResponseHelper.success({
        tokens
      }, 'Token refreshed successfully');

    } catch (error) {
      logger.error('Token refresh error:', error);
      return ResponseHelper.error('Invalid refresh token', 401);
    }
  }

  static async logout(userId: string) {
    try {
      // Clear refresh token from database
      const user = await User.findOne({ userId, isActive: true });
      
      if (!user) {
        return ResponseHelper.error('User not found', 404);
      }

      user.refreshToken = null;
      await user.save();

      logger.info(`User ${userId} logged out successfully`);

      return ResponseHelper.success(null, 'Logged out successfully');

    } catch (error) {
      logger.error('Logout error:', error);
      return ResponseHelper.error('Logout failed', 500);
    }
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    try {
      const user = await User.findOne({ userId }).select('+password');
      
      if (!user) {
        return ResponseHelper.error('User not found', 404);
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return ResponseHelper.error('Current password is incorrect', 400);
      }

      // Update password (will be hashed by pre-save middleware)
      user.password = newPassword;
      await user.save();

      logger.info(`Password changed for user ${userId}`);

      return ResponseHelper.success(null, 'Password changed successfully');

    } catch (error) {
      logger.error('Change password error:', error);
      return ResponseHelper.error('Failed to change password', 500);
    }
  }

  static async getUserPermissions(userId: string) {
    try {
      const user = await User.findOne({ userId, isActive: true });
      
      if (!user) {
        return ResponseHelper.error('User not found', 404);
      }

      const permissions = {
        role: user.role,
        branchId: user.branchId,
        accessLevel: user.accessLevel,
        canAccessAllBranches: user.role === UserRole.ADMIN,
        canManageUsers: [UserRole.ADMIN, UserRole.BRANCH_MANAGER].includes(user.role),
        canManageDoctors: [UserRole.ADMIN].includes(user.role),
        canManageTests: [UserRole.ADMIN].includes(user.role),
        canViewReports: [UserRole.ADMIN, UserRole.BRANCH_MANAGER].includes(user.role),
        canProcessLabTests: [UserRole.LAB_STAFF].includes(user.role),
        canRegisterPatients: [UserRole.OPD_STAFF, UserRole.BRANCH_MANAGER].includes(user.role),
        canManageInventory: [UserRole.PHARMACY_STAFF, UserRole.BRANCH_MANAGER].includes(user.role),
        canManageEmployees: [UserRole.ADMIN, UserRole.BRANCH_MANAGER].includes(user.role)
      };

      return ResponseHelper.success(permissions, 'User permissions retrieved');

    } catch (error) {
      logger.error('Get user permissions error:', error);
      return ResponseHelper.error('Failed to get user permissions', 500);
    }
  }
}