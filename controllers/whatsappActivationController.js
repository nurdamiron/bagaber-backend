// controllers/whatsappActivationController.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const logger = require('../services/loggerService');
const { ApiError } = require('../middleware/errorHandler');

// Функция для сохранения сертификата в файл
const saveCertificate = (certificate) => {
  try {
    const certPath = process.env.WHATSAPP_CERT_PATH || path.join(__dirname, '../config/whatsapp_cert.txt');
    fs.writeFileSync(certPath, certificate, 'utf8');
    return certPath;
  } catch (error) {
    logger.error('Ошибка при сохранении сертификата WhatsApp:', error);
    throw new Error(`Не удалось сохранить сертификат: ${error.message}`);
  }
};

// @desc    Сохранение сертификата WhatsApp
// @route   POST /api/whatsapp/certificate
// @access  Private/Admin
const saveCertificateHandler = async (req, res, next) => {
  try {
    const { certificate } = req.body;
    
    if (!certificate) {
      return next(new ApiError(400, 'Сертификат не предоставлен'));
    }
    
    // Сохраняем сертификат в файл
    const certPath = saveCertificate(certificate);
    
    // Обновляем переменную окружения
    process.env.WHATSAPP_CERTIFICATE = certificate;
    
    res.status(200).json({
      success: true,
      message: 'Сертификат WhatsApp успешно сохранен',
      data: {
        certPath
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Регистрация номера WhatsApp (локальный API)
// @route   POST /api/whatsapp/register-local
// @access  Private/Admin
const registerWhatsAppLocalApi = async (req, res, next) => {
  try {
    const { phoneNumber, method = 'sms', pin } = req.body;
    
    if (!phoneNumber) {
      return next(new ApiError(400, 'Номер телефона обязателен'));
    }
    
    // Получаем сертификат
    let cert = process.env.WHATSAPP_CERTIFICATE;
    
    if (!cert) {
      const certPath = process.env.WHATSAPP_CERT_PATH || path.join(__dirname, '../config/whatsapp_cert.txt');
      if (fs.existsSync(certPath)) {
        cert = fs.readFileSync(certPath, 'utf8');
      } else {
        return next(new ApiError(400, 'Сертификат WhatsApp не найден. Сначала сохраните сертификат.'));
      }
    }
    
    // Форматируем номер телефона
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    let cc = '7'; // Код страны Казахстан по умолчанию
    let phone_number = formattedPhone;
    
    // Если номер начинается с кода страны, отделяем его
    if (formattedPhone.startsWith('7') && formattedPhone.length > 10) {
      phone_number = formattedPhone.substring(1);
    }
    
    // Создаем данные для запроса
    const requestData = {
      cc,
      phone_number,
      method, // 'sms' или 'voice'
      cert
    };
    
    // Если указан PIN-код (для двухэтапной верификации), добавляем его
    if (pin) {
      requestData.pin = pin;
    }
    
    // Создаем клиент для локального API
    const apiUrl = config.whatsapp.localApi.apiUrl;
    const apiKey = config.whatsapp.localApi.apiKey;
    
    const axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 15000
    });
    
    // Делаем запрос к локальному API
    logger.info(`Отправка запроса на регистрацию WhatsApp номера ${phoneNumber} через локальный API`);
    
    try {
      const response = await axiosInstance.post('/v1/account', requestData);
      
      res.status(200).json({
        success: true,
        message: `Запрос на регистрацию WhatsApp номера успешно отправлен. Ожидайте код верификации через ${method}`,
        data: response.data
      });
    } catch (apiError) {
      // Проверяем, связана ли ошибка с прекращением поддержки локального API
      if (apiError.response?.data?.code === 1005 && 
          apiError.response?.data?.details?.includes('biz_link_on_prem_reg_blocked')) {
        
        logger.error('Ошибка: локальный API больше не поддерживается');
        
        return next(new ApiError(
          400, 
          'Локальный API WhatsApp больше не поддерживается. Пожалуйста, используйте Cloud API.'
        ));
      }
      
      return next(new ApiError(
        apiError.response?.status || 500,
        apiError.response?.data?.message || apiError.message
      ));
    }
    
  } catch (error) {
    next(error);
  }
};

// @desc    Регистрация номера WhatsApp (Cloud API)
// @route   POST /api/whatsapp/register-cloud
// @access  Private/Admin
const registerWhatsAppCloudApi = async (req, res, next) => {
  try {
    const { phoneNumberId, accessToken } = req.body;
    
    if (!phoneNumberId || !accessToken) {
      return next(new ApiError(400, 'ID номера телефона и токен доступа обязательны'));
    }
    
    // Обновляем переменные окружения
    process.env.WHATSAPP_PHONE_NUMBER_ID = phoneNumberId;
    process.env.WHATSAPP_ACCESS_TOKEN = accessToken;
    
    // Создаем клиент для Cloud API
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v17.0';
    const axiosInstance = axios.create({
      baseURL: `https://graph.facebook.com/${apiVersion}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Делаем запрос к Cloud API для проверки доступа
    logger.info(`Проверка доступа к WhatsApp Cloud API для номера ${phoneNumberId}`);
    
    try {
      const response = await axiosInstance.get(`/${phoneNumberId}?fields=verified_name,status`);
      
      res.status(200).json({
        success: true,
        message: 'Успешное подключение к WhatsApp Cloud API',
        data: {
          phoneNumberId,
          verifiedName: response.data.verified_name,
          status: response.data.status
        }
      });
    } catch (apiError) {
      return next(new ApiError(
        apiError.response?.status || 500,
        apiError.response?.data?.error?.message || apiError.message
      ));
    }
    
  } catch (error) {
    next(error);
  }
};

// @desc    Верификация номера WhatsApp с кодом (локальный API)
// @route   POST /api/whatsapp/verify-local
// @access  Private/Admin
const verifyWhatsAppLocalApi = async (req, res, next) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return next(new ApiError(400, 'Код верификации обязателен'));
    }
    
    // Создаем клиент для локального API
    const apiUrl = config.whatsapp.localApi.apiUrl;
    const apiKey = config.whatsapp.localApi.apiKey;
    
    const axiosInstance = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      timeout: 15000
    });
    
    // Делаем запрос к локальному API
    logger.info(`Отправка запроса на верификацию WhatsApp номера с кодом ${code}`);
    
    try {
      const response = await axiosInstance.post('/v1/account/verify', { code });
      
      res.status(200).json({
        success: true,
        message: 'WhatsApp номер успешно верифицирован',
        data: response.data
      });
    } catch (apiError) {
      return next(new ApiError(
        apiError.response?.status || 500,
        apiError.response?.data?.message || apiError.message
      ));
    }
    
  } catch (error) {
    next(error);
  }
};

// @desc    Верификация номера WhatsApp с кодом (Cloud API)
// @route   POST /api/whatsapp/verify-cloud
// @access  Private/Admin
const verifyWhatsAppCloudApi = async (req, res, next) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return next(new ApiError(400, 'Код верификации обязателен'));
    }
    
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!phoneNumberId || !accessToken) {
      return next(new ApiError(400, 'ID номера телефона и токен доступа не настроены. Сначала зарегистрируйте номер.'));
    }
    
    // Создаем клиент для Cloud API
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v17.0';
    const axiosInstance = axios.create({
      baseURL: `https://graph.facebook.com/${apiVersion}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Делаем запрос к Cloud API
    logger.info(`Отправка запроса на верификацию WhatsApp номера с кодом ${code} через Cloud API`);
    
    try {
      const response = await axiosInstance.post(`/${phoneNumberId}/verify_code`, { code });
      
      res.status(200).json({
        success: true,
        message: 'WhatsApp номер успешно верифицирован через Cloud API',
        data: response.data
      });
    } catch (apiError) {
      return next(new ApiError(
        apiError.response?.status || 500,
        apiError.response?.data?.error?.message || apiError.message
      ));
    }
    
  } catch (error) {
    next(error);
  }
};

// @desc    Получение информации о номере WhatsApp (Cloud API)
// @route   GET /api/whatsapp/phone-info
// @access  Private/Admin
const getWhatsAppPhoneInfo = async (req, res, next) => {
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    
    if (!phoneNumberId || !accessToken) {
      return next(new ApiError(400, 'ID номера телефона и токен доступа не настроены'));
    }
    
    // Создаем клиент для Cloud API
    const apiVersion = process.env.WHATSAPP_API_VERSION || 'v17.0';
    const axiosInstance = axios.create({
      baseURL: `https://graph.facebook.com/${apiVersion}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    // Делаем запрос к Cloud API
    logger.info(`Получение информации о WhatsApp номере ${phoneNumberId}`);
    
    try {
      const response = await axiosInstance.get(
        `/${phoneNumberId}?fields=verified_name,code,display_phone_number,quality_rating,status`
      );
      
      res.status(200).json({
        success: true,
        data: response.data
      });
    } catch (apiError) {
      return next(new ApiError(
        apiError.response?.status || 500,
        apiError.response?.data?.error?.message || apiError.message
      ));
    }
    
  } catch (error) {
    next(error);
  }
};

module.exports = {
  saveCertificateHandler,
  registerWhatsAppLocalApi,
  registerWhatsAppCloudApi,
  verifyWhatsAppLocalApi,
  verifyWhatsAppCloudApi,
  getWhatsAppPhoneInfo
};