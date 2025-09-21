import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ResponseHelper } from '../utils/helpers';
import { logger } from '../utils/logger';

export const validate = (schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      allowUnknown: false
    });

    if (error) {
      const validationErrors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      logger.warn('Validation error:', validationErrors);

      return res.status(400).json(
        ResponseHelper.error(
          'Validation failed',
          400,
          validationErrors
        )
      );
    }

    // Replace the original data with validated/sanitized data
    if (property === 'query') {
      // query is read-only, so we'll assign the values individually
      Object.assign(req.query, value);
    } else if (property === 'body') {
      req.body = value;
    } else if (property === 'params') {
      Object.assign(req.params, value);
    }
    next();
  };
};

export const validateQuery = (schema: Joi.ObjectSchema) => validate(schema, 'query');
export const validateParams = (schema: Joi.ObjectSchema) => validate(schema, 'params');

// Common parameter validation schemas
export const idParamSchema = Joi.object({
  id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required().messages({
    'string.pattern.base': 'Invalid ID format'
  })
});

export const userIdParamSchema = Joi.object({
  userId: Joi.string().required()
});

export const branchIdParamSchema = Joi.object({
  branchId: Joi.string().required()
});

export const patientIdParamSchema = Joi.object({
  patientId: Joi.string().required()
});

export const orderIdParamSchema = Joi.object({
  orderId: Joi.string().required()
});

// Generic query validation for listing endpoints
export const listQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  sortBy: Joi.string().default('createdAt'),
  sortOrder: Joi.string().valid('asc', 'desc').default('desc'),
  search: Joi.string().trim().allow(''),
  status: Joi.string().trim(),
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso().min(Joi.ref('startDate')),
  branchId: Joi.string()
}).with('startDate', 'endDate');