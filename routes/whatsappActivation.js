// routes/whatsappActivation.js
const express = require('express');
const whatsappActivationController = require('../controllers/whatsappActivationController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Защищенные маршруты - требуют авторизации
router.use(protect);
router.use(authorize('admin')); // Только администратор может активировать номер

// Маршруты для сохранения сертификата
router.post('/certificate', whatsappActivationController.saveCertificateHandler);

// Маршруты для Local API (устаревший метод)
router.post('/register-local', whatsappActivationController.registerWhatsAppLocalApi);
router.post('/verify-local', whatsappActivationController.verifyWhatsAppLocalApi);

// Маршруты для Cloud API (рекомендуемый метод)
router.post('/register-cloud', whatsappActivationController.registerWhatsAppCloudApi);
router.post('/verify-cloud', whatsappActivationController.verifyWhatsAppCloudApi);

// Получение информации о номере WhatsApp
router.get('/phone-info', whatsappActivationController.getWhatsAppPhoneInfo);

module.exports = router;