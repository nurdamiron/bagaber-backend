// routes/whatsapp.js
const express = require('express');
const whatsappController = require('../controllers/whatsappController');
const { protect, authorize } = require('../middleware/auth');
const { whatsappLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Protected routes - require login
router.use(protect);

// Apply rate limiter for all WhatsApp routes
router.use(whatsappLimiter);

// Get connection status
router.get('/status', whatsappController.getStatus);

// Admin only routes
router.post('/register', authorize('admin'), whatsappController.registerWhatsApp);
router.post('/verify', authorize('admin'), whatsappController.verifyWhatsApp);
router.post('/test', authorize('admin'), whatsappController.sendTestMessage);

// Allowed phones management
router.get('/phones', whatsappController.getAllowedPhones);
router.post('/phones', authorize('admin'), whatsappController.addAllowedPhone);
router.put('/phones/:id', authorize('admin'), whatsappController.updateAllowedPhone);
router.delete('/phones/:id', authorize('admin'), whatsappController.deleteAllowedPhone);

module.exports = router;