// services/notificationScheduler.js
const cron = require('node-cron');
const logger = require('./loggerService');
const kaspiService = require('./kaspiService');
const whatsappService = require('./whatsappService');
const { Order } = require('../models');

class NotificationScheduler {
  constructor() {
    // Настройки времени отправки (по умолчанию с 9:00 до 21:00)
    this.startHour = 9;
    this.endHour = 21;
  }

  /**
   * Начинает планирование отправки уведомлений
   */
  startScheduling() {
    // Проверяем новые заказы каждый час
    cron.schedule('0 * * * *', () => {
      this.checkNewOrders();
    });

    // Отправляем запросы отзывов каждые 15 минут
    cron.schedule('*/15 * * * *', () => {
      this.sendReviewRequests();
    });

    logger.info('Планировщик уведомлений запущен');
  }

  /**
   * Проверяет и получает новые заказы из Kaspi API
   */
  async checkNewOrders() {
    try {
      logger.info('Запуск проверки новых заказов из Kaspi API');
      
      // Получаем заказы за последние 24 часа
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      
      const orders = await kaspiService.fetchNewOrders(yesterday, now);
      
      if (orders && orders.length > 0) {
        await kaspiService.processOrders(orders);
        logger.info(`Обработано ${orders.length} новых заказов из Kaspi API`);
      } else {
        logger.info('Новых заказов не найдено');
      }
    } catch (error) {
      logger.error('Ошибка при проверке новых заказов:', error);
    }
  }

  /**
   * Отправляет запросы на написание отзывов
   */
  async sendReviewRequests() {
    try {
      // Проверяем, находимся ли мы в разрешенное время для отправки
      const now = new Date();
      const currentHour = now.getHours();
      
      if (currentHour < this.startHour || currentHour >= this.endHour) {
        logger.info(`Сейчас не время для отправки уведомлений (${currentHour}:${now.getMinutes()}). Разрешено с ${this.startHour}:00 до ${this.endHour}:00`);
        return;
      }
      
      logger.info('Запуск отправки запросов отзывов');
      
      // Получаем заказы, для которых нужно отправить уведомления
      const orders = await kaspiService.getOrdersForReviewNotification(20); // Ограничиваем 20 заказами за раз
      
      if (orders.length === 0) {
        logger.info('Нет заказов для отправки запросов отзывов');
        return;
      }
      
      logger.info(`Отправка запросов отзывов для ${orders.length} заказов`);
      
      // Обрабатываем каждый заказ
      for (const order of orders) {
        try {
          // Отправляем запрос отзыва
          await whatsappService.sendReviewRequest(order);
          
          // Обновляем статус уведомления
          await order.update({
            notificationStatus: 'sent',
            notificationSentAt: new Date()
          });
          
          logger.info(`Запрос отзыва успешно отправлен для заказа ${order.kaspiOrderId}`);
          
          // Добавляем небольшую задержку между отправками, чтобы не перегружать API
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          // Обновляем статус с ошибкой
          await order.update({
            notificationStatus: 'failed',
            notificationError: error.message
          });
          
          logger.error(`Ошибка при отправке запроса отзыва для заказа ${order.kaspiOrderId}:`, error);
        }
      }
      
      logger.info('Отправка запросов отзывов завершена');
    } catch (error) {
      logger.error('Ошибка при отправке запросов отзывов:', error);
    }
  }

  /**
   * Устанавливает временные рамки для отправки уведомлений
   * @param {number} startHour - Час начала отправки (0-23)
   * @param {number} endHour - Час окончания отправки (0-23)
   */
  setTimeWindow(startHour, endHour) {
    if (startHour >= 0 && startHour <= 23 && endHour >= 0 && endHour <= 23 && startHour < endHour) {
      this.startHour = startHour;
      this.endHour = endHour;
      logger.info(`Установлено новое время отправки уведомлений: с ${startHour}:00 до ${endHour}:00`);
    } else {
      logger.error('Некорректные временные рамки для отправки уведомлений');
    }
  }

  /**
   * Ручной запуск отправки запросов отзывов (для тестирования или по требованию)
   * @param {number} limit - Ограничение количества заказов
   */
  async manualSendReviewRequests(limit = 10) {
    try {
      logger.info(`Ручной запуск отправки запросов отзывов (лимит: ${limit})`);
      
      // Получаем заказы для отправки
      const orders = await kaspiService.getOrdersForReviewNotification(limit);
      
      if (orders.length === 0) {
        logger.info('Нет заказов для отправки запросов отзывов');
        return [];
      }
      
      const results = [];
      
      // Обрабатываем каждый заказ
      for (const order of orders) {
        try {
          // Отправляем запрос отзыва
          const result = await whatsappService.sendReviewRequest(order);
          
          // Обновляем статус уведомления
          await order.update({
            notificationStatus: 'sent',
            notificationSentAt: new Date()
          });
          
          results.push({
            orderId: order.kaspiOrderId,
            status: 'success',
            recipient: order.customerPhone
          });
          
          logger.info(`Запрос отзыва успешно отправлен для заказа ${order.kaspiOrderId}`);
        } catch (error) {
          // Обновляем статус с ошибкой
          await order.update({
            notificationStatus: 'failed',
            notificationError: error.message
          });
          
          results.push({
            orderId: order.kaspiOrderId,
            status: 'failed',
            error: error.message
          });
          
          logger.error(`Ошибка при отправке запроса отзыва для заказа ${order.kaspiOrderId}:`, error);
        }
      }
      
      return results;
    } catch (error) {
      logger.error('Ошибка при ручной отправке запросов отзывов:', error);
      throw error;
    }
  }
}

module.exports = new NotificationScheduler();