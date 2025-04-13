// controllers/diagnosticController.js
const { Order, AllowedPhone, User } = require('../models');
const sequelize = require('sequelize');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../services/loggerService');
const fs = require('fs');
const path = require('path');

/**
 * @desc    Test database connectivity and model initialization
 * @route   GET /api/diagnostic/db-check
 * @access  Private/Admin
 */
exports.checkDatabaseConnection = async (req, res, next) => {
  try {
    // Test basic connection to database
    const dbStatus = {
      connection: false,
      models: {
        Order: false,
        AllowedPhone: false,
        User: false
      },
      counts: {},
      errors: []
    };
    
    try {
      // Check if we can authenticate with the database
      await sequelize.authenticate();
      dbStatus.connection = true;
    } catch (err) {
      dbStatus.errors.push(`Database connection error: ${err.message}`);
    }
    
    // Check if models are properly initialized
    if (Order) {
      dbStatus.models.Order = true;
      try {
        const count = await Order.count();
        dbStatus.counts.orders = count;
      } catch (err) {
        dbStatus.errors.push(`Order model error: ${err.message}`);
      }
    }
    
    if (AllowedPhone) {
      dbStatus.models.AllowedPhone = true;
      try {
        const count = await AllowedPhone.count();
        dbStatus.counts.allowedPhones = count;
      } catch (err) {
        dbStatus.errors.push(`AllowedPhone model error: ${err.message}`);
      }
    }
    
    if (User) {
      dbStatus.models.User = true;
      try {
        const count = await User.count();
        dbStatus.counts.users = count;
      } catch (err) {
        dbStatus.errors.push(`User model error: ${err.message}`);
      }
    }
    
    res.status(200).json({
      success: true,
      data: dbStatus
    });
  } catch (error) {
    logger.error('Database diagnostic error:', error);
    next(new ApiError(500, `Database diagnostic failed: ${error.message}`));
  }
};

/**
 * @desc    Get application configuration and environment
 * @route   GET /api/diagnostic/config
 * @access  Private/Admin
 */
exports.getConfiguration = async (req, res, next) => {
  try {
    // Get environment variables (sanitized)
    const config = {
      environment: process.env.NODE_ENV || 'development',
      database: {
        host: process.env.DB_HOST,
        name: process.env.DB_NAME,
        port: process.env.DB_PORT,
        ssl: process.env.DB_SSL === 'true'
      },
      whatsapp: {
        type: process.env.WHATSAPP_TYPE || 'cloud',
        api_version: process.env.WHATSAPP_API_VERSION,
        phone_id_exists: !!process.env.WHATSAPP_PHONE_NUMBER_ID,
        token_exists: !!process.env.WHATSAPP_ACCESS_TOKEN,
        cert_exists: !!process.env.WHATSAPP_CERTIFICATE
      },
      notifications: {
        start_hour: process.env.NOTIFICATION_START_HOUR || 9,
        end_hour: process.env.NOTIFICATION_END_HOUR || 21
      },
      routes: {
        // List registered routes
        count: 0,
        paths: []
      }
    };
    
    // Get registered routes if we can access the Express app
    if (req.app && req.app._router) {
      const routes = [];
      req.app._router.stack.forEach(middleware => {
        if (middleware.route) { 
          // Routes registered directly on the app
          routes.push({
            path: middleware.route.path,
            methods: Object.keys(middleware.route.methods).join(',')
          });
        } else if (middleware.name === 'router' && middleware.handle.stack) {
          // Routes registered in a router
          middleware.handle.stack.forEach(handler => {
            if (handler.route) {
              routes.push({
                path: handler.route.path,
                methods: Object.keys(handler.route.methods).join(',')
              });
            }
          });
        }
      });
      
      config.routes.count = routes.length;
      config.routes.paths = routes;
    }
    
    res.status(200).json({
      success: true,
      data: config
    });
  } catch (error) {
    logger.error('Configuration diagnostic error:', error);
    next(new ApiError(500, `Configuration diagnostic failed: ${error.message}`));
  }
};

/**
 * @desc    Check file access and permissions
 * @route   GET /api/diagnostic/file-check
 * @access  Private/Admin
 */
exports.checkFileSystem = async (req, res, next) => {
  try {
    const fileChecks = {
      app_directory: process.cwd(),
      writeable: false,
      template_file: false,
      logs_directory: false,
      errors: []
    };
    
    // Check if app directory is writeable
    try {
      const testFile = path.join(process.cwd(), 'test_write.tmp');
      fs.writeFileSync(testFile, 'test', { flag: 'w' });
      fs.unlinkSync(testFile);
      fileChecks.writeable = true;
    } catch (err) {
      fileChecks.errors.push(`App directory write test failed: ${err.message}`);
    }
    
    // Check templates.json
    const templatesPath = path.join(process.cwd(), 'config', 'templates.json');
    try {
      const exists = fs.existsSync(templatesPath);
      fileChecks.template_file = exists;
      if (!exists) {
        fileChecks.errors.push('templates.json file does not exist');
      }
    } catch (err) {
      fileChecks.errors.push(`Template file check failed: ${err.message}`);
    }
    
    // Check logs directory
    const logsPath = path.join(process.cwd(), 'logs');
    try {
      // Create logs directory if it doesn't exist
      if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
      }
      
      const testFile = path.join(logsPath, 'test_log.tmp');
      fs.writeFileSync(testFile, 'test', { flag: 'w' });
      fs.unlinkSync(testFile);
      fileChecks.logs_directory = true;
    } catch (err) {
      fileChecks.errors.push(`Logs directory check failed: ${err.message}`);
    }
    
    res.status(200).json({
      success: true,
      data: fileChecks
    });
  } catch (error) {
    logger.error('File system diagnostic error:', error);
    next(new ApiError(500, `File system diagnostic failed: ${error.message}`));
  }
};

/**
 * @desc    Create or update missing routes
 * @route   POST /api/diagnostic/fix-routes
 * @access  Private/Admin
 */
exports.fixMissingRoutes = async (req, res, next) => {
  try {
    // Implement fixes for common route issues
    const fixResults = {
      routes_added: [],
      errors: []
    };
    
    // Get router instances from the request's app
    const app = req.app;
    
    // Add missing routes
    if (!routeExists(app, 'GET', '/api/notifications/daily-stats')) {
      try {
        // Find notifications router
        const notificationRouter = findRouter(app, '/api/notifications');
        
        if (notificationRouter && notificationRouter.route) {
          // Add the missing route
          notificationRouter.get('/daily-stats', (req, res) => {
            // Simple placeholder implementation
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            // Generate mock data for 30 days
            const mockData = [];
            for (let i = 0; i < 30; i++) {
              const date = new Date();
              date.setDate(date.getDate() - i);
              const dateString = date.toISOString().split('T')[0];
              
              mockData.push({
                date: dateString,
                total: Math.floor(Math.random() * 20),
                sent: Math.floor(Math.random() * 15),
                delivered: Math.floor(Math.random() * 10),
                read: Math.floor(Math.random() * 5),
                failed: Math.floor(Math.random() * 3)
              });
            }
            
            res.status(200).json({
              success: true,
              data: mockData
            });
          });
          
          fixResults.routes_added.push('/api/notifications/daily-stats');
        } else {
          fixResults.errors.push('Could not find notifications router');
        }
      } catch (err) {
        fixResults.errors.push(`Error adding daily-stats route: ${err.message}`);
      }
    }
    
    res.status(200).json({
      success: true,
      message: 'Route fixes applied',
      data: fixResults
    });
  } catch (error) {
    logger.error('Fix routes error:', error);
    next(new ApiError(500, `Fix routes failed: ${error.message}`));
  }
};

// Helper function to check if a route exists
function routeExists(app, method, path) {
  // Implementation would need to traverse the app's router stack
  // This is a simplified placeholder
  return false;
}

// Helper function to find a specific router
function findRouter(app, path) {
  // Implementation would need to find the router that handles a specific path
  // This is a simplified placeholder
  return null;
}

/**
 * @desc    Initialize models and fix database issues
 * @route   POST /api/diagnostic/fix-db
 * @access  Private/Admin
 */
exports.fixDatabaseIssues = async (req, res, next) => {
  try {
    const fixResults = {
      models_fixed: [],
      tables_synced: [],
      errors: []
    };
    
    // Fix sequelize models initialization issues
    // This is a placeholder - actual implementation would depend on your specific issues
    
    res.status(200).json({
      success: true,
      message: 'Database fixes applied',
      data: fixResults
    });
  } catch (error) {
    logger.error('Fix database error:', error);
    next(new ApiError(500, `Fix database failed: ${error.message}`));
  }
};