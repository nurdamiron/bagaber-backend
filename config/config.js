// config/config.js
const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  database: {
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql', // Предполагаем, что используется MySQL
    ssl: process.env.DB_SSL === 'true'
  },
  kaspi: {
    apiUrl: process.env.KASPI_API_URL,
    apiKey: process.env.KASPI_API_KEY
  },
  whatsapp: {
    type: 'cloud', // Указываем тип API: 'cloud' или 'local'
    cloudApi: {
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v17.0',
      phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
      templateNamespace: process.env.WHATSAPP_TEMPLATE_NAMESPACE || null
    },
    localApi: {
      apiUrl: process.env.WHATSAPP_API_URL,
      apiKey: process.env.WHATSAPP_API_KEY
    }
  }
};
