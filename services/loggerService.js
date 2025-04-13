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

const metrics = {
  recordApiCall: (source, endpoint, success, duration) => {
    logger.info(`API Call [${source}]: ${endpoint} | Success: ${success} | Duration: ${duration}ms`);
  },
  
  recordDbQuery: (query, success, duration) => {
    logger.debug(`DB Query: ${query} | Success: ${success} | Duration: ${duration}ms`);
  },
  
  recordExternalCall: (service, endpoint, success, duration) => {
    logger.info(`External Call [${service}]: ${endpoint} | Success: ${success} | Duration: ${duration}ms`);
  }
};


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
  },
  // Add metrics property
  metrics
};
