import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { ResponseHelper, FileHelper } from '../utils/helpers';
import { logger } from '../utils/logger';

// Multer configuration for handling file uploads
const storage = multer.memoryStorage();

// File filter function
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/pdf'
  ];

  if (FileHelper.isValidFileType(file.mimetype, allowedMimeTypes)) {
    cb(null, true);
  } else {
    logger.warn(`Invalid file type uploaded: ${file.mimetype}`);
    cb(new Error('Invalid file type. Only JPG, PNG, and PDF files are allowed.'));
  }
};

// Multer upload configuration
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || '2097152'), // Default 2MB
    files: 5 // Maximum 5 files at once
  }
});

// Single file upload middleware
export const uploadSingle = (fieldName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uploadMiddleware = upload.single(fieldName);
    
    uploadMiddleware(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json(
            ResponseHelper.error('File too large. Maximum size allowed is 2MB', 400)
          );
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json(
            ResponseHelper.error('Too many files. Maximum 5 files allowed', 400)
          );
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json(
            ResponseHelper.error(`Unexpected field name. Expected: ${fieldName}`, 400)
          );
        }
        
        logger.error('Multer error:', error);
        return res.status(400).json(
          ResponseHelper.error('File upload error', 400)
        );
      }
      
      if (error) {
        logger.error('File upload error:', error);
        return res.status(400).json(
          ResponseHelper.error(error.message || 'File upload failed', 400)
        );
      }

      // Log successful upload
      if (req.file) {
        logger.info(`File uploaded: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);
      }

      next();
    });
  };
};

// Multiple files upload middleware
export const uploadMultiple = (fieldName: string, maxCount: number = 5) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const uploadMiddleware = upload.array(fieldName, maxCount);
    
    uploadMiddleware(req, res, (error) => {
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json(
            ResponseHelper.error('One or more files are too large. Maximum size allowed is 2MB per file', 400)
          );
        }
        if (error.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json(
            ResponseHelper.error(`Too many files. Maximum ${maxCount} files allowed`, 400)
          );
        }
        
        logger.error('Multer error:', error);
        return res.status(400).json(
          ResponseHelper.error('File upload error', 400)
        );
      }
      
      if (error) {
        logger.error('File upload error:', error);
        return res.status(400).json(
          ResponseHelper.error(error.message || 'File upload failed', 400)
        );
      }

      // Log successful uploads
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        req.files.forEach(file => {
          logger.info(`File uploaded: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
        });
      }

      next();
    });
  };
};

// Middleware to check if file is required
export const requireFile = (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) {
    return res.status(400).json(
      ResponseHelper.error('File is required', 400)
    );
  }
  next();
};

// Middleware to validate file exists and is not empty
export const validateFile = (req: Request, res: Response, next: NextFunction) => {
  if (req.file) {
    if (req.file.size === 0) {
      return res.status(400).json(
        ResponseHelper.error('Uploaded file is empty', 400)
      );
    }

    // Add file info to request for easier access
    req.body.fileInfo = {
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      buffer: req.file.buffer
    };
  }

  next();
};