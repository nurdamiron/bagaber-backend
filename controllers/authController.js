// controllers/authController.js

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { User } = require('../models');
const { ApiError } = require('../middleware/errorHandler');

// Функция для генерации JWT токена
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );
};

// Регистрация нового пользователя
exports.register = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      throw new ApiError(400, 'Username and password are required');
    }
    
    // Проверка, существует ли пользователь
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      throw new ApiError(400, 'User already exists');
    }
    
    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Создание пользователя (по умолчанию роль "user")
    const user = await User.create({ username, password: hashedPassword, role: 'user' });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: { id: user.id, username: user.username }
    });
  } catch (error) {
    next(error);
  }
};

// Авторизация пользователя (логин)
// Enhanced login function with debugging
exports.login = async (req, res, next) => {
  try {
    console.log('Login attempt:', { username: req.body.username });
    
    const { username, password } = req.body;
    
    if (!username || !password) {
      console.log('Missing credentials');
      throw new ApiError(400, 'Username and password are required');
    }
    
    // Find user with detailed logging
    const user = await User.findOne({ where: { username } });
    console.log('User lookup result:', user ? `Found (ID: ${user.id})` : 'Not found');
    
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }
    
    // Test password match with detailed logging
    const isMatch = await bcrypt.compare(password, user.password);
    console.log('Password match result:', isMatch);
    
    if (!isMatch) {
      throw new ApiError(401, 'Invalid credentials');
    }
    
    // Generate token
    const token = generateToken(user);
    console.log('Login successful for:', username);
    
    res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      data: {
        token,
        user: { id: user.id, username: user.username, role: user.role }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    next(error);
  }
};

// Получение данных текущего пользователя
exports.getMe = async (req, res, next) => {
  try {
    // req.user должен быть установлен в middleware аутентификации
    res.status(200).json({
      success: true,
      data: req.user
    });
  } catch (error) {
    next(error);
  }
};

// Обновление профиля пользователя
exports.updateProfile = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const user = req.user;
    
    if (username) {
      user.username = username;
    }
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    
    await user.save();
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: { id: user.id, username: user.username }
    });
  } catch (error) {
    next(error);
  }
};

// Получение списка пользователей (для администратора)
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.findAll({ attributes: ['id', 'username', 'role'] });
    res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    next(error);
  }
};
