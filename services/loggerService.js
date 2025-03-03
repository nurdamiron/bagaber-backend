// services/loggerService.js

const { createLogger, format, transports } = require('winston');

// Настройка формата логирования
const logger = createLogger({
  // Уровень логирования можно задать через переменную окружения, по умолчанию 'info'
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(info => `${info.timestamp} [${info.level.toUpperCase()}]: ${info.message}`)
  ),
  transports: [
    // Вывод логов в консоль
    new transports.Console(),
    // Запись логов уровня "error" в файл
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Запись всех логов в общий файл
    new transports.File({ filename: 'logs/combined.log' })
  ]
});

module.exports = {
  debug: (msg) => logger.debug(msg),
  info: (msg) => logger.info(msg),
  warn: (msg) => logger.warn(msg),
  error: (msg, err) => {
    if (err) {
      logger.error(`${msg} - ${err.stack || err}`);
    } else {
      logger.error(msg);
    }
  }
};
