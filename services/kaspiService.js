// services/kaspiService.js - Fixed version
const axios = require('axios');
const config = require('../config/config');
const logger = require('./loggerService');
const { Order } = require('../models');
const { Op } = require('sequelize');

class KaspiService {
  constructor() {
    // Initialize with default values
    this.apiUrl = config?.kaspi?.apiUrl || 'https://kaspi.kz/shop/api/v2';
    this.apiKey = config?.kaspi?.apiKey || '';
    
    // Initialize axios with better error handling
    this.axiosInstance = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/vnd.api+json',
        'X-Auth-Token': this.apiKey,
        'Accept': 'application/vnd.api+json'
      },
      timeout: 15000, // 15 seconds timeout
    });
    
    // Add response interceptor for better error handling
    this.axiosInstance.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          // The request was made and the server responded with a status code
          // that falls out of the range of 2xx
          logger.error(`Kaspi API error ${error.response.status}:`, 
            error.response.data || error.message);
        } else if (error.request) {
          // The request was made but no response was received
          logger.error('Kaspi API no response:', error.request);
        } else {
          // Something happened in setting up the request
          logger.error('Kaspi API request error:', error.message);
        }
        return Promise.reject(error);
      }
    );
    
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
    if (!fromDate || !toDate) {
      logger.warn('splitDateRange called with invalid dates', { fromDate, toDate });
      return [];
    }
    
    const result = [];
    const oneDay = 24 * 60 * 60 * 1000; // миллисекунды в одном дне
    
    try {
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
    } catch (error) {
      logger.error('Error in splitDateRange:', error);
      return [];
    }
  }

  /**
   * Получает новые заказы из Kaspi API
   * @param {Date} fromDate - Начальная дата для заказов
   * @param {Date} toDate - Конечная дата для заказов
   * @returns {Promise<Array>} - Массив заказов
   */
  async fetchNewOrders(fromDate, toDate) {
    try {
      // Validate input dates
      if (!fromDate || !toDate) {
        throw new Error('Both fromDate and toDate are required');
      }
      
      // Convert to proper Date objects if they're not already
      fromDate = new Date(fromDate);
      toDate = new Date(toDate);
      
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new Error('Invalid date format');
      }
      
      const allOrders = [];
      
      // Определяем общий период в днях
      const totalDays = Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000));
      logger.info(`Запрашиваем заказы за период ${totalDays} дней`);
      
      // Разбиваем период на части, если он больше максимально допустимого
      const dateRanges = this.splitDateRange(fromDate, toDate);
      
      if (dateRanges.length === 0) {
        throw new Error('Failed to split date range properly');
      }
      
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

        try {
          const response = await this.axiosInstance.get('/api/v2/orders', { params });
          
          if (response.data && response.data.data && Array.isArray(response.data.data)) {
            const orders = response.data.data;
            logger.info(`Получено ${orders.length} заказов для периода`);
            
            // Добавляем заказы в общий массив
            allOrders.push(...orders);
          } else {
            logger.warn('Kaspi API вернул пустой ответ или неверный формат данных');
          }
          
          // Добавляем небольшую паузу между запросами, чтобы не перегрузить API
          if (dateRanges.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          logger.error(`Ошибка при запросе заказов для периода ${range.fromDate.toISOString()} - ${range.toDate.toISOString()}:`, error);
          // Continue with other date ranges instead of failing completely
          continue;
        }
      }

      logger.info(`Всего получено ${allOrders.length} заказов из Kaspi API`);
      return allOrders;
    } catch (error) {
      logger.error('Ошибка при получении заказов из Kaspi API:', error);
      // Return empty array instead of throwing
      return [];
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
      
      // Check if kaspiOrders is an array
      if (!Array.isArray(kaspiOrders)) {
        logger.error('processOrders: kaspiOrders is not an array', typeof kaspiOrders);
        return savedOrders;
      }
      
      // Check if Order model is available
      if (!Order) {
        logger.error('Order model is not available');
        return savedOrders;
      }

      for (const kaspiOrder of kaspiOrders) {
        try {
          // Check if order has required data
          if (!kaspiOrder || !kaspiOrder.id || !kaspiOrder.attributes) {
            logger.warn('Invalid Kaspi order format, skipping', kaspiOrder?.id);
            continue;
          }
          
          // Проверяем, существует ли заказ уже в базе
          let existingOrder = null;
          try {
            existingOrder = await Order.findOne({
              where: { kaspiOrderId: kaspiOrder.id },
            });
          } catch (error) {
            logger.error(`Error checking for existing order ${kaspiOrder.id}:`, error);
            continue; // Skip this order and continue with others
          }

          if (!existingOrder) {
            // Get order entries (with error handling)
            let orderEntries = [];
            try {
              orderEntries = await this.getOrderEntries(kaspiOrder.id);
            } catch (entriesError) {
              logger.error(`Error getting entries for order ${kaspiOrder.id}:`, entriesError);
              // Continue with empty entries rather than skipping the order
            }
            
            // Prepare order items
            const orderItems = [];
            for (const entry of orderEntries) {
              try {
                if (!entry || !entry.relationships || !entry.relationships.product) {
                  logger.warn(`Invalid entry format for order ${kaspiOrder.id}`, entry);
                  continue;
                }
                
                let productDetails = null;
                try {
                  const productId = entry.relationships.product.data.id;
                  productDetails = await this.getProductDetails(productId);
                } catch (productError) {
                  logger.error(`Error getting product details for entry ${entry.id}:`, productError);
                  continue;
                }
                
                if (!productDetails) {
                  continue;
                }
                
                orderItems.push({
                  entryId: entry.id,
                  productId: entry.relationships.product.data.id,
                  name: productDetails.attributes?.name || 'Unknown Product',
                  code: productDetails.attributes?.code || '',
                  quantity: entry.attributes?.quantity || 1,
                  unitPrice: entry.attributes?.basePrice || 0,
                  totalPrice: entry.attributes?.totalPrice || 0
                });
              } catch (itemError) {
                logger.error(`Error processing item for order ${kaspiOrder.id}:`, itemError);
                // Continue with other items
              }
            }

            // Check if we have customer information
            if (!kaspiOrder.attributes.customer) {
              logger.warn(`Order ${kaspiOrder.id} missing customer information`);
              continue;
            }
            
            // Форматируем данные о клиенте
            const customer = kaspiOrder.attributes.customer;
            
            // Создаем объект заказа для сохранения в базу
            const orderData = {
              kaspiOrderId: kaspiOrder.id,
              orderDate: new Date(kaspiOrder.attributes.creationDate),
              customerPhone: customer.cellPhone || '',
              customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
              orderStatus: 'completed', // Мы получаем только завершенные заказы
              orderAmount: kaspiOrder.attributes.totalPrice || 0,
              orderItems: orderItems,
              notificationStatus: 'pending',
              createdAt: new Date(),
              updatedAt: new Date()
            };

            try {
              // Сохраняем заказ в базу данных
              const savedOrder = await Order.create(orderData);
              savedOrders.push(savedOrder);
              
              logger.info(`Заказ ${kaspiOrder.id} успешно сохранен в базе данных`);
            } catch (saveError) {
              logger.error(`Error saving order ${kaspiOrder.id}:`, saveError);
              // Continue with other orders
            }
          } else {
            logger.info(`Заказ ${kaspiOrder.id} уже существует в базе данных`);
          }
        } catch (orderError) {
          logger.error(`Error processing Kaspi order:`, orderError);
          // Continue with other orders
        }
      }

      logger.info(`Всего сохранено ${savedOrders.length} новых заказов`);
      return savedOrders;
    } catch (error) {
      logger.error('Ошибка при обработке и сохранении заказов:', error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Получает детали заказа по ID
   * @param {string} orderId - ID заказа в Kaspi
   * @returns {Promise<Object>} - Детали заказа
   */
  async getOrderDetails(orderId) {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      
      const response = await this.axiosInstance.get(`/api/v2/orders/${orderId}`);
      
      if (!response.data || !response.data.data) {
        logger.warn(`Kaspi API вернул пустой ответ для заказа ${orderId}`);
        return null;
      }

      logger.info(`Успешно получены детали для заказа ${orderId}`);
      return response.data.data;
    } catch (error) {
      logger.error(`Ошибка при получении деталей заказа ${orderId}:`, error);
      return null; // Return null instead of throwing
    }
  }

  /**
   * Получает информацию о товарах в заказе
   * @param {string} orderId - ID заказа в Kaspi
   * @returns {Promise<Array>} - Массив товаров в заказе
   */
  async getOrderEntries(orderId) {
    try {
      if (!orderId) {
        throw new Error('Order ID is required');
      }
      
      const response = await this.axiosInstance.get(`/api/v2/orders/${orderId}/entries`);
      
      if (!response.data || !response.data.data) {
        logger.warn(`Kaspi API вернул пустой ответ для товаров заказа ${orderId}`);
        return [];
      }

      logger.info(`Успешно получены товары для заказа ${orderId}`);
      return response.data.data;
    } catch (error) {
      logger.error(`Ошибка при получении товаров для заказа ${orderId}:`, error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Получает детальную информацию о товаре
   * @param {string} productId - ID товара в Kaspi
   * @returns {Promise<Object>} - Информация о товаре
   */
  async getProductDetails(productId) {
    try {
      if (!productId) {
        throw new Error('Product ID is required');
      }
      
      const response = await this.axiosInstance.get(`/api/v2/masterproducts/${productId}`);
      
      if (!response.data || !response.data.data) {
        logger.warn(`Kaspi API вернул пустой ответ для товара ${productId}`);
        return null;
      }

      logger.info(`Успешно получены детали для товара ${productId}`);
      return response.data.data;
    } catch (error) {
      logger.error(`Ошибка при получении деталей товара ${productId}:`, error);
      return null; // Return null instead of throwing
    }
  }

  /**
   * Получает заказы, готовые для отправки уведомлений о написании отзыва
   * @param {number} limit - Ограничение количества заказов
   * @returns {Promise<Array>} - Массив заказов
   */
  async getOrdersForReviewNotification(limit = 50) {
    try {
      // Check if Order model is available
      if (!Order) {
        logger.error('Order model is not available');
        return [];
      }
      
      // Validate limit
      if (isNaN(limit) || limit <= 0) {
        limit = 50;
      }
      
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
        logger.error('Error querying orders for notification:', error);
        return [];
      }
    } catch (error) {
      logger.error('Ошибка при получении заказов для отправки уведомлений:', error);
      return []; // Return empty array instead of throwing
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
    try {
      if (!productCode || !orderCode) {
        logger.warn('Missing required parameters for review link generation');
        return '#';
      }
      
      // Validate rating
      if (isNaN(rating) || rating < 1 || rating > 5) {
        rating = 5;
      }
      
      return `https://kaspi.kz/shop/review/productreview?productCode=${encodeURIComponent(productCode)}&orderCode=${encodeURIComponent(orderCode)}&rating=${rating}`;
    } catch (error) {
      logger.error('Error generating review link:', error);
      return '#'; // Return placeholder instead of throwing
    }
  }
}

module.exports = new KaspiService();