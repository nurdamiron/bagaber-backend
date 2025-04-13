// models/Order.js
// Enhanced version with proper JSON handling and error checking
module.exports = (sequelize, DataTypes) => {
    const Order = sequelize.define('Order', {
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
        allowNull: true,
        get() {
          // Handle JSON parsing safely
          const rawValue = this.getDataValue('orderItems');
          if (!rawValue) return [];
          
          try {
            if (typeof rawValue === 'string') {
              return JSON.parse(rawValue);
            }
            return rawValue;
          } catch (error) {
            console.error('Error parsing orderItems JSON:', error);
            return [];
          }
        },
        set(value) {
          // Handle JSON stringifying safely
          try {
            if (typeof value === 'string') {
              // If already a string, try to parse it to validate JSON
              JSON.parse(value);
              this.setDataValue('orderItems', value);
            } else {
              // Convert object to string
              this.setDataValue('orderItems', JSON.stringify(value));
            }
          } catch (error) {
            console.error('Error setting orderItems JSON:', error);
            // Set empty array as fallback
            this.setDataValue('orderItems', '[]');
          }
        }
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
      underscored: true,
      hooks: {
        // Sanitize data before saving
        beforeSave: (order, options) => {
          // Ensure orderItems is valid
          if (order.orderItems === null || order.orderItems === undefined) {
            order.orderItems = [];
          }
          
          // Ensure dates are valid
          if (order.orderDate && !(order.orderDate instanceof Date)) {
            try {
              order.orderDate = new Date(order.orderDate);
            } catch (error) {
              order.orderDate = new Date();
            }
          }
          
          if (order.notificationSentAt && !(order.notificationSentAt instanceof Date)) {
            try {
              order.notificationSentAt = new Date(order.notificationSentAt);
            } catch (error) {
              order.notificationSentAt = null;
            }
          }
        }
      }
    });
  
    // Instance method to safely get order items
    Order.prototype.getItems = function() {
      const items = this.orderItems;
      return Array.isArray(items) ? items : [];
    };
  
    // Static method to count orders with error handling
    Order.safeCount = async function(options = {}) {
      try {
        return await this.count(options);
      } catch (error) {
        console.error('Error counting orders:', error);
        return 0;
      }
    };
  
    // Static method to find orders with error handling
    Order.safeFindAll = async function(options = {}) {
      try {
        return await this.findAll(options);
      } catch (error) {
        console.error('Error finding orders:', error);
        return [];
      }
    };
  
    return Order;
  };