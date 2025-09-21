import { cloudinary } from '../config/cloudinary';
import { logger } from '../utils/logger';
import { FileHelper } from '../utils/helpers';

export interface UploadResult {
  public_id: string;
  secure_url: string;
  original_filename: string;
  format: string;
  resource_type: string;
  bytes: number;
  created_at: string;
}

export class CloudinaryService {
  // Upload file buffer to Cloudinary
  static async uploadFile(
    fileBuffer: Buffer, 
    filename: string, 
    folder: string = 'heal-diagnostic',
    options: any = {}
  ): Promise<UploadResult | null> {
    try {
      const uploadOptions = {
        resource_type: 'auto',
        folder,
        public_id: FileHelper.generateFilename(filename, 'report'),
        ...options
      };

      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          uploadOptions,
          (error, result) => {
            if (error) {
              logger.error('Cloudinary upload error:', error);
              reject(error);
              return;
            }
            
            if (!result) {
              reject(new Error('No upload result received'));
              return;
            }

            logger.info(`File uploaded to Cloudinary: ${result.public_id}`);
            resolve(result);
          }
        );

        uploadStream.end(fileBuffer);
      });
    } catch (error) {
      logger.error('Cloudinary service error:', error);
      return null;
    }
  }

  // Upload test report specifically
  static async uploadTestReport(
    fileBuffer: Buffer,
    filename: string,
    orderId: string,
    testId: string
  ): Promise<UploadResult | null> {
    try {
      const publicId = `${orderId}_${testId}_${Date.now()}`;
      
      return await this.uploadFile(fileBuffer, filename, 'heal-diagnostic-reports', {
        public_id: publicId,
        format: 'pdf', // Force PDF format for reports
        pages: true // For PDF page extraction if needed
      });
    } catch (error) {
      logger.error('Test report upload error:', error);
      return null;
    }
  }

  // Upload expense attachment
  static async uploadExpenseAttachment(
    fileBuffer: Buffer,
    filename: string,
    expenseId: string
  ): Promise<UploadResult | null> {
    try {
      const publicId = `expense_${expenseId}_${Date.now()}`;
      
      return await this.uploadFile(fileBuffer, filename, 'heal-diagnostic-expenses', {
        public_id: publicId
      });
    } catch (error) {
      logger.error('Expense attachment upload error:', error);
      return null;
    }
  }

  // Delete file from Cloudinary
  static async deleteFile(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      
      if (result.result === 'ok') {
        logger.info(`File deleted from Cloudinary: ${publicId}`);
        return true;
      }
      
      logger.warn(`Failed to delete file from Cloudinary: ${publicId}`, result);
      return false;
    } catch (error) {
      logger.error('Cloudinary delete error:', error);
      return false;
    }
  }

  // Get file info from Cloudinary
  static async getFileInfo(publicId: string): Promise<any | null> {
    try {
      const result = await cloudinary.api.resource(publicId);
      return result;
    } catch (error) {
      logger.error('Get file info error:', error);
      return null;
    }
  }

  // Generate download URL with expiration
  static generateSecureUrl(publicId: string, options: any = {}): string {
    try {
      return cloudinary.url(publicId, {
        resource_type: 'auto',
        secure: true,
        sign_url: true,
        ...options
      });
    } catch (error) {
      logger.error('Generate secure URL error:', error);
      return '';
    }
  }

  // Transform image (resize, format, etc.)
  static generateTransformedUrl(
    publicId: string, 
    transformations: any = {}
  ): string {
    try {
      return cloudinary.url(publicId, {
        resource_type: 'image',
        secure: true,
        ...transformations
      });
    } catch (error) {
      logger.error('Generate transformed URL error:', error);
      return '';
    }
  }

  // Get files by folder
  static async getFilesByFolder(folder: string, maxResults: number = 100): Promise<any[]> {
    try {
      const result = await cloudinary.api.resources({
        type: 'upload',
        prefix: folder,
        max_results: maxResults
      });
      
      return result.resources || [];
    } catch (error) {
      logger.error('Get files by folder error:', error);
      return [];
    }
  }

  // Search files
  static async searchFiles(expression: string): Promise<any[]> {
    try {
      const result = await cloudinary.search
        .expression(expression)
        .sort_by('created_at', 'desc')
        .max_results(100)
        .execute();
      
      return result.resources || [];
    } catch (error) {
      logger.error('Search files error:', error);
      return [];
    }
  }

  // Bulk delete files
  static async bulkDeleteFiles(publicIds: string[]): Promise<{ success: string[], failed: string[] }> {
    const results: { success: string[], failed: string[] } = { success: [], failed: [] };
    
    try {
      const promises = publicIds.map(async (publicId) => {
        const deleted = await this.deleteFile(publicId);
        if (deleted) {
          results.success.push(publicId);
        } else {
          results.failed.push(publicId);
        }
      });

      await Promise.all(promises);
      
      logger.info(`Bulk delete completed: ${results.success.length} success, ${results.failed.length} failed`);
      
      return results;
    } catch (error) {
      logger.error('Bulk delete error:', error);
      return results;
    }
  }

  // Get storage usage stats
  static async getStorageStats(): Promise<any> {
    try {
      const result = await cloudinary.api.usage();
      return {
        storage: {
          used: result.storage.used_bytes,
          limit: result.storage.limit,
          usage_percentage: (result.storage.used_bytes / result.storage.limit) * 100
        },
        bandwidth: {
          used: result.bandwidth.used_bytes,
          limit: result.bandwidth.limit,
          usage_percentage: (result.bandwidth.used_bytes / result.bandwidth.limit) * 100
        },
        requests: result.requests,
        transformations: result.transformations
      };
    } catch (error) {
      logger.error('Get storage stats error:', error);
      return null;
    }
  }
}