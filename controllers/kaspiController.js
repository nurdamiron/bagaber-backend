// controllers/kaspiController.js
const kaspiService = require('../services/kaspiService');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../services/loggerService');

// @desc    Fetch new orders from Kaspi API
// @route   GET /api/kaspi/fetch-orders
// @access  Private/Admin
const fetchOrders = async (req, res, next) => {
  try {
    // Log the incoming request details
    logger.info(`Fetch Orders Request - Query params: ${JSON.stringify(req.query)}`);
    
    // Extract parameters from the request
    const { days = 1, startDate, endDate } = req.query;
    
    let fromDate, toDate;
    
    // Determine date range based on parameters
    if (startDate && endDate) {
      // If specific dates are provided, use them
      fromDate = new Date(startDate);
      toDate = new Date(endDate);
      
      // Validate dates
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        logger.warn(`Invalid date format: startDate=${startDate}, endDate=${endDate}`);
        return next(new ApiError(400, 'Некорректный формат дат. Используйте формат ISO (например, 2023-08-15)'));
      }
      
      if (fromDate >= toDate) {
        logger.warn(`Invalid date range: fromDate=${fromDate} >= toDate=${toDate}`);
        return next(new ApiError(400, 'Начальная дата должна быть меньше конечной'));
      }
      
      logger.info(`Using provided date range: ${fromDate.toISOString()} to ${toDate.toISOString()}`);
    } else {
      // Calculate dates based on the "days" parameter
      toDate = new Date(); // Current date
      
      // Parse days parameter safely
      const daysNum = parseInt(days);
      if (isNaN(daysNum) || daysNum <= 0) {
        logger.warn(`Invalid days parameter: ${days}`);
        return next(new ApiError(400, 'Параметр "days" должен быть положительным числом'));
      }
      
      fromDate = new Date(toDate.getTime() - daysNum * 24 * 60 * 60 * 1000);
      logger.info(`Using date range from last ${daysNum} days: ${fromDate.toISOString()} to ${toDate.toISOString()}`);
    }
    
    // Check if the date range is reasonable
    const maxDays = 100; // Maximum allowed days range
    const requestedDays = Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000));
    
    if (requestedDays > maxDays) {
      logger.warn(`Date range too large: ${requestedDays} days (max: ${maxDays} days)`);
      return next(new ApiError(400, `Слишком большой диапазон дат (${requestedDays} дней). Максимум: ${maxDays} дней`));
    }
    
    // Call Kaspi service to fetch orders
    logger.info(`Calling kaspiService.fetchNewOrders with date range: ${fromDate} to ${toDate}`);
    const orders = await kaspiService.fetchNewOrders(fromDate, toDate);
    
    // Check if orders array is valid
    if (!Array.isArray(orders)) {
      logger.error('kaspiService.fetchNewOrders returned non-array data', { orders });
      return next(new ApiError(500, 'Получены некорректные данные от Kaspi API'));
    }
    
    logger.info(`Successfully fetched ${orders.length} orders from Kaspi API`);
    
    // Process and save orders
    let processedOrders = [];
    try {
      processedOrders = await kaspiService.processOrders(orders);
      logger.info(`Successfully processed ${processedOrders.length} orders`);
    } catch (processError) {
      logger.error('Error processing orders:', processError);
      // Continue execution even if processing fails
      // We'll still return the fetched orders count
    }
    
    // Respond with success
    res.status(200).json({
      success: true,
      message: `Успешно получено ${orders.length} заказов, обработано ${processedOrders.length}`,
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
    logger.error('Error in fetchOrders controller:', error);
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