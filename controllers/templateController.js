// controllers/templateController.js
const fs = require('fs');
const path = require('path');
const messageTemplates = require('../services/messageTemplates');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../services/loggerService');

// Путь к файлу с шаблонами
const templatesFilePath = process.env.TEMPLATES_FILE_PATH || path.join(__dirname, '../config/templates.json');

// Функция для сохранения шаблонов в файл
const saveTemplatesToFile = () => {
  try {
    const templates = messageTemplates.getAllTemplates();
    fs.writeFileSync(templatesFilePath, JSON.stringify(templates, null, 2), 'utf8');
    return true;
  } catch (error) {
    logger.error('Ошибка при сохранении шаблонов в файл:', error);
    return false;
  }
};

// @desc    Получение всех шаблонов сообщений
// @route   GET /api/templates
// @access  Private/Admin
const getTemplates = async (req, res, next) => {
  try {
    const templates = messageTemplates.getAllTemplates();
    
    res.status(200).json({
      success: true,
      data: templates
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Получение конкретного шаблона по имени
// @route   GET /api/templates/:name
// @access  Private/Admin
const getTemplateByName = async (req, res, next) => {
  try {
    const { name } = req.params;
    const templates = messageTemplates.getAllTemplates();
    
    if (!templates[name]) {
      return next(new ApiError(404, `Шаблон с именем "${name}" не найден`));
    }
    
    res.status(200).json({
      success: true,
      data: {
        name,
        content: templates[name]
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Создание нового шаблона
// @route   POST /api/templates
// @access  Private/Admin
const createTemplate = async (req, res, next) => {
  try {
    const { name, content } = req.body;
    
    if (!name || !content) {
      return next(new ApiError(400, 'Необходимо указать имя (name) и содержание (content) шаблона'));
    }
    
    const templates = messageTemplates.getAllTemplates();
    
    if (templates[name]) {
      return next(new ApiError(400, `Шаблон с именем "${name}" уже существует`));
    }
    
    const added = messageTemplates.addTemplate(name, content);
    
    if (!added) {
      return next(new ApiError(500, 'Не удалось добавить шаблон'));
    }
    
    // Сохраняем шаблоны в файл
    saveTemplatesToFile();
    
    res.status(201).json({
      success: true,
      message: `Шаблон "${name}" успешно создан`,
      data: {
        name,
        content
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Обновление существующего шаблона
// @route   PUT /api/templates/:name
// @access  Private/Admin
const updateTemplate = async (req, res, next) => {
  try {
    const { name } = req.params;
    const { content } = req.body;
    
    if (!content) {
      return next(new ApiError(400, 'Необходимо указать содержание (content) шаблона'));
    }
    
    const templates = messageTemplates.getAllTemplates();
    
    if (!templates[name]) {
      return next(new ApiError(404, `Шаблон с именем "${name}" не найден`));
    }
    
    const updated = messageTemplates.updateTemplate(name, content);
    
    if (!updated) {
      return next(new ApiError(500, 'Не удалось обновить шаблон'));
    }
    
    // Сохраняем шаблоны в файл
    saveTemplatesToFile();
    
    res.status(200).json({
      success: true,
      message: `Шаблон "${name}" успешно обновлен`,
      data: {
        name,
        content
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Удаление шаблона
// @route   DELETE /api/templates/:name
// @access  Private/Admin
const deleteTemplate = async (req, res, next) => {
  try {
    const { name } = req.params;
    
    const templates = messageTemplates.getAllTemplates();
    
    if (!templates[name]) {
      return next(new ApiError(404, `Шаблон с именем "${name}" не найден`));
    }
    
    // Проверяем, чтобы не удалить системные шаблоны
    const systemTemplates = ['reviewRequest', 'deliveryNotification', 'newOrderConfirmation', 'testMessage'];
    if (systemTemplates.includes(name)) {
      return next(new ApiError(400, `Нельзя удалить системный шаблон "${name}"`));
    }
    
    const deleted = messageTemplates.deleteTemplate(name);
    
    if (!deleted) {
      return next(new ApiError(500, 'Не удалось удалить шаблон'));
    }
    
    // Сохраняем шаблоны в файл
    saveTemplatesToFile();
    
    res.status(200).json({
      success: true,
      message: `Шаблон "${name}" успешно удален`
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Обновление названия компании
// @route   PUT /api/templates/company-name
// @access  Private/Admin
const updateCompanyName = async (req, res, next) => {
  try {
    const { companyName } = req.body;
    
    if (!companyName) {
      return next(new ApiError(400, 'Необходимо указать название компании'));
    }
    
    // Обновляем название компании в сервисе шаблонов
    messageTemplates.companyName = companyName;
    
    // Сохраняем в конфигурационный файл (в реальном приложении нужно использовать более безопасный способ)
    // Например, сохранять в базу данных или использовать специальный сервис для управления конфигурацией
    try {
      const envFilePath = path.join(__dirname, '../.env');
      let envContent = '';
      
      if (fs.existsSync(envFilePath)) {
        envContent = fs.readFileSync(envFilePath, 'utf8');
        // Обновляем переменную COMPANY_NAME
        if (envContent.includes('COMPANY_NAME=')) {
          envContent = envContent.replace(/COMPANY_NAME=.*(\r?\n|$)/g, `COMPANY_NAME=${companyName}$1`);
        } else {
          envContent += `\nCOMPANY_NAME=${companyName}\n`;
        }
      } else {
        envContent = `COMPANY_NAME=${companyName}\n`;
      }
      
      fs.writeFileSync(envFilePath, envContent, 'utf8');
    } catch (error) {
      logger.warn('Не удалось сохранить название компании в .env файл:', error);
      // Продолжаем работу, так как изменение уже применено в памяти
    }
    
    res.status(200).json({
      success: true,
      message: 'Название компании успешно обновлено',
      data: {
        companyName
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Тестирование шаблона с предоставленными данными
// @route   POST /api/templates/:name/test
// @access  Private/Admin
const testTemplate = async (req, res, next) => {
  try {
    const { name } = req.params;
    const variables = req.body;
    
    const templates = messageTemplates.getAllTemplates();
    
    if (!templates[name]) {
      return next(new ApiError(404, `Шаблон с именем "${name}" не найден`));
    }
    
    // Компилируем шаблон с предоставленными переменными
    const compiledMessage = messageTemplates.compile(name, variables);
    
    res.status(200).json({
      success: true,
      data: {
        name,
        variables,
        compiledMessage
      }
    });
  } catch (error) {
    next(error);
  }
};

// Инициализация при запуске: загружаем шаблоны из файла, если он существует
const initTemplates = () => {
  try {
    if (fs.existsSync(templatesFilePath)) {
      const templatesData = fs.readFileSync(templatesFilePath, 'utf8');
      const templates = JSON.parse(templatesData);
      
      Object.entries(templates).forEach(([name, content]) => {
        // Не перезаписываем системные шаблоны
        const systemTemplates = ['reviewRequest', 'deliveryNotification', 'newOrderConfirmation', 'testMessage'];
        if (!systemTemplates.includes(name)) {
          messageTemplates.addTemplate(name, content);
        }
      });
      
      logger.info(`Загружены шаблоны сообщений из файла ${templatesFilePath}`);
    } else {
      // Создаем файл с базовыми шаблонами
      saveTemplatesToFile();
      logger.info(`Создан файл с базовыми шаблонами сообщений: ${templatesFilePath}`);
    }
  } catch (error) {
    logger.error('Ошибка при инициализации шаблонов:', error);
  }
};

// Запускаем инициализацию
initTemplates();

module.exports = {
  getTemplates,
  getTemplateByName,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  updateCompanyName,
  testTemplate
};