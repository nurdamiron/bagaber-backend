// utils/databaseFixUtil.js
const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');
const path = require('path');
const logger = require('../services/loggerService');
const config = require('../config/config');

/**
 * Utility class for fixing database issues and ensuring models are properly initialized
 */
class DatabaseFixUtil {
  constructor() {
    this.sequelize = null;
    this.models = {};
    this.initialized = false;
  }

  /**
   * Initialize a separate sequelize instance for diagnostics
   */
  async initializeDiagnosticConnection() {
    try {
      // Create a new sequelize instance
      this.sequelize = new Sequelize(
        config.database.name,
        config.database.user,
        config.database.password,
        {
          host: config.database.host,
          dialect: 'mysql',
          port: config.database.port,
          logging: msg => logger.debug(`[Diagnostic] ${msg}`),
          define: {
            timestamps: true,
            underscored: true,
          },
          dialectOptions: {
            ssl: config.database.ssl ? {
              require: true,
              rejectUnauthorized: false
            } : false,
            connectTimeout: 60000
          }
        }
      );

      // Test connection
      await this.sequelize.authenticate();
      logger.info('[Diagnostic] Successfully connected to database');
      
      this.initialized = true;
      return true;
    } catch (error) {
      logger.error('[Diagnostic] Database connection error:', error);
      return false;
    }
  }

  /**
   * Define models temporarily for diagnostic purposes
   */
  async defineModels() {
    if (!this.initialized) {
      await this.initializeDiagnosticConnection();
    }

    // Define User model
    this.models.User = this.sequelize.define('User', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      role: {
        type: DataTypes.STRING,
        defaultValue: 'user',
      },
    }, {
      tableName: 'users',
      timestamps: true,
      underscored: true,
    });

    // Define AllowedPhone model
    this.models.AllowedPhone = this.sequelize.define('AllowedPhone', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      phoneNumber: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: DataTypes.STRING,
        allowNull: true
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: true
      }
    }, {
      tableName: 'allowed_phones',
      timestamps: true,
      underscored: true
    });

    // Define Order model
    this.models.Order = this.sequelize.define('Order', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
      },
      kaspiOrderId: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      orderDate: {
        type: DataTypes.DATE,
        allowNull: false
      },
      customerPhone: {
        type: DataTypes.STRING,
        allowNull: false
      },
      customerName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      orderStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'new'
      },
      orderAmount: {
        type: DataTypes.FLOAT,
        allowNull: true
      },
      orderItems: {
        type: DataTypes.JSON,
        allowNull: true
      },
      notificationStatus: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'pending'
      },
      notificationSentAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      notificationError: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    }, {
      tableName: 'orders',
      timestamps: true,
      underscored: true
    });

    logger.info('[Diagnostic] Models defined for diagnostics');
    return this.models;
  }

  /**
   * Check if tables exist and create them if needed
   */
  async syncTables(force = false) {
    if (!this.initialized || Object.keys(this.models).length === 0) {
      await this.defineModels();
    }

    try {
      const results = {
        synced: [],
        errors: []
      };

      // Sync each model separately to better handle errors
      for (const [name, model] of Object.entries(this.models)) {
        try {
          await model.sync({ force });
          results.synced.push(name);
        } catch (error) {
          results.errors.push({
            model: name,
            error: error.message
          });
          logger.error(`[Diagnostic] Error syncing model ${name}:`, error);
        }
      }

      return results;
    } catch (error) {
      logger.error('[Diagnostic] Error syncing tables:', error);
      return {
        synced: [],
        errors: [{ model: 'general', error: error.message }]
      };
    }
  }

  /**
   * Check for missing database tables
   */
  async checkTables() {
    if (!this.initialized) {
      await this.initializeDiagnosticConnection();
    }

    try {
      const results = {
        tables: {},
        missing: []
      };

      // Get list of tables
      const query = 'SHOW TABLES';
      const [rows] = await this.sequelize.query(query);
      
      // Extract table names
      const tableNames = rows.map(row => Object.values(row)[0]);
      
      // Check if expected tables exist
      const expectedTables = ['users', 'allowed_phones', 'orders'];
      
      for (const table of expectedTables) {
        const exists = tableNames.includes(table);
        results.tables[table] = exists;
        
        if (!exists) {
          results.missing.push(table);
        }
      }
      
      return results;
    } catch (error) {
      logger.error('[Diagnostic] Error checking tables:', error);
      return {
        tables: {},
        missing: [],
        error: error.message
      };
    }
  }

  /**
   * Create a backup copy of models/index.js if there's an issue
   */
  async backupModelsIndex() {
    try {
      const indexPath = path.join(process.cwd(), 'models', 'index.js');
      const backupPath = path.join(process.cwd(), 'models', 'index.js.bak');
      
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, backupPath);
        return {
          success: true,
          backupPath
        };
      }
      
      return {
        success: false,
        error: 'index.js not found'
      };
    } catch (error) {
      logger.error('[Diagnostic] Error backing up models/index.js:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Fix models/index.js if there are issues
   */
  async fixModelsIndex() {
    try {
      // First create a backup
      await this.backupModelsIndex();
      
      const indexPath = path.join(process.cwd(), 'models', 'index.js');
      
      // Create a fixed version of models/index.js
      const fixedContent = `// models/index.js
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../config/database');
const Sequelize = require('sequelize');

const db = {};
const basename = path.basename(__filename);

// Read all model files in the directory
fs.readdirSync(__dirname)
  .filter(file => {
    return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
  })
  .forEach(file => {
    try {
      const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
    } catch (error) {
      console.error(\`Error loading model from file \${file}:\`, error);
    }
  });

// Set up associations between models
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    try {
      db[modelName].associate(db);
    } catch (error) {
      console.error(\`Error setting up associations for \${modelName}:\`, error);
    }
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;`;
      
      // Write the fixed content
      fs.writeFileSync(indexPath, fixedContent, 'utf8');
      
      return {
        success: true,
        message: 'models/index.js has been fixed'
      };
    } catch (error) {
      logger.error('[Diagnostic] Error fixing models/index.js:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new DatabaseFixUtil();