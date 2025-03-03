// routes/auth.js
const express = require('express');
const authController = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Public routes
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);

// Protected routes
router.get('/me', protect, authController.getMe);
router.put('/me', protect, authController.updateProfile);

// Admin only routes
router.get('/users', protect, authorize('admin'), authController.getUsers);

module.exports = router;