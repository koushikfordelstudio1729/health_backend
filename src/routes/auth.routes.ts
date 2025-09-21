import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validation.middleware';
import { authLimiter } from '../middleware/security.middleware';
import { loginSchema, changePasswordSchema } from '../utils/validators';
import Joi from 'joi';

const router = Router();

// Public routes
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);

router.post('/refresh', 
  validate(Joi.object({
    refreshToken: Joi.string().required()
  })), 
  AuthController.refreshToken
);

router.get('/health', AuthController.healthCheck);

// Protected routes
router.use(authenticate);

router.post('/logout', AuthController.logout);
router.post('/change-password', validate(changePasswordSchema), AuthController.changePassword);
router.get('/profile', AuthController.getProfile);

export { router as authRoutes };