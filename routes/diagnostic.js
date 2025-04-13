// routes/diagnostic.js
const express = require('express');
const diagnosticController = require('../controllers/diagnosticController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// All diagnostic routes should be protected and admin-only
router.use(protect);
router.use(authorize('admin'));

// Database diagnostics
router.get('/db-check', diagnosticController.checkDatabaseConnection);
router.post('/fix-db', diagnosticController.fixDatabaseIssues);

// Configuration diagnostics
router.get('/config', diagnosticController.getConfiguration);

// File system diagnostics
router.get('/file-check', diagnosticController.checkFileSystem);

// Route diagnostics
router.post('/fix-routes', diagnosticController.fixMissingRoutes);

module.exports = router;