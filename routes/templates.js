// routes/templates.js
const express = require('express');
const templateController = require('../controllers/templateController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// Защищенные маршруты - требуют авторизации
router.use(protect);

// Получение всех шаблонов
router.get('/', templateController.getTemplates);

// Получение конкретного шаблона
router.get('/:name', templateController.getTemplateByName);

// Тестирование шаблона
router.post('/:name/test', templateController.testTemplate);

// Админские маршруты
router.post('/', authorize('admin'), templateController.createTemplate);
router.put('/:name', authorize('admin'), templateController.updateTemplate);
router.delete('/:name', authorize('admin'), templateController.deleteTemplate);
router.put('/company-name', authorize('admin'), templateController.updateCompanyName);

module.exports = router;