import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongoose';

export interface JWTPayload {
  userId: string;
  role: string;
  branchId?: string | undefined;
}

export class JWTHelper {
  static generateTokens(payload: JWTPayload): { accessToken: string; refreshToken: string } {
    const accessSecret = process.env.JWT_ACCESS_SECRET;
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    const accessExpiresIn = process.env.JWT_ACCESS_EXPIRES_IN || '1d';
    const refreshExpiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

    if (!accessSecret || !refreshSecret) {
      throw new Error('JWT secrets not configured');
    }

    const accessToken = jwt.sign(payload, accessSecret, { expiresIn: accessExpiresIn } as any);
    const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: refreshExpiresIn } as any);

    return { accessToken, refreshToken };
  }

  static verifyAccessToken(token: string): JWTPayload {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) {
      throw new Error('JWT access secret not configured');
    }

    return jwt.verify(token, secret) as JWTPayload;
  }

  static verifyRefreshToken(token: string): JWTPayload {
    const secret = process.env.JWT_REFRESH_SECRET;
    if (!secret) {
      throw new Error('JWT refresh secret not configured');
    }

    return jwt.verify(token, secret) as JWTPayload;
  }
}

export class ResponseHelper {
  static success(data: any, message = 'Success', statusCode = 200) {
    return {
      success: true,
      statusCode,
      message,
      data
    };
  }

  static error(message: string, statusCode = 500, errors?: any) {
    return {
      success: false,
      statusCode,
      message,
      ...(errors && { errors })
    };
  }

  static paginated(data: any[], total: number, page: number, limit: number, message = 'Success') {
    const totalPages = Math.ceil(total / limit);
    
    return {
      success: true,
      message,
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    };
  }
}

export class DateHelper {
  static getDateRange(startDate?: string, endDate?: string) {
    const today = new Date();
    const start = startDate ? new Date(startDate) : new Date(today.getFullYear(), today.getMonth(), 1);
    const end = endDate ? new Date(endDate) : new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    return { start, end };
  }

  static isValidDate(date: string): boolean {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }

  static formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
}

export class FileHelper {
  static isValidFileType(mimetype: string, allowedTypes: string[]): boolean {
    return allowedTypes.includes(mimetype);
  }

  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  static generateFilename(originalName: string, prefix?: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const extension = originalName.split('.').pop();
    
    return `${prefix ? prefix + '_' : ''}${timestamp}_${random}.${extension}`;
  }
}

export class ValidationHelper {
  static isValidObjectId(id: string): boolean {
    return /^[0-9a-fA-F]{24}$/.test(id);
  }

  static sanitizeString(str: string): string {
    return str.trim().replace(/[<>]/g, '');
  }

  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  static isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^[\+]?[\d\s\-\(\)]{10,}$/;
    return phoneRegex.test(phone);
  }
}

export class CommissionHelper {
  static calculateCommission(amount: number, rate: number): number {
    return Math.round((amount * rate / 100) * 100) / 100; // Round to 2 decimal places
  }

  static calculateTotalCommission(tests: Array<{ price: number; commissionRate: number }>): number {
    return tests.reduce((total, test) => {
      return total + this.calculateCommission(test.price, test.commissionRate);
    }, 0);
  }
}

export class QueryHelper {
  static buildFilterQuery(filters: Record<string, any>, branchId?: string) {
    const query: Record<string, any> = {};

    // Add branch filter if provided
    if (branchId) {
      query.branchId = branchId;
    }

    // Handle date range filters
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    // Handle status filters
    if (filters.status) {
      query.status = filters.status;
    }

    // Handle search filters
    if (filters.search) {
      query.$or = [
        { name: { $regex: filters.search, $options: 'i' } },
        { patientId: { $regex: filters.search, $options: 'i' } },
        { orderId: { $regex: filters.search, $options: 'i' } }
      ];
    }

    return query;
  }

  static buildSortQuery(sortBy?: string, sortOrder?: string) {
    const sort: Record<string, 1 | -1> = {};
    
    if (sortBy) {
      sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.createdAt = -1; // Default sort by creation date descending
    }

    return sort;
  }
}