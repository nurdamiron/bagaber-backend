// controllers/whatsappController.js
const whatsappService = require('../services/whatsappService');
const { AllowedPhone } = require('../models');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../services/loggerService');

// @desc    Check WhatsApp connection status
// @route   GET /api/whatsapp/status
// @access  Private
const getStatus = async (req, res, next) => {
  try {
    const status = await whatsappService.checkConnectionStatus();
    
    res.status(200).json({
      success: true,
      data: status
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Register WhatsApp number
// @route   POST /api/whatsapp/register
// @access  Private/Admin
const registerWhatsApp = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return next(new ApiError(400, 'Phone number is required'));
    }
    
    const result = await whatsappService.registerWhatsAppNumber(phoneNumber);
    
    res.status(200).json({
      success: true,
      message: 'WhatsApp registration initiated',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Verify WhatsApp registration with code
// @route   POST /api/whatsapp/verify
// @access  Private/Admin
const verifyWhatsApp = async (req, res, next) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return next(new ApiError(400, 'Verification code is required'));
    }
    
    const result = await whatsappService.verifyWhatsAppRegistration(code);
    
    res.status(200).json({
      success: true,
      message: 'WhatsApp number verified successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Add a phone to allowed list
// @route   POST /api/whatsapp/phones
// @access  Private/Admin
const addAllowedPhone = async (req, res, next) => {
  try {
    const { phoneNumber, description } = req.body;
    
    if (!phoneNumber) {
      return next(new ApiError(400, 'Phone number is required'));
    }
    
    // Normalize phone number (remove spaces, dashes, etc.)
    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    
    // Check if phone already exists
    const existingPhone = await AllowedPhone.findOne({
      where: { phoneNumber: normalizedPhone }
    });
    
    if (existingPhone) {
      return next(new ApiError(400, 'Phone number already in allowed list'));
    }
    
    // Create new allowed phone
    const allowedPhone = await AllowedPhone.create({
      phoneNumber: normalizedPhone,
      description: description || '',
      isActive: true,
      userId: req.user.id // Associate with the current user
    });
    
    res.status(201).json({
      success: true,
      message: 'Phone number added to allowed list',
      data: allowedPhone
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all allowed phones
// @route   GET /api/whatsapp/phones
// @access  Private
const getAllowedPhones = async (req, res, next) => {
  try {
    const phones = await AllowedPhone.findAll({
      order: [['createdAt', 'DESC']]
    });
    
    res.status(200).json({
      success: true,
      count: phones.length,
      data: phones
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Update allowed phone
// @route   PUT /api/whatsapp/phones/:id
// @access  Private/Admin
const updateAllowedPhone = async (req, res, next) => {
  try {
    const { phoneNumber, description, isActive } = req.body;
    
    const phone = await AllowedPhone.findByPk(req.params.id);
    
    if (!phone) {
      return next(new ApiError(404, 'Phone not found'));
    }
    
    // Update fields if provided
    if (phoneNumber) {
      // Normalize phone number
      phone.phoneNumber = phoneNumber.replace(/\D/g, '');
    }
    if (description !== undefined) {
      phone.description = description;
    }
    if (isActive !== undefined) {
      phone.isActive = isActive;
    }
    
    // Save changes
    await phone.save();
    
    res.status(200).json({
      success: true,
      message: 'Phone updated successfully',
      data: phone
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete allowed phone
// @route   DELETE /api/whatsapp/phones/:id
// @access  Private/Admin
const deleteAllowedPhone = async (req, res, next) => {
  try {
    const phone = await AllowedPhone.findByPk(req.params.id);
    
    if (!phone) {
      return next(new ApiError(404, 'Phone not found'));
    }
    
    await phone.destroy();
    
    res.status(200).json({
      success: true,
      message: 'Phone removed from allowed list',
      data: {}
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Send test WhatsApp message
// @route   POST /api/whatsapp/test
// @access  Private/Admin
const sendTestMessage = async (req, res, next) => {
  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return next(new ApiError(400, 'Phone number and message are required'));
    }
    
    const result = await whatsappService.sendMessage(phoneNumber, message);
    
    res.status(200).json({
      success: true,
      message: 'Test message sent successfully',
      data: result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStatus,
  registerWhatsApp,
  verifyWhatsApp,
  addAllowedPhone,
  getAllowedPhones,
  updateAllowedPhone,
  deleteAllowedPhone,
  sendTestMessage
};