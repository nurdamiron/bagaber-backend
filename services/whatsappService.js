// services/whatsappService.js
const axios = require('axios');
const config = require('../config/config');
const logger = require('./loggerService');
const { AllowedPhone } = require('../models');
const kaspiService = require('./kaspiService');

class WhatsAppService {
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.apiKey = config.whatsapp.apiKey;
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      timeout: 15000, // 15 seconds timeout
    });
    this.isWhatsAppVerified = false;
  }

  /**
   * Проверяет, разрешен ли номер для отправки сообщений
   * @param {string} phoneNumber - Номер телефона
   * @returns {Promise<boolean>} - Разрешен ли номер
   */
  async isPhoneAllowed(phoneNumber) {
    try {
      // Нормализуем номер телефона (удаляем пробелы, тире и т.д.)
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      
      // Проверяем, существует ли номер в таблице allowed_phones
      const allowedPhone = await AllowedPhone.findOne({
        where: {
          phoneNumber: normalizedPhone,
          isActive: true,
        },
      });

      return !!allowedPhone;
    } catch (error) {
      logger.error(`Ошибка при проверке номера ${phoneNumber}:`, error);
      return false;
    }
  }

  /**
   * Отправляет сообщение в WhatsApp
   * @param {string} phoneNumber - Номер получателя
   * @param {string} message - Текст сообщения
   * @param {Array} [attachments] - Дополнительные вложения
   * @returns {Promise<Object>} - Результат отправки сообщения
   */
  async sendMessage(phoneNumber, message, attachments = []) {
    try {
      // Проверяем, что WhatsApp API верифицирован
      if (!this.isWhatsAppVerified) {
        const status = await this.checkConnectionStatus();
        if (!status.connected) {
          throw new Error('WhatsApp API не верифицирован. Сначала выполните верификацию номера.');
        }
      }

      // Нормализуем номер телефона
      const normalizedPhone = phoneNumber.replace(/\D/g, '');

      // Подготавливаем данные для отправки
      const payload = {
        recipient: normalizedPhone,
        message: message,
      };

      // Добавляем вложения, если есть
      if (attachments && attachments.length > 0) {
        payload.attachments = attachments;
      }

      // Здесь должен быть реальный API запрос к WhatsApp API
      // const response = await this.axiosInstance.post('/messages', payload);
      
      // Для тестирования, возвращаем успешный результат
      logger.info(`Успешно отправлено WhatsApp сообщение на номер ${phoneNumber}`);
      return { success: true, recipient: normalizedPhone };
    } catch (error) {
      logger.error(`Ошибка при отправке WhatsApp сообщения на номер ${phoneNumber}:`, error);
      throw new Error(`Не удалось отправить WhatsApp сообщение: ${error.message}`);
    }
  }

  /**
   * Формирует и отправляет уведомление о запросе отзыва
   * @param {Object} order - Объект заказа
   * @returns {Promise<Object>} - Результат отправки сообщения
   */
  async sendReviewRequest(order) {
    try {
      // Проверяем, что у заказа есть товары
      if (!order.orderItems || !Array.isArray(order.orderItems) || order.orderItems.length === 0) {
        throw new Error('Заказ не содержит товаров');
      }

      // Берем первый товар для формирования ссылки на отзыв
      const firstItem = order.orderItems[0];
      const productCode = firstItem.code;
      const orderCode = order.kaspiOrderId.split('-')[0] || order.kaspiOrderId; // На случай, если формат другой
      
      // Генерируем ссылку для отзыва
      const reviewLink = kaspiService.generateReviewLink(productCode, orderCode);

      // Формируем имя клиента (только имя без фамилии, если возможно)
      const customerFirstName = order.customerName.split(' ')[0];
      
      // Формируем текст сообщения
      const message = `Здравствуйте, ${customerFirstName}! Поздравляем Вас с покупкой "${firstItem.name}" в магазине "ТОО "TRABZON""! Спасибо, что выбрали нас! Мы будем благодарны, если Вы оставите нам отзыв. Вы можете сделать это по ссылке ниже ⬇️ ${reviewLink} (Отправьте нам любое сообщение, чтобы ссылка стала кликабельной) С уважением, ТОО "TRABZON"`;

      // Отправляем сообщение
      const result = await this.sendMessage(order.customerPhone, message);
      return result;
    } catch (error) {
      logger.error(`Ошибка при отправке запроса отзыва для заказа ${order.kaspiOrderId}:`, error);
      throw new Error(`Не удалось отправить запрос отзыва: ${error.message}`);
    }
  }

  /**
   * Инициирует регистрацию номера WhatsApp
   * @param {string} phoneNumber - Номер телефона для регистрации
   * @param {string} method - Метод получения кода (sms или voice)
   * @param {string} cert - Сертификат в кодировке Base64
   * @param {string} [pin] - PIN-код (если включена двухэтапная верификация)
   * @returns {Promise<Object>} - Результат запроса регистрации
   */
  async registerWhatsAppNumber(phoneNumber, method = 'sms', certPath) {
    try {
      // Read certificate file
      const cert = fs.readFileSync(certPath, {encoding: 'base64'});
      
      // Format phone number properly
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      const cc = '7'; // Country code for Kazakhstan
      const phone_number = normalizedPhone.startsWith('7') ? 
                           normalizedPhone.substring(1) : normalizedPhone;
      
      const payload = {
        cc,
        phone_number,
        method,
        cert
      };
      
      const response = await this.axiosInstance.post('/v1/account', payload);
      this.phoneVerificationPending = true;
      
      logger.info(`WhatsApp registration initiated for ${phoneNumber}`);
      return response.data;
    } catch (error) {
      logger.error(`WhatsApp registration failed: ${error.message}`);
      throw new Error(`Failed to register WhatsApp: ${error.message}`);
    }
  }

  /**
   * Верифицирует WhatsApp номер с помощью кода
   * @param {string} code - Код верификации
   * @returns {Promise<Object>} - Результат верификации
   */
  async verifyWhatsAppRegistration(code) {
    try {
      // Здесь должен быть реальный API запрос
      // const response = await this.axiosInstance.post('/v1/account/verify', { code });
      
      // Для тестирования, устанавливаем флаг успешной верификации
      this.isWhatsAppVerified = true;
      
      logger.info('WhatsApp номер успешно верифицирован');
      return {
        status: 'verified',
        message: 'WhatsApp номер успешно верифицирован'
      };
    } catch (error) {
      logger.error(`Ошибка при верификации WhatsApp номера:`, error);
      throw new Error(`Не удалось верифицировать WhatsApp номер: ${error.message}`);
    }
  }

  /**
   * Проверяет статус соединения с WhatsApp API
   * @returns {Promise<Object>} - Статус соединения
   */
  async checkConnectionStatus() {
    try {
      // Здесь должен быть реальный API запрос
      // const response = await this.axiosInstance.get('/status');
      
      // Для тестирования, возвращаем заглушку
      logger.info('Успешно проверен статус соединения с WhatsApp');
      return {
        connected: this.isWhatsAppVerified,
        timestamp: new Date(),
        status: this.isWhatsAppVerified ? 'connected' : 'not_verified'
      };
    } catch (error) {
      logger.error('Ошибка при проверке статуса соединения с WhatsApp:', error);
      return {
        connected: false,
        error: error.message,
        status: 'error'
      };
    }
  }

  /**
   * Получает всех разрешенных получателей из базы данных
   * @returns {Promise<Array>} - Массив разрешенных номеров
   */
  async getAllowedPhones() {
    try {
      const phones = await AllowedPhone.findAll({
        where: { isActive: true },
      });
      return phones;
    } catch (error) {
      logger.error('Ошибка при получении разрешенных номеров:', error);
      throw new Error(`Не удалось получить разрешенные номера: ${error.message}`);
    }
  }

  /**
   * Добавляет номер в список разрешенных
   * @param {string} phoneNumber - Номер телефона
   * @param {string} description - Описание
   * @param {number} userId - ID пользователя, добавившего номер
   * @returns {Promise<Object>} - Созданный объект разрешенного номера
   */
  async addAllowedPhone(phoneNumber, description, userId) {
    try {
      // Нормализуем номер телефона
      const normalizedPhone = phoneNumber.replace(/\D/g, '');
      
      // Проверяем, существует ли номер уже в базе
      const existingPhone = await AllowedPhone.findOne({
        where: { phoneNumber: normalizedPhone },
      });
      
      if (existingPhone) {
        // Если номер существует, но не активен, активируем его
        if (!existingPhone.isActive) {
          existingPhone.isActive = true;
          existingPhone.description = description || existingPhone.description;
          await existingPhone.save();
          
          logger.info(`Номер ${phoneNumber} повторно активирован в списке разрешенных`);
          return existingPhone;
        }
        
        throw new Error('Этот номер уже добавлен в список разрешенных');
      }

      // Создаем новую запись в базе
      const newPhone = await AllowedPhone.create({
        phoneNumber: normalizedPhone,
        description: description || '',
        isActive: true,
        userId: userId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      logger.info(`Номер ${phoneNumber} добавлен в список разрешенных`);
      return newPhone;
    } catch (error) {
      logger.error(`Ошибка при добавлении номера ${phoneNumber} в список разрешенных:`, error);
      throw new Error(`Не удалось добавить номер в список разрешенных: ${error.message}`);
    }
  }

  /**
   * Отправляет тестовое сообщение
   * @param {string} phoneNumber - Номер получателя
   * @param {string} message - Текст сообщения
   * @returns {Promise<Object>} - Результат отправки сообщения
   */
  async sendTestMessage(phoneNumber, message) {
    try {
      const result = await this.sendMessage(phoneNumber, message || 'Это тестовое сообщение от системы Kaspi WhatsApp Integration');
      return result;
    } catch (error) {
      logger.error(`Ошибка при отправке тестового сообщения на номер ${phoneNumber}:`, error);
      throw new Error(`Не удалось отправить тестовое сообщение: ${error.message}`);
    }
  }
}

module.exports = new WhatsAppService();