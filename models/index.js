// models/index.js
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');
const Sequelize = require('sequelize');
const logger = require('../services/loggerService');

// Configure global date handling options to prevent datetime errors
// This fixes the "Data truncation: Incorrect datetime value" issue
sequelize.options.dialectOptions = {
  ...sequelize.options.dialectOptions,
  dateStrings: true,
  typeCast: function (field, next) {
    // For datetime and timestamp fields, return as string
    if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
      return field.string();
    }
    return next();
  }
};

const db = {};
const basename = path.basename(__filename);

// Log the model loading process for better debugging
logger.info('Loading database models...');

// Load all model files from current directory
fs.readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    try {
      const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
      logger.info(`Loaded model: ${model.name}`);
    } catch (error) {
      logger.error(`Error loading model from file ${file}:`, error);
    }
  });

// Set up model associations if they exist
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    try {
      db[modelName].associate(db);
      logger.info(`Set up associations for model: ${modelName}`);
    } catch (error) {
      logger.error(`Error setting up associations for model ${modelName}:`, error);
    }
  }
});

// Add sequelize instances to the exported object
db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Add a simple check method for database connectivity
db.checkConnection = async () => {
  try {
    await sequelize.authenticate();
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error);
    return false;
  }
};

logger.info('Database models loaded successfully');
module.exports = db;