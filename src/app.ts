import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import connectDB from './config/database';
import { configureCloudinary } from './config/cloudinary';
import { configureEmail } from './config/email';
import { logger } from './utils/logger';

// Import middleware
import { 
  errorHandler, 
  notFoundHandler 
} from './middleware/error.middleware';
import { 
  generalLimiter,
  securityHeaders,
  corsOptions,
  sanitizeRequest,
  requestLogger,
  maintenanceMode
} from './middleware/security.middleware';

// Import routes
import { authRoutes } from './routes/auth.routes';
import { adminRoutes } from './routes/admin.routes';
import { opdRoutes } from './routes/opd.routes';
import { labRoutes } from './routes/lab.routes';
import { reportsRoutes } from './routes/reports.routes';
import { inventoryRoutes } from './routes/inventory.routes';
import { employeeRoutes } from './routes/employee.routes';
import { accountsRoutes } from './routes/accounts.routes';
import { commissionRoutes } from './routes/commission.routes';
import { expenseRoutes } from './routes/expense.routes';

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (important for rate limiting and IP detection)
app.set('trust proxy', 1);

// Early middleware
app.use(maintenanceMode);
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(compression());

// Request logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: message => logger.info(message.trim()) }
  }));
  app.use(requestLogger);
}

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(sanitizeRequest);
app.use(generalLimiter);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/opd', opdRoutes);
app.use('/api/lab', labRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/expenses', expenseRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// Initialize services
const initializeApp = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDB();
    
    // Configure external services
    configureCloudinary();
    configureEmail();
    
    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize app services:', error);
    process.exit(1);
  }
};

// Start server
const startServer = async (): Promise<void> => {
  try {
    await initializeApp();
    
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/health`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      
      server.close((err) => {
        if (err) {
          logger.error('Error during server shutdown:', err);
          process.exit(1);
        }
        
        logger.info('Server closed successfully');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the application
if (require.main === module) {
  startServer();
}

export default app;