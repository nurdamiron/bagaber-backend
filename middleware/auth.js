// middleware/auth.js

const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');
const { User } = require('../models'); // Убедитесь, что модель User существует

/**
 * Middleware для проверки аутентификации.
 * Извлекает JWT из заголовка Authorization и декодирует его.
 */
const protect = async (req, res, next) => {
  try {
    let token;
    // JWT должен передаваться в заголовке: Authorization: Bearer <token>
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return next(new ApiError(401, 'Нет токена, авторизация не выполнена'));
    }
    // Декодируем токен
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Находим пользователя в базе данных (опционально, если требуется актуальные данные)
    const user = await User.findByPk(decoded.id);
    if (!user) {
      return next(new ApiError(401, 'Пользователь не найден, авторизация не выполнена'));
    }
    
    // Устанавливаем пользователя в объект запроса
    req.user = user;
    next();
  } catch (error) {
    return next(new ApiError(401, 'Ошибка авторизации: неверный или просроченный токен'));
  }
};

/**
 * Middleware для проверки прав доступа.
 * Принимает список разрешённых ролей и проверяет, что роль пользователя соответствует одному из них.
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Доступ запрещён: недостаточно прав'));
    }
    next();
  };
};

module.exports = { protect, authorize };
