import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { ResponseHelper } from '../utils/helpers';
import { logger } from '../utils/logger';

export class AuthController {
  static async login(req: Request, res: Response) {
    try {
      const { username, password } = req.body;
      const result = await AuthService.login(username, password);
      
      return res.status(result.statusCode).json(result);
    } catch (error) {
      logger.error('Login controller error:', error);
      return res.status(500).json(ResponseHelper.error('Internal server error'));
    }
  }

  static async refreshToken(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json(ResponseHelper.error('Refresh token is required', 400));
      }

      const result = await AuthService.refreshToken(refreshToken);
      
      return res.status(result.statusCode).json(result);
    } catch (error) {
      logger.error('Refresh token controller error:', error);
      return res.status(500).json(ResponseHelper.error('Internal server error'));
    }
  }

  static async logout(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json(ResponseHelper.error('Authentication required', 401));
      }

      const result = await AuthService.logout(req.user.userId);
      
      return res.status(result.statusCode).json(result);
    } catch (error) {
      logger.error('Logout controller error:', error);
      return res.status(500).json(ResponseHelper.error('Internal server error'));
    }
  }

  static async changePassword(req: AuthRequest, res: Response) {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!req.user) {
        return res.status(401).json(ResponseHelper.error('Authentication required', 401));
      }

      const result = await AuthService.changePassword(req.user.userId, currentPassword, newPassword);
      
      return res.status(result.statusCode).json(result);
    } catch (error) {
      logger.error('Change password controller error:', error);
      return res.status(500).json(ResponseHelper.error('Internal server error'));
    }
  }

  static async getProfile(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json(ResponseHelper.error('Authentication required', 401));
      }

      const result = await AuthService.getUserPermissions(req.user.userId);
      
      return res.status(result.statusCode).json(result);
    } catch (error) {
      logger.error('Get profile controller error:', error);
      return res.status(500).json(ResponseHelper.error('Internal server error'));
    }
  }

  static async healthCheck(req: Request, res: Response) {
    try {
      return res.json(ResponseHelper.success({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      }, 'API is healthy'));
    } catch (error) {
      logger.error('Health check error:', error);
      return res.status(500).json(ResponseHelper.error('Health check failed'));
    }
  }
}