// routes/notifications.js
const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Защищенные маршруты - требуют авторизации
router.use(protect);

// Админские маршруты
router.post('/send-review-requests', authorize('admin'), notificationController.manualSendReviewRequests);
router.put('/time-window', authorize('admin'), notificationController.setTimeWindow);
router.post('/retry-failed', authorize('admin'), notificationController.retryFailedNotifications);
router.post('/test', authorize('admin'), notificationController.sendTestNotification);

// Общедоступные маршруты (для мониторинга)
router.get('/stats', notificationController.getNotificationStats);
router.get('/status', notificationController.getSchedulerStatus);
router.get('/daily-stats', notificationController.getDailyStats);

module.exports = router;