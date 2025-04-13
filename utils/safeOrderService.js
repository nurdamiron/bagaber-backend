/**
 * Safe Order Service 
 * 
 * This utility provides safe methods for interacting with the Order model,
 * handling errors and providing fallbacks to prevent application crashes.
 */

const logger = require('../services/loggerService');
let Order = null;

try {
  // Try to import the Order model
  const models = require('../models');
  Order = models.Order;
} catch (error) {
  logger.error('Error importing Order model in safeOrderService:', error);
}

/**
 * Safely find orders with error handling
 * @param {Object} options - Sequelize query options
 * @returns {Promise<Array>} Array of orders or empty array on error
 */
async function findOrders(options = {}) {
  try {
    if (!Order) {
      logger.error('Order model is not available in safeOrderService.findOrders');
      return [];
    }
    
    return await Order.findAll(options);
  } catch (error) {
    logger.error('Error in safeOrderService.findOrders:', error);
    return [];
  }
}

/**
 * Safely find a single order by ID
 * @param {number|string} id - Order ID 
 * @returns {Promise<Object|null>} Order object or null on error
 */
async function findOrderById(id) {
  try {
    if (!Order) {
      logger.error('Order model is not available in safeOrderService.findOrderById');
      return null;
    }
    
    return await Order.findByPk(id);
  } catch (error) {
    logger.error(`Error in safeOrderService.findOrderById for ID ${id}:`, error);
    return null;
  }
}

/**
 * Safely find an order by Kaspi order ID
 * @param {string} kaspiOrderId - Kaspi order ID
 * @returns {Promise<Object|null>} Order object or null on error
 */
async function findOrderByKaspiId(kaspiOrderId) {
  try {
    if (!Order) {
      logger.error('Order model is not available in safeOrderService.findOrderByKaspiId');
      return null;
    }
    
    return await Order.findOne({
      where: { kaspiOrderId }
    });
  } catch (error) {
    logger.error(`Error in safeOrderService.findOrderByKaspiId for Kaspi ID ${kaspiOrderId}:`, error);
    return null;
  }
}

/**
 * Safely count orders with error handling
 * @param {Object} options - Sequelize query options
 * @returns {Promise<number>} Count of orders or 0 on error
 */
async function countOrders(options = {}) {
  try {
    if (!Order) {
      logger.error('Order model is not available in safeOrderService.countOrders');
      return 0;
    }
    
    return await Order.count(options);
  } catch (error) {
    logger.error('Error in safeOrderService.countOrders:', error);
    return 0;
  }
}

/**
 * Safely create a new order
 * @param {Object} orderData - Order data to create
 * @returns {Promise<Object|null>} Created order or null on error
 */
async function createOrder(orderData) {
  try {
    if (!Order) {
      logger.error('Order model is not available in safeOrderService.createOrder');
      return null;
    }
    
    return await Order.create(orderData);
  } catch (error) {
    logger.error('Error in safeOrderService.createOrder:', error);
    return null;
  }
}

/**
 * Safely update an order
 * @param {number|string} id - Order ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object|null>} Updated order or null on error
 */
async function updateOrder(id, updateData) {
  try {
    if (!Order) {
      logger.error('Order model is not available in safeOrderService.updateOrder');
      return null;
    }
    
    const order = await Order.findByPk(id);
    if (!order) {
      logger.warn(`Order not found for ID ${id} in safeOrderService.updateOrder`);
      return null;
    }
    
    // Update fields
    Object.keys(updateData).forEach(key => {
      order[key] = updateData[key];
    });
    
    await order.save();
    return order;
  } catch (error) {
    logger.error(`Error in safeOrderService.updateOrder for ID ${id}:`, error);
    return null;
  }
}

/**
 * Safely get notification statistics
 * @returns {Promise<Object>} Notification statistics
 */
async function getNotificationStats() {
  try {
    if (!Order) {
      logger.error('Order model is not available in safeOrderService.getNotificationStats');
      return {
        total: 0,
        pending: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0
      };
    }
    
    const total = await Order.count();
    const pending = await Order.count({ where: { notificationStatus: 'pending' } });
    const sent = await Order.count({ where: { notificationStatus: 'sent' } });
    const delivered = await Order.count({ where: { notificationStatus: 'delivered' } });
    const read = await Order.count({ where: { notificationStatus: 'read' } });
    const failed = await Order.count({ where: { notificationStatus: 'failed' } });
    
    return {
      total,
      pending,
      sent,
      delivered,
      read,
      failed
    };
  } catch (error) {
    logger.error('Error in safeOrderService.getNotificationStats:', error);
    return {
      total: 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0
    };
  }
}

module.exports = {
  findOrders,
  findOrderById,
  findOrderByKaspiId,
  countOrders,
  createOrder,
  updateOrder,
  getNotificationStats
};