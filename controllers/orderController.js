// controllers/orderController.js

const { Order } = require('../models');
const whatsappService = require('../services/whatsappService');
const { ApiError } = require('../middleware/errorHandler');

// Получение списка всех заказов
exports.getOrders = async (req, res, next) => {
  try {
    const orders = await Order.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({
      success: true,
      count: orders.length,
      data: orders
    });
  } catch (error) {
    next(error);
  }
};

// Получение заказа по ID
exports.getOrderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id);
    if (!order) {
      return next(new ApiError(404, 'Заказ не найден'));
    }
    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// Обновление заказа
exports.updateOrder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { orderStatus, notificationStatus } = req.body;
    
    const order = await Order.findByPk(id);
    if (!order) {
      return next(new ApiError(404, 'Заказ не найден'));
    }
    
    if (orderStatus) {
      order.orderStatus = orderStatus;
    }
    if (notificationStatus) {
      order.notificationStatus = notificationStatus;
    }
    
    await order.save();
    
    res.status(200).json({
      success: true,
      message: 'Заказ успешно обновлён',
      data: order
    });
  } catch (error) {
    next(error);
  }
};

// Отправка уведомления о запросе отзыва
exports.sendNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const order = await Order.findByPk(id);
    if (!order) {
      return next(new ApiError(404, 'Заказ не найден'));
    }
    
    // Отправляем запрос отзыва через WhatsApp API
    const result = await whatsappService.sendReviewRequest(order);
    
    // Обновляем статус уведомления
    order.notificationStatus = 'sent';
    order.notificationSentAt = new Date();
    await order.save();
    
    res.status(200).json({
      success: true,
      message: 'Уведомление успешно отправлено',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// Получение статистики по заказам
exports.getOrderStats = async (req, res, next) => {
  try {
    const totalCount = await Order.count();
    const pendingCount = await Order.count({ where: { notificationStatus: 'pending' } });
    const sentCount = await Order.count({ where: { notificationStatus: 'sent' } });
    const deliveredCount = await Order.count({ where: { notificationStatus: 'delivered' } });
    const readCount = await Order.count({ where: { notificationStatus: 'read' } });
    const failedCount = await Order.count({ where: { notificationStatus: 'failed' } });
    
    res.status(200).json({
      success: true,
      data: {
        total: totalCount,
        pending: pendingCount,
        sent: sentCount,
        delivered: deliveredCount,
        read: readCount,
        failed: failedCount
      }
    });
  } catch (error) {
    next(error);
  }
};
