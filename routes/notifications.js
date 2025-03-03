// routes/notifications.js
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Роуты, требующие авторизации
router.use(protect);

// Админские роуты
router.post('/send-review-requests', authorize('admin'), notificationController.manualSendReviewRequests);
router.put('/time-window', authorize('admin'), notificationController.setTimeWindow);
router.post('/retry-failed', authorize('admin'), notificationController.retryFailedNotifications);

// Общедоступные роуты (для мониторинга)
router.get('/stats', notificationController.getNotificationStats);
router.get('/status', notificationController.getSchedulerStatus);

module.exports = router;
