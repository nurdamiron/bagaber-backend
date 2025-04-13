// admin-creator.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const { sequelize } = require('./config/database');
const { User } = require('./models');

async function createAdminUser() {
  try {
    // Check DB connection
    await sequelize.authenticate();
    console.log('Database connection OK');
    
    // Generate hash for "admin123"
    const hashedPassword = await bcrypt.hash('admin123', 10);
    console.log('Password hash generated:', hashedPassword);
    
    // Check if admin exists
    const existingAdmin = await User.findOne({ where: { username: 'admin' } });
    
    if (existingAdmin) {
      // Update existing admin
      existingAdmin.password = hashedPassword;
      existingAdmin.role = 'admin';
      await existingAdmin.save();
      console.log('Admin user updated:', existingAdmin.id);
    } else {
      // Create new admin
      const newAdmin = await User.create({
        username: 'admin',
        password: hashedPassword,
        role: 'admin'
      });
      console.log('Admin user created:', newAdmin.id);
    }
    
    // Verify admin exists with correct credentials
    const admin = await User.findOne({ where: { username: 'admin' } });
    console.log('Admin verification:', {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      passwordLength: admin.password.length
    });
    
    // Test password validation
    const validPassword = await bcrypt.compare('admin123', admin.password);
    console.log('Password validation test:', validPassword);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
}

createAdminUser();