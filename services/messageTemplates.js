// services/messageTemplates.js
const logger = require('./loggerService');
const config = require('../config/config');

/**
 * Шаблонизатор сообщений для WhatsApp
 */
class MessageTemplates {
  constructor() {
    // Название компании для использования в шаблонах
    this.companyName = process.env.COMPANY_NAME || 'ТОО "TRABZON"';
    
    // Базовые шаблоны сообщений
    this.templates = {
      // Шаблон для запроса отзыва
      reviewRequest: 
`Здравствуйте, {{customerName}}!

Благодарим Вас за покупку "{{productName}}" в магазине "{{companyName}}".

Мы будем очень признательны за Ваш отзыв о товаре и нашем сервисе. Это поможет нам стать лучше для Вас!

Чтобы оставить отзыв, пожалуйста, перейдите по ссылке:
{{reviewLink}}

(Отправьте нам любое сообщение, чтобы ссылка стала кликабельной)

С уважением,
{{companyName}}`,

      // Шаблон для уведомления о доставке
      deliveryNotification:
`Здравствуйте, {{customerName}}!

Рады сообщить, что Ваш заказ №{{orderNumber}} ("{{productName}}") доставлен по адресу: {{deliveryAddress}}.

Если у Вас возникнут вопросы по товару, пожалуйста, свяжитесь с нами.

С уважением,
{{companyName}}`,

      // Шаблон для уведомления о новом заказе
      newOrderConfirmation:
`Здравствуйте, {{customerName}}!

Спасибо за Ваш заказ в магазине "{{companyName}}"!

Детали заказа №{{orderNumber}}:
- Наименование: {{productName}}
- Цена: {{productPrice}} тенге
- Дата заказа: {{orderDate}}

Статус заказа Вы можете отслеживать в приложении Kaspi.kz.

С уважением,
{{companyName}}`,

      // Шаблон для тестового сообщения
      testMessage:
`Это тестовое сообщение от системы Kaspi WhatsApp Integration для {{companyName}}.

Время отправки: {{timestamp}}
Тестовое значение: {{testValue}}

Если Вы получили это сообщение, значит система работает корректно.`
    };
  }

  /**
   * Компилирует шаблон, подставляя переменные
   * @param {string} templateName - Имя шаблона
   * @param {Object} variables - Объект с переменными для подстановки
   * @returns {string} - Скомпилированное сообщение
   */
  compile(templateName, variables) {
    try {
      // Проверяем существование шаблона
      if (!this.templates[templateName]) {
        logger.error(`Шаблон "${templateName}" не найден`);
        throw new Error(`Шаблон "${templateName}" не найден`);
      }

      // Получаем текст шаблона
      let message = this.templates[templateName];

      // Добавляем название компании в переменные, если оно еще не указано
      const allVariables = {
        ...variables,
        companyName: variables.companyName || this.companyName
      };

      // Подставляем переменные
      Object.keys(allVariables).forEach(key => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        message = message.replace(regex, allVariables[key] || '');
      });

      // Убираем оставшиеся неиспользованные переменные
      message = message.replace(/{{[^{}]+}}/g, '');

      return message;
    } catch (error) {
      logger.error(`Ошибка при компиляции шаблона "${templateName}":`, error);
      // Возвращаем простое резервное сообщение в случае ошибки
      return `Здравствуйте! Пожалуйста, свяжитесь с нами по поводу вашего заказа. С уважением, ТОО "TRABZON".`;
    }
  }

  /**
   * Создает сообщение для запроса отзыва
   * @param {Object} order - Объект заказа
   * @param {string} reviewLink - Ссылка для отзыва
   * @returns {string} - Текст сообщения
   */
  getReviewRequestMessage(order, reviewLink) {
    try {
      if (!order || !order.orderItems || order.orderItems.length === 0) {
        throw new Error('Неверный формат заказа');
      }

      // Получаем имя клиента (только имя без фамилии)
      const customerName = order.customerName.split(' ')[0];
      
      // Данные первого товара в заказе
      const firstItem = order.orderItems[0];

      // Компилируем шаблон
      return this.compile('reviewRequest', {
        customerName,
        productName: firstItem.name,
        reviewLink
      });
    } catch (error) {
      logger.error('Ошибка при создании сообщения запроса отзыва:', error);
      return this.getDefaultReviewRequestMessage(order, reviewLink);
    }
  }

  /**
   * Создает резервное сообщение для запроса отзыва в случае ошибки
   * @param {Object} order - Объект заказа
   * @param {string} reviewLink - Ссылка для отзыва
   * @returns {string} - Текст сообщения
   */
  getDefaultReviewRequestMessage(order, reviewLink) {
    try {
      const customerName = order?.customerName?.split(' ')[0] || 'Уважаемый клиент';
      return `Здравствуйте, ${customerName}! Благодарим за покупку в ${this.companyName}. Пожалуйста, оставьте отзыв: ${reviewLink}`;
    } catch (error) {
      logger.error('Ошибка при создании резервного сообщения:', error);
      return `Здравствуйте! Благодарим за покупку. Пожалуйста, оставьте отзыв: ${reviewLink || 'свяжитесь с нами для получения ссылки'}`;
    }
  }

  /**
   * Создает сообщение для уведомления о доставке
   * @param {Object} order - Объект заказа
   * @param {string} deliveryAddress - Адрес доставки
   * @returns {string} - Текст сообщения
   */
  getDeliveryNotificationMessage(order, deliveryAddress) {
    try {
      if (!order || !order.orderItems || order.orderItems.length === 0) {
        throw new Error('Неверный формат заказа');
      }

      // Получаем имя клиента (только имя без фамилии)
      const customerName = order.customerName.split(' ')[0];
      
      // Данные первого товара в заказе
      const firstItem = order.orderItems[0];

      // Компилируем шаблон
      return this.compile('deliveryNotification', {
        customerName,
        orderNumber: order.kaspiOrderId,
        productName: firstItem.name,
        deliveryAddress
      });
    } catch (error) {
      logger.error('Ошибка при создании сообщения о доставке:', error);
      return `Здравствуйте! Ваш заказ доставлен по адресу: ${deliveryAddress || 'указанному адресу'}. С уважением, ТОО "TRABZON".`;
    }
  }

  /**
   * Создает сообщение для подтверждения нового заказа
   * @param {Object} order - Объект заказа
   * @returns {string} - Текст сообщения
   */
  getNewOrderConfirmationMessage(order) {
    try {
      if (!order || !order.orderItems || order.orderItems.length === 0) {
        throw new Error('Неверный формат заказа');
      }

      // Получаем имя клиента (только имя без фамилии)
      const customerName = order.customerName.split(' ')[0];
      
      // Данные первого товара в заказе
      const firstItem = order.orderItems[0];
      
      // Форматируем дату
      const orderDate = new Date(order.orderDate).toLocaleDateString('ru-RU');

      // Компилируем шаблон
      return this.compile('newOrderConfirmation', {
        customerName,
        orderNumber: order.kaspiOrderId,
        productName: firstItem.name,
        productPrice: firstItem.totalPrice,
        orderDate
      });
    } catch (error) {
      logger.error('Ошибка при создании сообщения о новом заказе:', error);
      return `Здравствуйте! Спасибо за ваш заказ в ТОО "TRABZON". Вы можете отслеживать статус в приложении Kaspi.kz.`;
    }
  }

  /**
   * Создает тестовое сообщение
   * @param {string} testValue - Тестовое значение
   * @returns {string} - Текст сообщения
   */
  getTestMessage(testValue = 'test') {
    try {
      // Компилируем шаблон
      return this.compile('testMessage', {
        timestamp: new Date().toLocaleString('ru-RU'),
        testValue
      });
    } catch (error) {
      logger.error('Ошибка при создании тестового сообщения:', error);
      return `Это тестовое сообщение от системы Kaspi WhatsApp Integration. Время: ${new Date().toLocaleString('ru-RU')}`;
    }
  }

  /**
   * Добавляет новый шаблон сообщения
   * @param {string} templateName - Имя шаблона
   * @param {string} templateText - Текст шаблона
   * @returns {boolean} - Успешно ли добавлен шаблон
   */
  addTemplate(templateName, templateText) {
    try {
      if (!templateName || !templateText) {
        throw new Error('Необходимо указать имя и текст шаблона');
      }

      this.templates[templateName] = templateText;
      logger.info(`Добавлен новый шаблон "${templateName}"`);
      return true;
    } catch (error) {
      logger.error(`Ошибка при добавлении шаблона "${templateName}":`, error);
      return false;
    }
  }

  /**
   * Обновляет существующий шаблон
   * @param {string} templateName - Имя шаблона
   * @param {string} templateText - Новый текст шаблона
   * @returns {boolean} - Успешно ли обновлен шаблон
   */
  updateTemplate(templateName, templateText) {
    try {
      if (!this.templates[templateName]) {
        throw new Error(`Шаблон "${templateName}" не найден`);
      }

      this.templates[templateName] = templateText;
      logger.info(`Обновлен шаблон "${templateName}"`);
      return true;
    } catch (error) {
      logger.error(`Ошибка при обновлении шаблона "${templateName}":`, error);
      return false;
    }
  }

  /**
   * Удаляет шаблон
   * @param {string} templateName - Имя шаблона
   * @returns {boolean} - Успешно ли удален шаблон
   */
  deleteTemplate(templateName) {
    try {
      if (!this.templates[templateName]) {
        throw new Error(`Шаблон "${templateName}" не найден`);
      }

      delete this.templates[templateName];
      logger.info(`Удален шаблон "${templateName}"`);
      return true;
    } catch (error) {
      logger.error(`Ошибка при удалении шаблона "${templateName}":`, error);
      return false;
    }
  }

  /**
   * Получает список всех доступных шаблонов
   * @returns {Object} - Список шаблонов
   */
  getAllTemplates() {
    return { ...this.templates };
  }
}

module.exports = new MessageTemplates();