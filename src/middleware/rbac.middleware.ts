import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { ResponseHelper } from '../utils/helpers';
import { UserRole } from '../types';
import { logger } from '../utils/logger';

export const authorize = (allowedRoles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json(ResponseHelper.error('Authentication required', 401));
    }

    if (!allowedRoles.includes(req.user.role as UserRole)) {
      logger.warn(`Access denied for user ${req.user.userId} with role ${req.user.role} to resource requiring ${allowedRoles.join(', ')}`);
      return res.status(403).json(ResponseHelper.error('Insufficient permissions', 403));
    }

    next();
  };
};

export const authorizeAdmin = authorize([UserRole.ADMIN]);

export const authorizeBranchManager = authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER]);

export const authorizeOPDStaff = authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.OPD_STAFF]);

export const authorizeLabStaff = authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.LAB_STAFF]);

export const authorizePharmacyStaff = authorize([UserRole.ADMIN, UserRole.BRANCH_MANAGER, UserRole.PHARMACY_STAFF]);

export const checkBranchAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Check if user exists
    if (!req.user) {
      logger.error('checkBranchAccess: req.user is undefined');
      return res.status(401).json(ResponseHelper.error('Authentication required', 401));
    }

    // Admin can access all branches
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }

    // For other users, check if they're accessing their own branch
    const branchIdFromParams = req.params?.branchId || req.body?.branchId || req.query?.branchId;
    const branchIdFromUser = req.user?.branchId;

    if (branchIdFromParams && branchIdFromParams !== branchIdFromUser) {
      logger.warn(`Branch access denied for user ${req.user?.userId} trying to access branch ${branchIdFromParams}`);
      return res.status(403).json(ResponseHelper.error('Branch access denied', 403));
    }

    // Attach user's branch ID to request if not provided
    if (!branchIdFromParams && branchIdFromUser) {
      if (req.method === 'GET') {
        if (!req.query) req.query = {};
        req.query.branchId = branchIdFromUser;
      } else {
        if (!req.body) req.body = {};
        req.body.branchId = branchIdFromUser;
      }
    }

    return next();
  } catch (error) {
    logger.error('checkBranchAccess error:', error);
    return res.status(500).json(ResponseHelper.error('Branch access check failed'));
  }
};

export const checkResourceOwnership = (resourceUserField = 'createdBy') => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json(ResponseHelper.error('Authentication required', 401));
    }

    // Admin can access all resources
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }

    // Check if user is trying to access their own resource
    const resourceUserId = req.body[resourceUserField] || req.params[resourceUserField];
    
    if (resourceUserId && resourceUserId !== req.user._id) {
      logger.warn(`Resource ownership denied for user ${req.user.userId} trying to access resource owned by ${resourceUserId}`);
      return res.status(403).json(ResponseHelper.error('Resource access denied', 403));
    }

    next();
  };
};

export const checkSelfOrAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json(ResponseHelper.error('Authentication required', 401));
  }

  const targetUserId = req.params.userId || req.body.userId;
  
  // Admin can modify any user, users can modify themselves
  if (req.user.role === UserRole.ADMIN || req.user.userId === targetUserId) {
    return next();
  }

  logger.warn(`Self or admin access denied for user ${req.user.userId} trying to access user ${targetUserId}`);
  return res.status(403).json(ResponseHelper.error('Access denied', 403));
};

export const logAccess = (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.user) {
    logger.info(`User ${req.user.userId} (${req.user.role}) accessed ${req.method} ${req.originalUrl}${req.user.branchId ? ` from branch ${req.user.branchId}` : ''}`);
  }
  next();
};