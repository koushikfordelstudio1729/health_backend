import { Request, Response, NextFunction } from 'express';
import { JWTHelper, ResponseHelper } from '../utils/helpers';
import { User } from '../models';
import { logger } from '../utils/logger';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: string;
    branchId?: string | undefined;
    _id?: string;
    name?: string;
  };
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json(ResponseHelper.error('Access token required', 401));
    }

    const token = authHeader.substring(7);
    
    const payload = JWTHelper.verifyAccessToken(token);
    logger.info('JWT payload verified:', { userId: payload.userId, role: payload.role, branchId: payload.branchId });
    
    // Verify user still exists and is active
    const user = await User.findOne({ 
      userId: payload.userId, 
      isActive: true 
    });

    if (!user) {
      logger.error('User not found in database:', { userId: payload.userId });
      return res.status(401).json(ResponseHelper.error('Invalid token', 401));
    }

    // Attach user info to request
    req.user = {
      userId: user.userId,
      role: user.role,
      branchId: user.branchId || undefined,
      _id: user._id?.toString(),
      name: user.name
    };

    logger.info('User attached to request:', req.user);
    return next();
  } catch (error) {
    logger.error('Authentication error:', error);
    return res.status(401).json(ResponseHelper.error('Invalid or expired token', 401));
  }
};

export const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    
    try {
      const payload = JWTHelper.verifyAccessToken(token);
      
      const user = await User.findOne({ 
        userId: payload.userId, 
        isActive: true 
      });

      if (user) {
        req.user = {
          userId: user.userId,
          role: user.role,
          branchId: user.branchId || undefined,
          _id: user._id?.toString(),
          name: user.name
        };
      }
    } catch (error) {
      // Token invalid, but continue without user
      logger.warn('Invalid optional auth token:', error);
    }

    next();
  } catch (error) {
    logger.error('Optional authentication error:', error);
    next();
  }
};