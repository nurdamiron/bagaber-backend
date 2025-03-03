// app.js
const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');
const { testConnection, syncModels } = require('./config/database');
const logger = require('./services/loggerService');
const { errorHandler } = require('./middleware/errorHandler');

// Загрузка переменных окружения
dotenv.config();

// Импортируем маршруты
const authRoutes = require('./routes/auth');
const kaspiRoutes = require('./routes/kaspi');
const ordersRoutes = require('./routes/orders');
const whatsappRoutes = require('./routes/whatsapp');
const notificationsRoutes = require('./routes/notifications');
const templatesRoutes = require('./routes/templates');
const whatsappActivationRoutes = require('./routes/whatsappActivation'); // Новые маршруты

const notificationScheduler = require('./services/notificationScheduler');

const app = express();

// Безопасность и CORS
app.use(helmet());
app.use(cors());

// Парсинг запросов
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Логгирование HTTP запросов
app.use(morgan('combined', { stream: logger.stream }));

// Простой мидлвар для измерения времени запроса
app.use((req, res, next) => {
  req.requestTime = Date.now();
  
  // Перехватываем завершение запроса для логирования метрик
  res.on('finish', () => {
    const duration = Date.now() - req.requestTime;
    const status = res.statusCode;
    const success = status < 400;
    
    // Логируем метрику
    logger.metrics.recordApiCall(
      'internal',
      `${req.method} ${req.originalUrl}`,
      success,
      duration
    );
  });
  
  next();
});

// Базовый маршрут для проверки работоспособности
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Kaspi Review System API работает',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Регистрируем маршруты
app.use('/api/auth', authRoutes);
app.use('/api/kaspi', kaspiRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/whatsapp-activation', whatsappActivationRoutes); // Новые маршруты

// Глобальный обработчик ошибок
app.use(errorHandler);

// Обработка несуществующих маршрутов
app.use('*', (req, res, next) => {
  res.status(404).json({
    success: false,
    message: `Маршрут ${req.originalUrl} не найден`
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Проверка подключения к БД
    const isConnected = await testConnection();
    if (!isConnected) {
      logger.error("Не удалось подключиться к базе данных. Завершаем работу.");
      process.exit(1);
    }
    
    logger.info("Успешное подключение к базе данных");
    
    // Синхронизация моделей (не используйте force=true в продакшене!)
    await syncModels(false);
    
    // Запуск планировщика уведомлений
    notificationScheduler.startScheduling();
    
    // Запуск HTTP сервера
    app.listen(PORT, () => {
      logger.info(`Сервер запущен на порту ${PORT}`);
    });
    
    // Обработка сигналов завершения для корректного закрытия соединений
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
  } catch (error) {
    logger.error("Ошибка запуска сервера:", error);
    process.exit(1);
  }
}

// Функция для корректного завершения работы приложения
function gracefulShutdown() {
  logger.info("Получен сигнал завершения работы, закрываем соединения...");
  
  // Здесь можно добавить закрытие других соединений (например, Redis и т.д.)
  
  logger.info("Завершение работы приложения");
  process.exit(0);
}

// Запускаем сервер
startServer();