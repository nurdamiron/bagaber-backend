// middleware/errorHandler.js

// Класс для создания ошибок с указанным статусом
class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      // Фиксируем стек вызовов для отладки
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  // Middleware для обработки ошибок во всём приложении
  const errorHandler = (err, req, res, next) => {
    // Если статус ошибки не задан, используем 500 (Internal Server Error)
    const statusCode = err.statusCode || 500;
    const response = {
      success: false,
      message: err.message || 'Внутренняя ошибка сервера'
    };
  
    // При необходимости можно добавить логирование ошибки здесь
  
    res.status(statusCode).json(response);
  };
  
  module.exports = { ApiError, errorHandler };
  