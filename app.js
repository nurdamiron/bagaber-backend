/**
 * Kaspi Review System - Main Application
 * 
 * This file serves as the entry point for the application, setting up:
 * - Configuration loading
 * - Express middleware
 * - API routes
 * - Error handling
 * - Database connection
 * - Server startup
 */

// Core dependencies
const express = require('express');
const path = require('path');
const fs = require('fs');

// Configuration dependencies
const dotenv = require('dotenv');
const { testConnection, syncModels } = require('./config/database');
const logger = require('./services/loggerService');

// Security and middleware dependencies
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const { errorHandler } = require('./middleware/errorHandler');

// Services
const notificationScheduler = require('./services/notificationScheduler');

// Load environment variables
dotenv.config();

// Create Express application
const app = express();

/**
 * Initialize application with middleware
 */
function setupMiddleware() {
  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Request parsing
  app.use(bodyParser.json({ limit: '1mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));

  // Request logging
  app.use(morgan('combined', { stream: logger.stream }));

  // Request timing middleware
  app.use((req, res, next) => {
    req.requestTime = Date.now();
    
    // Log metrics on request completion
    res.on('finish', () => {
      const duration = Date.now() - req.requestTime;
      const status = res.statusCode;
      const success = status < 400;
      
      // Log metrics with fallback
      if (logger.metrics && typeof logger.metrics.recordApiCall === 'function') {
        logger.metrics.recordApiCall(
          'internal',
          `${req.method} ${req.originalUrl}`,
          success,
          duration
        );
      } else {
        logger.info(
          `API Call: ${req.method} ${req.originalUrl} | Status: ${status} | Duration: ${duration}ms`
        );
      }
    });
    
    next();
  });
}

/**
 * Set up API routes
 */
function setupRoutes() {
  // Import route modules
  const authRoutes = require('./routes/auth');
  const kaspiRoutes = require('./routes/kaspi');
  const ordersRoutes = require('./routes/orders');
  const whatsappRoutes = require('./routes/whatsapp');
  const notificationsRoutes = require('./routes/notifications');
  const templatesRoutes = require('./routes/templates');
  const whatsappActivationRoutes = require('./routes/whatsappActivation');
  const diagnosticRoutes = require('./routes/diagnostic');

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'Kaspi Review System API работает',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Register API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/kaspi', kaspiRoutes);
  app.use('/api/orders', ordersRoutes);
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/templates', templatesRoutes);
  app.use('/api/whatsapp-activation', whatsappActivationRoutes);
  app.use('/api/diagnostic', diagnosticRoutes);

  // Error handling middleware
  app.use(errorHandler);

  // 404 handler for unknown routes
  app.use('*', (req, res) => {
    res.status(404).json({
      success: false,
      message: `Маршрут ${req.originalUrl} не найден`
    });
  });
}

/**
 * Set up error handling for the Node process
 */
function setupProcessErrorHandling() {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    logger.error('UNCAUGHT EXCEPTION:', error);
    // Graceful shutdown with delay to allow logging
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason) => {
    logger.error('UNHANDLED PROMISE REJECTION:', reason);
  });

  // Handle termination signals
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
}

/**
 * Gracefully shut down the application
 */
function gracefulShutdown() {
  logger.info("Получен сигнал завершения работы, закрываем соединения...");
  
  // Close database connections if needed
  try {
    // Additional connection closings can be added here
    logger.info("Соединения закрыты");
  } catch (error) {
    logger.error("Ошибка при закрытии соединений:", error);
  }
  
  logger.info("Завершение работы приложения");
  process.exit(0);
}

/**
 * Initialize and start the server
 */
async function startServer() {
  try {
    // Set up middleware
    setupMiddleware();
    
    // Set up routes
    setupRoutes();
    
    // Set up process error handling
    setupProcessErrorHandling();
    
    // Check database connection
    const isConnected = await testConnection();
    if (!isConnected) {
      throw new Error("Не удалось подключиться к базе данных");
    }
    
    logger.info("Успешное подключение к базе данных");
    
    // Synchronize database models (don't use force=true in production!)
    const syncResult = await syncModels(false);
    if (!syncResult) {
      logger.warn("Синхронизация моделей не выполнена полностью, проверьте логи");
    }
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
      logger.info(`Создана директория для логов: ${logsDir}`);
    }
    
    // Start notification scheduler
    notificationScheduler.startScheduling();
    
    // Start HTTP server
    const PORT = process.env.PORT || 5001;
    app.listen(PORT, () => {
      logger.info(`Сервер запущен на порту ${PORT}`);
      logger.info(`Окружение: ${process.env.NODE_ENV || 'development'}`);
    });
    
    return true;
  } catch (error) {
    logger.error("Ошибка запуска сервера:", error);
    process.exit(1);
  }
}

// Start the server
startServer()
  .then(success => {
    if (success) {
      logger.info("Сервер успешно запущен");
    }
  })
  .catch(err => {
    logger.error("Критическая ошибка при запуске сервера:", err);
    process.exit(1);
  });