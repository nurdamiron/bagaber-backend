// models/AllowedPhone.js
module.exports = (sequelize, DataTypes) => {
    const AllowedPhone = sequelize.define('AllowedPhone', {
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
  
    return AllowedPhone;
  };