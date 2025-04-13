// routes/kaspi.js - Improved version with better route handling
const express = require('express');
const kaspiController = require('../controllers/kaspiController');
const { protect, authorize } = require('../middleware/auth');
const logger = require('../services/loggerService');

const router = express.Router();

// Add logging middleware for Kaspi routes
router.use((req, res, next) => {
  logger.info(`Kaspi API request: ${req.method} ${req.originalUrl}`);
  next();
});

// Protected routes - require login
router.use(protect);

// Admin only routes - explicitly specify access level for clarity
router.get('/fetch-orders', authorize('admin'), (req, res, next) => {
  logger.info(`Fetch orders request from user ${req.user.id} with role ${req.user.role}`);
  logger.info(`Query params: ${JSON.stringify(req.query)}`);
  kaspiController.fetchOrders(req, res, next);
});

router.put('/orders/:kaspiOrderId/status', authorize('admin'), kaspiController.updateOrderStatus);

// Regular user routes
router.get('/orders/:kaspiOrderId', kaspiController.getOrderDetails);
router.get('/products/:productId', kaspiController.getProductDetails);
router.get('/orders/:kaspiOrderId/review-link', kaspiController.generateReviewLink);

// Add error handling for this router
router.use((err, req, res, next) => {
  logger.error(`Error in Kaspi routes: ${err.message}`);
  // Pass to main error handler
  next(err);
});

module.exports = router;