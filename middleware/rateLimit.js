// middleware/rateLimit.js

const rateLimit = require('express-rate-limit');

// Ограничитель запросов для маршрутов аутентификации (например, регистрация и логин)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 100, // максимум 100 запросов с одного IP за указанный промежуток времени
  message: 'Слишком много запросов, попробуйте позже.'
});

// Ограничитель для WhatsApp маршрутов (чтобы не перегружать API)
const whatsappLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 30, // максимум 30 запросов с одного IP за минуту
  message: 'Слишком много запросов к WhatsApp API, попробуйте позже.'
});

module.exports = {
  authLimiter,
  whatsappLimiter
};
