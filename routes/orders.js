// routes/orders.js
const express = require('express');
const orderController = require('../controllers/orderController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Protected routes - require login
router.use(protect);

// Stats route
router.get('/stats', orderController.getOrderStats);

// All orders routes
router.get('/', orderController.getOrders);
router.get('/:id', orderController.getOrderById);
router.put('/:id', orderController.updateOrder);
router.post('/:id/notify', orderController.sendNotification);

module.exports = router;