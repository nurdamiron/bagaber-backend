// controllers/kaspiController.js
const kaspiService = require('../services/kaspiService');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../services/loggerService');

// @desc    Fetch new orders from Kaspi API
// @route   GET /api/kaspi/fetch-orders
// @access  Private/Admin
const fetchOrders = async (req, res, next) => {
  try {
    const { days = 1, startDate, endDate } = req.query;
    
    let fromDate, toDate;
    
    // Определяем диапазон дат на основе параметров запроса
    if (startDate && endDate) {
      // Если указаны обе даты, используем их
      fromDate = new Date(startDate);
      toDate = new Date(endDate);
      
      // Проверяем корректность дат
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return next(new ApiError(400, 'Некорректный формат дат. Используйте формат ISO (например, 2023-08-15)'));
      }
      
      // Проверяем, что начальная дата меньше конечной
      if (fromDate >= toDate) {
        return next(new ApiError(400, 'Начальная дата должна быть меньше конечной'));
      }
    } else {
      // Если даты не указаны, рассчитываем по количеству дней
      toDate = new Date(); // Текущая дата
      fromDate = new Date(toDate.getTime() - parseInt(days) * 24 * 60 * 60 * 1000);
    }
    
    logger.info(`Запрос заказов с ${fromDate.toISOString()} по ${toDate.toISOString()}`);
    
    // Проверяем, не превышает ли диапазон максимально допустимый (на всякий случай)
    const maxDays = 100; // Максимальное количество дней для всех запросов
    const requestedDays = Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000));
    
    if (requestedDays > maxDays) {
      return next(new ApiError(400, `Слишком большой диапазон дат (${requestedDays} дней). Максимум: ${maxDays} дней`));
    }
    
    // Fetch orders from Kaspi
    const orders = await kaspiService.fetchNewOrders(fromDate, toDate);
    
    // Process and save orders
    const processedOrders = await kaspiService.processOrders(orders);
    
    res.status(200).json({
      success: true,
      message: `Успешно получено и обработано ${processedOrders.length} новых заказов`,
      data: {
        totalFetched: orders.length,
        totalProcessed: processedOrders.length,
        period: {
          from: fromDate.toISOString(),
          to: toDate.toISOString(),
          days: requestedDays
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get order details from Kaspi
// @route   GET /api/kaspi/orders/:kaspiOrderId
// @access  Private
const getOrderDetails = async (req, res, next) => {
  try {
    const { kaspiOrderId } = req.params;
    
    if (!kaspiOrderId) {
      return next(new ApiError(400, 'Kaspi order ID is required'));
    }
    
    const orderDetails = await kaspiService.getOrderDetails(kaspiOrderId);
    
    if (!orderDetails) {
      return next(new ApiError(404, `Заказ с ID ${kaspiOrderId} не найден`));
    }
    
    // Получаем товары заказа
    const orderEntries = await kaspiService.getOrderEntries(kaspiOrderId);
    
    // Форматируем данные для ответа
    const formattedResponse = {
      id: orderDetails.id,
      creationDate: new Date(orderDetails.attributes.creationDate).toISOString(),
      totalPrice: orderDetails.attributes.totalPrice,
      status: orderDetails.attributes.status,
      customer: orderDetails.attributes.customer,
      entries: orderEntries.map(entry => ({
        id: entry.id,
        productId: entry.relationships.product.data.id,
        quantity: entry.attributes.quantity,
        basePrice: entry.attributes.basePrice,
        totalPrice: entry.attributes.totalPrice
      }))
    };
    
    res.status(200).json({
      success: true,
      data: formattedResponse
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update order status in Kaspi
// @route   PUT /api/kaspi/orders/:kaspiOrderId/status
// @access  Private/Admin
const updateOrderStatus = async (req, res, next) => {
  try {
    const { kaspiOrderId } = req.params;
    const { status } = req.body;
    
    if (!kaspiOrderId) {
      return next(new ApiError(400, 'Kaspi order ID is required'));
    }
    
    if (!status) {
      return next(new ApiError(400, 'Status is required'));
    }
    
    // Valid status values (check with actual Kaspi API documentation)
    const validStatuses = ['NEW', 'PROCESSING', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
    
    if (!validStatuses.includes(status.toUpperCase())) {
      return next(new ApiError(400, `Invalid status. Valid values are: ${validStatuses.join(', ')}`));
    }
    
    const result = await kaspiService.updateOrderStatus(kaspiOrderId, status.toUpperCase());
    
    res.status(200).json({
      success: true,
      message: `Order status updated to ${status}`,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get product details from Kaspi
// @route   GET /api/kaspi/products/:productId
// @access  Private
const getProductDetails = async (req, res, next) => {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      return next(new ApiError(400, 'Product ID is required'));
    }
    
    const productDetails = await kaspiService.getProductDetails(productId);
    
    if (!productDetails) {
      return next(new ApiError(404, `Товар с ID ${productId} не найден`));
    }
    
    res.status(200).json({
      success: true,
      data: productDetails
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate review link for order
// @route   GET /api/kaspi/orders/:kaspiOrderId/review-link
// @access  Private
const generateReviewLink = async (req, res, next) => {
  try {
    const { kaspiOrderId } = req.params;
    const { productCode, rating = 5 } = req.query;
    
    if (!kaspiOrderId) {
      return next(new ApiError(400, 'Kaspi order ID is required'));
    }
    
    if (!productCode) {
      return next(new ApiError(400, 'Product code is required'));
    }
    
    // Извлекаем код заказа (первая часть ID до дефиса)
    const orderCode = kaspiOrderId.split('-')[0] || kaspiOrderId;
    
    // Генерируем ссылку для отзыва
    const reviewLink = kaspiService.generateReviewLink(productCode, orderCode, rating);
    
    res.status(200).json({
      success: true,
      data: {
        reviewLink,
        orderCode,
        productCode,
        rating
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  fetchOrders,
  getOrderDetails,
  updateOrderStatus,
  getProductDetails,
  generateReviewLink
};