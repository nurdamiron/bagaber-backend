# Базовый образ Node.js
FROM node:16-alpine

# Создание рабочей директории
WORKDIR /usr/src/app

# Копирование файлов package.json и package-lock.json
COPY package*.json ./

# Установка зависимостей
RUN npm install --production

# Копирование исходного кода
COPY . .

# Открытие порта
EXPOSE 3001

# Запуск приложения
CMD ["node", "server.js"]