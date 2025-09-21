import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { ResponseHelper } from '../utils/helpers';
import { logger } from '../utils/logger';

// Rate limiting configurations
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs (increased for development)
  message: ResponseHelper.error('Too many requests from this IP, please try again later.', 429),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip} on ${req.originalUrl}`);
    res.status(429).json(ResponseHelper.error('Too many requests, please try again later.', 429));
  }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 login attempts per windowMs (increased for development)
  message: ResponseHelper.error('Too many login attempts from this IP, please try again after 15 minutes.', 429),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    logger.warn(`Login rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(ResponseHelper.error('Too many login attempts, please try again after 15 minutes.', 429));
  }
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 500, // limit each IP to 500 upload requests per hour (increased for development)
  message: ResponseHelper.error('Too many file uploads from this IP, please try again later.', 429),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Upload rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json(ResponseHelper.error('Too many file uploads, please try again later.', 429));
  }
});

// Security headers configuration
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
});

// CORS configuration
export const corsOptions = {
  origin: true, // Allow requests from all origins
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'x-branch-id'
  ]
};

// IP whitelist middleware (for admin operations)
export const ipWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    if (!allowedIPs.includes(clientIP || '')) {
      logger.warn(`Blocked request from non-whitelisted IP: ${clientIP}`);
      return res.status(403).json(ResponseHelper.error('Access denied from this IP address', 403));
    }
    
    next();
  };
};

// Request sanitization middleware
export const sanitizeRequest = (req: Request, res: Response, next: NextFunction) => {
  // Remove any potential XSS attempts from request body
  if (req.body && typeof req.body === 'object') {
    sanitizeObject(req.body);
  }
  
  if (req.query && typeof req.query === 'object') {
    sanitizeObject(req.query);
  }
  
  if (req.params && typeof req.params === 'object') {
    sanitizeObject(req.params);
  }
  
  next();
};

function sanitizeObject(obj: any): void {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (typeof obj[key] === 'string') {
        // Remove potential XSS scripts
        obj[key] = obj[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        // Remove HTML tags except basic formatting
        obj[key] = obj[key].replace(/<(?!\/?(b|i|u|strong|em|p|br)\/?>)[^>]*>/gi, '');
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  }
}

// Request logging middleware
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('user-agent')
    };
    
    if (res.statusCode >= 400) {
      logger.warn('Request completed with error:', logData);
    } else {
      logger.info('Request completed:', logData);
    }
  });
  
  next();
};

// Maintenance mode middleware
export const maintenanceMode = (req: Request, res: Response, next: NextFunction) => {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  
  if (isMaintenanceMode && !req.path.includes('/health')) {
    return res.status(503).json(ResponseHelper.error('System is under maintenance. Please try again later.', 503));
  }
  
  next();
};