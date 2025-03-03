// services/whatsappCloudService.js
const axios = require('axios');
const config = require('../config/config');
const logger = require('./loggerService');
const { AllowedPhone } = require('../models');
const messageTemplates = require('./messageTemplates');

class WhatsAppCloudService {
  constructor() {
    // WhatsApp Cloud API версия
    this.apiVersion = 'v17.0';
    
    // ID телефона, полученный из WhatsApp Business Manager
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    
    // Токен доступа, полученный от Meta Business API
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    // Базовый URL для WhatsApp Cloud API
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    
    // Настройка Axios клиента
    this.axios = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`
      }
    });
    
    // Название компании из конфигурации
    this.companyName = process.env.COMPANY_NAME || 'ТОО "TRABZON"';

    // Проверим подключение при инициализации
    this.isInitialized = false;
    this.initService();
  }

  /**
   * Инициализация сервиса и проверка подключения
   */
  async initService() {
    try {
      // Проверим подключение
      const status = await this.checkStatus();
      this.isInitialized = status.success;
      
      if (this.isInitialized) {
        logger.info('WhatsApp Cloud API успешно инициализирован');
      } else {
        logger.error('Не удалось инициализировать WhatsApp Cloud API');
      }
    } catch (error) {
      logger.error('Ошибка при инициализации WhatsApp Cloud API:', error);
      this.isInitialized = false;
    }
  }

  /**
   * Проверяет статус подключения к WhatsApp Cloud API
   * @returns {Promise<Object>} Статус подключения
   */
  async checkStatus() {
    try {
      // Проверим, доступен ли номер телефона
      const response = await this.axios.get(`/${this.phoneNumberId}?fields=verified_name,quality_rating,status`);
      
      if (response.data && response.data.id) {
        return {
          success: true,
          phoneNumberId: response.data.id,
          verifiedName: response.data.verified_name,
          qualityRating: response.data.quality_rating,
          status: response.data.status,
          timestamp: new Date()
        };
      }
      
      return {
        success: false,
        error: 'Неверный ответ от WhatsApp Cloud API',
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('Ошибка при проверке статуса WhatsApp Cloud API:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Форматирует номер телефона в правильный формат для WhatsApp API
   * @param {string} phoneNumber Номер телефона
   * @returns {string} Отформатированный номер телефона
   */
  formatPhoneNumber(phoneNumber) {
    // Удаляем все нецифровые символы
    let digits = phoneNumber.replace(/\D/g, '');
    
    // Если номер начинается с 8, заменяем на 7 (для России или Казахстана)
    if (digits.startsWith('8') && digits.length === 11) {
      digits = '7' + digits.substring(1);
    }
    
    // Если номер не начинается с плюса, добавляем его
    if (!phoneNumber.startsWith('+')) {
      return '+' + digits;
    }
    
    return digits;
  }

  /**
   * Проверяет, разрешен ли номер для отправки сообщений
   * @param {string} phoneNumber Номер телефона
   * @returns {Promise<boolean>} Разрешен ли номер
   */
  async isPhoneAllowed(phoneNumber) {
    try {
      // Нормализуем номер телефона
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
   * Отправляет текстовое сообщение через WhatsApp Cloud API
   * @param {string} phoneNumber Номер получателя
   * @param {string} message Текст сообщения
   * @returns {Promise<Object>} Результат отправки
   */
  async sendTextMessage(phoneNumber, message) {
    try {
      // Проверяем, что сервис инициализирован
      if (!this.isInitialized) {
        await this.initService();
        if (!this.isInitialized) {
          throw new Error('WhatsApp Cloud API не инициализирован');
        }
      }
      
      // Форматируем номер телефона
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      // Проверяем, разрешен ли номер для отправки
      const isAllowed = await this.isPhoneAllowed(phoneNumber);
      if (!isAllowed) {
        logger.warn(`Попытка отправки сообщения на неразрешенный номер: ${formattedPhone}`);
        throw new Error(`Номер ${formattedPhone} не находится в списке разрешенных`);
      }
      
      // Подготовка данных для запроса
      const requestData = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "text",
        text: {
          preview_url: true,
          body: message
        }
      };
      
      // Отправка запроса
      const response = await this.axios.post(
        `/${this.phoneNumberId}/messages`,
        requestData
      );
      
      if (response.data && response.data.messages && response.data.messages.length > 0) {
        const messageId = response.data.messages[0].id;
        logger.info(`Сообщение успешно отправлено на номер ${formattedPhone}, ID: ${messageId}`);
        
        return {
          success: true,
          messageId: messageId,
          recipient: formattedPhone,
          timestamp: new Date()
        };
      }
      
      throw new Error('Неверный ответ от WhatsApp Cloud API');
    } catch (error) {
      logger.error(`Ошибка при отправке сообщения на номер ${phoneNumber}:`, error.response?.data || error.message);
      throw new Error(`Не удалось отправить сообщение: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Отправляет сообщение с шаблоном через WhatsApp Cloud API
   * @param {string} phoneNumber Номер получателя
   * @param {string} templateName Имя шаблона
   * @param {Array} components Компоненты шаблона (header, body, buttons)
   * @param {string} language Код языка (по умолчанию ru)
   * @returns {Promise<Object>} Результат отправки
   */
  async sendTemplateMessage(phoneNumber, templateName, components = [], language = 'ru') {
    try {
      // Проверяем, что сервис инициализирован
      if (!this.isInitialized) {
        await this.initService();
        if (!this.isInitialized) {
          throw new Error('WhatsApp Cloud API не инициализирован');
        }
      }
      
      // Форматируем номер телефона
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      // Проверяем, разрешен ли номер для отправки
      const isAllowed = await this.isPhoneAllowed(phoneNumber);
      if (!isAllowed) {
        logger.warn(`Попытка отправки шаблона на неразрешенный номер: ${formattedPhone}`);
        throw new Error(`Номер ${formattedPhone} не находится в списке разрешенных`);
      }
      
      // Подготовка данных для запроса
      const requestData = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: formattedPhone,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: language
          },
          components: components
        }
      };
      
      // Отправка запроса
      const response = await this.axios.post(
        `/${this.phoneNumberId}/messages`,
        requestData
      );
      
      if (response.data && response.data.messages && response.data.messages.length > 0) {
        const messageId = response.data.messages[0].id;
        logger.info(`Шаблон ${templateName} успешно отправлен на номер ${formattedPhone}, ID: ${messageId}`);
        
        return {
          success: true,
          messageId: messageId,
          recipient: formattedPhone,
          template: templateName,
          timestamp: new Date()
        };
      }
      
      throw new Error('Неверный ответ от WhatsApp Cloud API');
    } catch (error) {
      logger.error(`Ошибка при отправке шаблона на номер ${phoneNumber}:`, error.response?.data || error.message);
      throw new Error(`Не удалось отправить шаблон: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Формирует параметры шаблона для запроса отзыва
   * @param {Object} order Объект заказа
   * @param {string} reviewLink Ссылка для отзыва
   * @returns {Array} Массив компонентов шаблона
   */
  formatReviewRequestTemplate(order, reviewLink) {
    // Получаем имя клиента (только имя без фамилии)
    const customerName = order.customerName.split(' ')[0];
    
    // Данные первого товара в заказе
    const firstItem = order.orderItems[0];
    
    // Формируем компоненты шаблона
    return [
      {
        type: "body",
        parameters: [
          {
            type: "text",
            text: customerName
          },
          {
            type: "text",
            text: firstItem.name
          },
          {
            type: "text",
            text: this.companyName
          },
          {
            type: "text",
            text: reviewLink
          }
        ]
      }
    ];
  }

  /**
   * Отправляет запрос отзыва через WhatsApp Cloud API
   * @param {Object} order Объект заказа
   * @returns {Promise<Object>} Результат отправки
   */
  async sendReviewRequest(order) {
    try {
      // Проверяем, что у заказа есть товары
      if (!order.orderItems || !Array.isArray(order.orderItems) || order.orderItems.length === 0) {
        throw new Error('Заказ не содержит товаров');
      }
      
      // Генерируем ссылку для отзыва
      const productCode = order.orderItems[0].code;
      const orderCode = order.kaspiOrderId.split('-')[0] || order.kaspiOrderId;
      const reviewLink = `https://kaspi.kz/shop/review/productreview?productCode=${productCode}&orderCode=${orderCode}&rating=5`;
      
      // Проверяем, есть ли у нас зарегистрированный шаблон
      // Если шаблоны не настроены, отправляем обычное текстовое сообщение
      let result;
      
      try {
        // Пробуем отправить сообщение шаблона
        const components = this.formatReviewRequestTemplate(order, reviewLink);
        result = await this.sendTemplateMessage(
          order.customerPhone,
          'review_request', // Имя шаблона, зарегистрированного в WhatsApp Business Manager
          components
        );
      } catch (templateError) {
        logger.warn(`Не удалось отправить шаблон, используем текстовое сообщение: ${templateError.message}`);
        
        // Если не получилось отправить шаблон, используем обычное сообщение
        const message = messageTemplates.getReviewRequestMessage(order, reviewLink);
        result = await this.sendTextMessage(order.customerPhone, message);
      }
      
      logger.info(`Запрос отзыва успешно отправлен для заказа ${order.kaspiOrderId}`);
      return result;
    } catch (error) {
      logger.error(`Ошибка при отправке запроса отзыва для заказа ${order.kaspiOrderId}:`, error);
      throw new Error(`Не удалось отправить запрос отзыва: ${error.message}`);
    }
  }

  /**
   * Получает информацию о бизнес-аккаунте WhatsApp
   * @returns {Promise<Object>} Информация о бизнес-аккаунте
   */
  async getBusinessProfile() {
    try {
      const response = await this.axios.get(`/${this.phoneNumberId}/whatsapp_business_profile`);
      return response.data;
    } catch (error) {
      logger.error('Ошибка при получении бизнес-профиля WhatsApp:', error.response?.data || error.message);
      throw new Error(`Не удалось получить бизнес-профиль: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Обновляет бизнес-профиль WhatsApp
   * @param {Object} profileData Данные профиля
   * @returns {Promise<Object>} Результат обновления
   */
  async updateBusinessProfile(profileData) {
    try {
      const requestData = {
        messaging_product: "whatsapp",
        ...profileData
      };
      
      const response = await this.axios.patch(
        `/${this.phoneNumberId}/whatsapp_business_profile`,
        requestData
      );
      
      return response.data;
    } catch (error) {
      logger.error('Ошибка при обновлении бизнес-профиля WhatsApp:', error.response?.data || error.message);
      throw new Error(`Не удалось обновить бизнес-профиль: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Получает информацию о шаблонах сообщений
   * @returns {Promise<Array>} Массив шаблонов
   */
  async getMessageTemplates() {
    try {
      const response = await this.axios.get(`/${this.phoneNumberId}/message_templates`);
      return response.data.data;
    } catch (error) {
      logger.error('Ошибка при получении шаблонов сообщений:', error.response?.data || error.message);
      throw new Error(`Не удалось получить шаблоны сообщений: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Отправляет тестовое сообщение
   * @param {string} phoneNumber Номер получателя
   * @param {string} message Текст сообщения (опционально)
   * @returns {Promise<Object>} Результат отправки
   */
  async sendTestMessage(phoneNumber, message = null) {
    try {
      // Если сообщение не указано, используем шаблон тестового сообщения
      const testMessage = message || messageTemplates.getTestMessage();
      
      // Отправляем сообщение
      const result = await this.sendTextMessage(phoneNumber, testMessage);
      
      return result;
    } catch (error) {
      logger.error(`Ошибка при отправке тестового сообщения на номер ${phoneNumber}:`, error);
      throw new Error(`Не удалось отправить тестовое сообщение: ${error.message}`);
    }
  }
}

module.exports = new WhatsAppCloudService();