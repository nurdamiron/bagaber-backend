// config/database.js
const { Sequelize } = require('sequelize');
const config = require('./config');
const logger = require('../services/loggerService');

// Создаем экземпляр Sequelize для подключения к RDS
const sequelize = new Sequelize(
  config.database.name,
  config.database.user,
  config.database.password,
  {
    host: config.database.host,
    dialect: config.database.dialect,
    port: config.database.port,
    logging: msg => logger.debug(msg),
    define: {
      timestamps: true,
      underscored: true,
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: {
      // Дополнительные опции для подключения к RDS
      ssl: config.database.ssl ? {
        require: true,
        rejectUnauthorized: false // Использовать с осторожностью в продакшене
      } : false,
      connectTimeout: 60000 // Увеличенный таймаут подключения для RDS
    }
  }
);

// Функция для проверки подключения
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('Успешное подключение к базе данных RDS');
    return true;
  } catch (error) {
    logger.error('Ошибка подключения к базе данных RDS:', error);
    return false;
  }
};

// Функция для синхронизации моделей с базой данных
// ВНИМАНИЕ: в продакшене использовать с осторожностью!
const syncModels = async (force = false) => {
  try {
    await sequelize.sync({ force });
    logger.info(`Модели ${force ? 'принудительно ' : ''}синхронизированы с базой данных`);
    return true;
  } catch (error) {
    logger.error('Ошибка синхронизации моделей:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  testConnection,
  syncModels
};