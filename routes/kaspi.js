// routes/kaspi.js
const express = require('express');
const kaspiController = require('../controllers/kaspiController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Protected routes - require login
router.use(protect);

// Admin only routes
router.get('/fetch-orders', authorize('admin'), kaspiController.fetchOrders);
router.put('/orders/:kaspiOrderId/status', authorize('admin'), kaspiController.updateOrderStatus);

// Regular user routes
router.get('/orders/:kaspiOrderId', kaspiController.getOrderDetails);
router.get('/products/:productId', kaspiController.getProductDetails);
router.get('/orders/:kaspiOrderId/review-link', kaspiController.generateReviewLink);

module.exports = router;