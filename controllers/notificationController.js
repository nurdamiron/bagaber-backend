// controllers/notificationController.js
const notificationScheduler = require('../services/notificationScheduler');
const whatsappService = require('../services/whatsappService');
const whatsappCloudService = require('../services/whatsappCloudService');
const kaspiService = require('../services/kaspiService');
const messageTemplates = require('../services/messageTemplates');
const { Order } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../services/loggerService');
const { Op } = require('sequelize');
const config = require('../config/config');

// @desc    Запуск ручной отправки запросов на отзывы
// @route   POST /api/notifications/send-review-requests
// @access  Private/Admin
const manualSendReviewRequests = async (req, res, next) => {
  try {
    const { limit = 10 } = req.body;
    
    // Проверяем, что лимит является числом и не превышает разумные пределы
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit <= 0 || parsedLimit > 50) {
      return next(new ApiError(400, 'Лимит должен быть положительным числом не более 50'));
    }

    // Запускаем ручную отправку уведомлений
    const results = await notificationScheduler.manualSendReviewRequests(parsedLimit);
    
    res.status(200).json({
      success: true,
      message: `Запущена отправка запросов на отзывы для ${results.length} заказов`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Получение статистики по отправленным уведомлениям
// @route   GET /api/notifications/stats
// @access  Private
const getNotificationStats = async (req, res, next) => {
  try {
    // Получаем статистику по всем уведомлениям
    const totalCount = await Order.count();
    const pendingCount = await Order.count({ where: { notificationStatus: 'pending' } });
    const sentCount = await Order.count({ where: { notificationStatus: 'sent' } });
    const deliveredCount = await Order.count({ where: { notificationStatus: 'delivered' } });
    const readCount = await Order.count({ where: { notificationStatus: 'read' } });
    const failedCount = await Order.count({ where: { notificationStatus: 'failed' } });
    
    // Получаем статистику за последние 7 дней
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);
    
    const last7DaysCount = await Order.count({
      where: {
        notificationSentAt: {
          [Op.gte]: last7Days
        }
      }
    });
    
    // Получаем последние неудачные отправки
    const lastFailed = await Order.findAll({
      where: { notificationStatus: 'failed' },
      limit: 10,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'kaspiOrderId', 'customerPhone', 'notificationError', 'updatedAt']
    });
    
    res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        pending: pendingCount,
        sent: sentCount,
        delivered: deliveredCount,
        read: readCount,
        failed: failedCount,
        last7Days: last7DaysCount,
        lastFailed: lastFailed
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Настройка временных рамок для отправки уведомлений
// @route   PUT /api/notifications/time-window
// @access  Private/Admin
const setTimeWindow = async (req, res, next) => {
  try {
    const { startHour, endHour } = req.body;
    
    // Проверяем, что оба параметра являются числами
    const parsedStartHour = parseInt(startHour);
    const parsedEndHour = parseInt(endHour);
    
    if (isNaN(parsedStartHour) || isNaN(parsedEndHour)) {
      return next(new ApiError(400, 'Начальный и конечный часы должны быть числами'));
    }
    
    // Проверяем, что часы в допустимом диапазоне
    if (parsedStartHour < 0 || parsedStartHour > 23 || parsedEndHour < 0 || parsedEndHour > 23) {
      return next(new ApiError(400, 'Начальный и конечный часы должны быть в диапазоне от 0 до 23'));
    }
    
    // Проверяем, что начальный час меньше конечного
    if (parsedStartHour >= parsedEndHour) {
      return next(new ApiError(400, 'Начальный час должен быть меньше конечного'));
    }
    
    // Устанавливаем временные рамки
    notificationScheduler.setTimeWindow(parsedStartHour, parsedEndHour);
    
    res.status(200).json({
      success: true,
      message: `Установлены новые временные рамки для отправки уведомлений: с ${parsedStartHour}:00 до ${parsedEndHour}:00`,
      data: {
        startHour: parsedStartHour,
        endHour: parsedEndHour
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Получение статуса планировщика уведомлений
// @route   GET /api/notifications/status
// @access  Private
const getSchedulerStatus = async (req, res, next) => {
  try {
    const status = {
      isRunning: true, // Предполагаем, что планировщик всегда работает после запуска
      timeWindow: {
        startHour: notificationScheduler.startHour,
        endHour: notificationScheduler.endHour
      },
      maxDailyLimit: 250, // Лимит WhatsApp на количество начатых бизнесом диалогов в сутки
      whatsappApi: {
        type: config.whatsapp.type,
        status: await checkWhatsAppStatus()
      }
    };
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Повторная отправка неудачных уведомлений
// @route   POST /api/notifications/retry-failed
// @access  Private/Admin
const retryFailedNotifications = async (req, res, next) => {
  try {
    // Находим все заказы с неудачными уведомлениями
    const failedOrders = await Order.findAll({
      where: { notificationStatus: 'failed' },
      limit: 20 // Ограничиваем количество, чтобы не перегрузить систему
    });
    
    if (failedOrders.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Нет неудачных уведомлений для повторной отправки',
        data: []
      });
    }
    
    const results = [];
    
    // Обрабатываем каждый заказ
    for (const order of failedOrders) {
      try {
        // Отправляем запрос отзыва, используя соответствующий сервис на основе настроек
        if (config.whatsapp.type === 'cloud') {
          await whatsappCloudService.sendReviewRequest(order);
        } else {
          await whatsappService.sendReviewRequest(order);
        }
        
        // Обновляем статус уведомления
        await order.update({
          notificationStatus: 'sent',
          notificationSentAt: new Date(),
          notificationError: null
        });
        
        results.push({
          orderId: order.kaspiOrderId,
          status: 'success',
          recipient: order.customerPhone
        });
      } catch (error) {
        // Обновляем статус с новой ошибкой
        await order.update({
          notificationError: error.message
        });
        
        results.push({
          orderId: order.kaspiOrderId,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Повторная отправка выполнена для ${failedOrders.length} неудачных уведомлений`,
      data: results
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Отправка тестового уведомления
// @route   POST /api/notifications/test
// @access  Private/Admin
const sendTestNotification = async (req, res, next) => {
  try {
    const { phoneNumber, templateName = 'testMessage', variables = {} } = req.body;
    
    if (!phoneNumber) {
      return next(new ApiError(400, 'Номер телефона обязателен'));
    }
    
    // Проверяем, существует ли шаблон
    const templates = messageTemplates.getAllTemplates();
    if (!templates[templateName]) {
      return next(new ApiError(404, `Шаблон с именем "${templateName}" не найден`));
    }
    
    // Компилируем шаблон с предоставленными переменными
    const compiledMessage = messageTemplates.compile(templateName, {
      ...variables,
      timestamp: new Date().toLocaleString('ru-RU'),
      testValue: variables.testValue || 'Тестовое сообщение'
    });
    
    // Отправляем тестовое сообщение через соответствующий сервис
    let result;
    if (config.whatsapp.type === 'cloud') {
      result = await whatsappCloudService.sendTextMessage(phoneNumber, compiledMessage);
    } else {
      result = await whatsappService.sendMessage(phoneNumber, compiledMessage);
    }
    
    res.status(200).json({
      success: true,
      message: 'Тестовое уведомление успешно отправлено',
      data: {
        recipient: phoneNumber,
        template: templateName,
        compiledMessage,
        result
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Получение ежедневной статистики отправки за последние 30 дней
// @route   GET /api/notifications/daily-stats
// @access  Private
const getDailyStats = async (req, res, next) => {
  try {
    // Получаем дату 30 дней назад
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Находим все уведомления, отправленные за последние 30 дней
    const notifications = await Order.findAll({
      where: {
        notificationSentAt: {
          [Op.gte]: thirtyDaysAgo
        }
      },
      attributes: ['notificationSentAt', 'notificationStatus']
    });
    
    // Инициализируем объект для хранения статистики по дням
    const dailyStats = {};
    
    // Заполняем все дни за последние 30 дней нулевыми значениями
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      
      dailyStats[dateString] = {
        date: dateString,
        total: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0
      };
    }
    
    // Обрабатываем данные и заполняем статистику
    notifications.forEach(notification => {
      if (!notification.notificationSentAt) return;
      
      const dateString = notification.notificationSentAt.toISOString().split('T')[0];
      if (!dailyStats[dateString]) return;
      
      dailyStats[dateString].total += 1;
      
      switch (notification.notificationStatus) {
        case 'sent':
          dailyStats[dateString].sent += 1;
          break;
        case 'delivered':
          dailyStats[dateString].delivered += 1;
          break;
        case 'read':
          dailyStats[dateString].read += 1;
          break;
        case 'failed':
          dailyStats[dateString].failed += 1;
          break;
      }
    });
    
    // Преобразуем объект в массив и сортируем по дате
    const sortedStats = Object.values(dailyStats).sort((a, b) => 
      new Date(a.date) - new Date(b.date)
    );
    
    res.status(200).json({
      success: true,
      data: sortedStats
    });
  } catch (error) {
    next(error);
  }
};

// Вспомогательная функция для проверки статуса WhatsApp
const checkWhatsAppStatus = async () => {
  try {
    if (config.whatsapp.type === 'cloud') {
      return await whatsappCloudService.checkStatus();
    } else {
      return await whatsappService.checkConnectionStatus();
    }
  } catch (error) {
    logger.error('Ошибка при проверке статуса WhatsApp:', error);
    return {
      success: false,
      error: error.message,
      timestamp: new Date()
    };
  }
};

module.exports = {
  manualSendReviewRequests,
  getNotificationStats,
  setTimeWindow,
  getSchedulerStatus,
  retryFailedNotifications,
  sendTestNotification,
  getDailyStats
};