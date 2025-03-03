// services/kaspiService.js
const axios = require('axios');
const config = require('../config/config');
const logger = require('./loggerService');
const { Order } = require('../models');
const { Op } = require('sequelize');

class KaspiService {
  constructor() {
    this.apiUrl = config.kaspi.apiUrl;
    this.apiKey = config.kaspi.apiKey;
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'X-Auth-Token': this.apiKey,
        'Accept': 'application/vnd.api+json'
      },
      timeout: 15000, // 15 seconds timeout
    });
    
    // Максимальное количество дней для запроса (ограничение Kaspi API)
    this.maxDaysPerRequest = 14;
  }

  /**
   * Разбивает период на части не более maxDaysPerRequest дней
   * @param {Date} fromDate - Начальная дата периода
   * @param {Date} toDate - Конечная дата периода
   * @returns {Array} - Массив объектов {fromDate, toDate}
   */
  splitDateRange(fromDate, toDate) {
    const result = [];
    const oneDay = 24 * 60 * 60 * 1000; // миллисекунды в одном дне
    
    let currentFrom = new Date(fromDate);
    const finalTo = new Date(toDate);
    
    while (currentFrom < finalTo) {
      // Вычисляем конечную дату для текущего периода
      let currentTo = new Date(currentFrom.getTime() + (this.maxDaysPerRequest * oneDay));
      
      // Если вычисленная конечная дата выходит за пределы общего периода, используем общую конечную дату
      if (currentTo > finalTo) {
        currentTo = finalTo;
      }
      
      // Добавляем период в результат
      result.push({
        fromDate: new Date(currentFrom),
        toDate: new Date(currentTo)
      });
      
      // Переходим к следующему периоду
      currentFrom = new Date(currentTo.getTime() + oneDay);
    }
    
    return result;
  }

  /**
   * Получает новые заказы из Kaspi API
   * @param {Date} fromDate - Начальная дата для заказов
   * @param {Date} toDate - Конечная дата для заказов
   * @returns {Promise<Array>} - Массив заказов
   */
  async fetchNewOrders(fromDate, toDate) {
    try {
      const allOrders = [];
      
      // Определяем общий период в днях
      const totalDays = Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000));
      logger.info(`Запрашиваем заказы за период ${totalDays} дней`);
      
      // Разбиваем период на части, если он больше максимально допустимого
      const dateRanges = this.splitDateRange(fromDate, toDate);
      
      logger.info(`Период разбит на ${dateRanges.length} запросов`);
      
      // Выполняем запросы для каждого периода
      for (const range of dateRanges) {
        logger.info(`Запрашиваем заказы с ${range.fromDate.toISOString()} по ${range.toDate.toISOString()}`);
        
        // Конвертируем даты в миллисекунды для Kaspi API
        const fromDateMs = range.fromDate.getTime();
        const toDateMs = range.toDate.getTime();
        
        // Создаем параметры запроса согласно документации Kaspi API
        const params = {
          'page[number]': 0,
          'page[size]': 100,
          'filter[orders][creationDate][$ge]': fromDateMs,
          'filter[orders][creationDate][$le]': toDateMs,
          'filter[orders][status]': 'COMPLETED',
          'include[orders]': 'user'
        };

        const response = await this.axiosInstance.get('/api/v2/orders', { params });
        
        if (!response.data || !response.data.data) {
          logger.warn('Kaspi API вернул пустой ответ или неверный формат данных');
          continue;
        }

        const orders = response.data.data;
        logger.info(`Получено ${orders.length} заказов для периода`);
        
        // Добавляем заказы в общий массив
        allOrders.push(...orders);
        
        // Добавляем небольшую паузу между запросами, чтобы не перегрузить API
        if (dateRanges.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(`Всего получено ${allOrders.length} заказов из Kaspi API`);
      return allOrders;
    } catch (error) {
      logger.error('Ошибка при получении заказов из Kaspi API:', error);
      throw new Error(`Ошибка при получении заказов из Kaspi: ${error.message}`);
    }
  }

  /**
   * Получает детали заказа по ID
   * @param {string} orderId - ID заказа в Kaspi
   * @returns {Promise<Object>} - Детали заказа
   */
  async getOrderDetails(orderId) {
    try {
      const response = await this.axiosInstance.get(`/api/v2/orders/${orderId}`);
      
      if (!response.data || !response.data.data) {
        logger.warn(`Kaspi API вернул пустой ответ для заказа ${orderId}`);
        return null;
      }

      logger.info(`Успешно получены детали для заказа ${orderId}`);
      return response.data.data;
    } catch (error) {
      logger.error(`Ошибка при получении деталей заказа ${orderId}:`, error);
      throw new Error(`Ошибка при получении деталей заказа: ${error.message}`);
    }
  }

  /**
   * Получает информацию о товарах в заказе
   * @param {string} orderId - ID заказа в Kaspi
   * @returns {Promise<Array>} - Массив товаров в заказе
   */
  async getOrderEntries(orderId) {
    try {
      const response = await this.axiosInstance.get(`/api/v2/orders/${orderId}/entries`);
      
      if (!response.data || !response.data.data) {
        logger.warn(`Kaspi API вернул пустой ответ для товаров заказа ${orderId}`);
        return [];
      }

      logger.info(`Успешно получены товары для заказа ${orderId}`);
      return response.data.data;
    } catch (error) {
      logger.error(`Ошибка при получении товаров для заказа ${orderId}:`, error);
      throw new Error(`Ошибка при получении товаров заказа: ${error.message}`);
    }
  }

  /**
   * Получает детальную информацию о товаре
   * @param {string} productId - ID товара в Kaspi
   * @returns {Promise<Object>} - Информация о товаре
   */
  async getProductDetails(productId) {
    try {
      const response = await this.axiosInstance.get(`/api/v2/masterproducts/${productId}`);
      
      if (!response.data || !response.data.data) {
        logger.warn(`Kaspi API вернул пустой ответ для товара ${productId}`);
        return null;
      }

      logger.info(`Успешно получены детали для товара ${productId}`);
      return response.data.data;
    } catch (error) {
      logger.error(`Ошибка при получении деталей товара ${productId}:`, error);
      throw new Error(`Ошибка при получении деталей товара: ${error.message}`);
    }
  }

  /**
   * Обрабатывает и сохраняет новые заказы в базу данных
   * @param {Array} kaspiOrders - Массив заказов из Kaspi API
   * @returns {Promise<Array>} - Массив сохраненных объектов заказов
   */
  async processOrders(kaspiOrders) {
    try {
      const savedOrders = [];

      for (const kaspiOrder of kaspiOrders) {
        // Проверяем, существует ли заказ уже в базе
        const existingOrder = await Order.findOne({
          where: { kaspiOrderId: kaspiOrder.id },
        });

        if (!existingOrder) {
          // Получаем детали заказа, товары и информацию о клиенте
          const orderEntries = await this.getOrderEntries(kaspiOrder.id);
          
          // Подготавливаем данные о товарах
          const orderItems = [];
          for (const entry of orderEntries) {
            const productDetails = await this.getProductDetails(entry.relationships.product.data.id);
            
            orderItems.push({
              entryId: entry.id,
              productId: entry.relationships.product.data.id,
              name: productDetails.attributes.name,
              code: productDetails.attributes.code,
              quantity: entry.attributes.quantity,
              unitPrice: entry.attributes.basePrice,
              totalPrice: entry.attributes.totalPrice
            });
          }

          // Форматируем данные о клиенте
          const customer = kaspiOrder.attributes.customer;
          
          // Создаем объект заказа для сохранения в базу
          const orderData = {
            kaspiOrderId: kaspiOrder.id,
            orderDate: new Date(kaspiOrder.attributes.creationDate),
            customerPhone: customer.cellPhone,
            customerName: `${customer.firstName} ${customer.lastName || ''}`.trim(),
            orderStatus: 'completed', // Мы получаем только завершенные заказы
            orderAmount: kaspiOrder.attributes.totalPrice,
            orderItems: orderItems,
            notificationStatus: 'pending',
            createdAt: new Date(),
            updatedAt: new Date()
          };

          // Сохраняем заказ в базу данных
          const savedOrder = await Order.create(orderData);
          savedOrders.push(savedOrder);
          
          logger.info(`Заказ ${kaspiOrder.id} успешно сохранен в базе данных`);
        } else {
          logger.info(`Заказ ${kaspiOrder.id} уже существует в базе данных`);
        }
      }

      logger.info(`Всего сохранено ${savedOrders.length} новых заказов`);
      return savedOrders;
    } catch (error) {
      logger.error('Ошибка при обработке и сохранении заказов:', error);
      throw new Error(`Ошибка при обработке заказов: ${error.message}`);
    }
  }

  /**
   * Формирует ссылку для отзыва на товар
   * @param {string} productCode - Код товара в Kaspi
   * @param {string} orderCode - Код заказа
   * @param {number} rating - Рейтинг (по умолчанию 5)
   * @returns {string} - URL для написания отзыва
   */
  generateReviewLink(productCode, orderCode, rating = 5) {
    return `https://kaspi.kz/shop/review/productreview?productCode=${productCode}&orderCode=${orderCode}&rating=${rating}`;
  }

  /**
   * Получает заказы, готовые для отправки уведомлений о написании отзыва
   * @param {number} limit - Ограничение количества заказов
   * @returns {Promise<Array>} - Массив заказов
   */
  async getOrdersForReviewNotification(limit = 50) {
    try {
      // Находим заказы, которые завершены и еще не отправлены уведомления
      const orders = await Order.findAll({
        where: {
          orderStatus: 'completed',
          notificationStatus: 'pending'
        },
        limit: limit,
        order: [['orderDate', 'ASC']]
      });

      logger.info(`Найдено ${orders.length} заказов для отправки уведомлений о написании отзыва`);
      return orders;
    } catch (error) {
      logger.error('Ошибка при получении заказов для отправки уведомлений:', error);
      throw new Error(`Ошибка при получении заказов для уведомлений: ${error.message}`);
    }
  }
  
  /**
   * Обновляет статус заказа в Kaspi
   * @param {string} kaspiOrderId - ID заказа в Kaspi
   * @param {string} status - Новый статус
   * @returns {Promise<Object>} - Результат обновления
   */
  async updateOrderStatus(kaspiOrderId, status) {
    try {
      // Проверяем, что статус валиден
      const validStatuses = ['NEW', 'PROCESSING', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
      
      if (!validStatuses.includes(status)) {
        throw new Error(`Недопустимый статус. Допустимые значения: ${validStatuses.join(', ')}`);
      }
      
      // Формируем данные для запроса
      const payload = {
        data: {
          type: 'orders',
          id: kaspiOrderId,
          attributes: {
            status: status
          }
        }
      };
      
      // Отправляем запрос на обновление статуса
      const response = await this.axiosInstance.patch(`/api/v2/orders/${kaspiOrderId}`, payload);
      
      logger.info(`Успешно обновлен статус заказа ${kaspiOrderId} на ${status}`);
      return response.data;
    } catch (error) {
      logger.error(`Ошибка при обновлении статуса заказа ${kaspiOrderId}:`, error);
      throw new Error(`Ошибка при обновлении статуса заказа: ${error.message}`);
    }
  }
}

module.exports = new KaspiService();