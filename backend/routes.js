const express = require('express');
const multer = require('multer');
const router = express.Router();

const { testConnection } = require('./database/db');
const { authenticateToken } = require('./middleware');

const authController = require('./controllers/authController');
const transactionController = require('./controllers/transactionController');
const planningController = require('./controllers/planningController');
const statementController = require('./controllers/statementController');
const aiController = require('./controllers/aiController');

// Multer memory storage configs
const uploadReceipt = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 6 * 1024 * 1024 }
});

const uploadStatement = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// --- System & Health ---
router.get('/health', async (req, res) => {
    const dbStatus = await testConnection();
    res.json({
        status: dbStatus.connected ? 'healthy' : 'degraded',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        database: { connected: dbStatus.connected, error: dbStatus.error || null }
    });
});

// --- Auth Routes ---
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.get('/auth/me', authenticateToken, authController.getMe);
router.put('/auth/profile', authenticateToken, authController.updateProfile);
router.put('/auth/change-password', authenticateToken, authController.changePassword);
router.delete('/auth/account', authenticateToken, authController.deleteAccount);

// --- Transaction Routes ---
router.get('/transactions', authenticateToken, transactionController.getTransactions);
router.get('/transactions/summary', authenticateToken, transactionController.getFinancialSummary);
router.post('/transactions/upload-receipt', authenticateToken, uploadReceipt.single('receipt'), transactionController.uploadReceipt);
router.post('/transactions', authenticateToken, transactionController.createTransaction);
router.put('/transactions/:id', authenticateToken, transactionController.updateTransaction);
router.delete('/transactions/:id', authenticateToken, transactionController.deleteTransaction);
router.post('/transactions/bulk', authenticateToken, transactionController.bulkImport);

// --- Budget Routes ---
router.get('/budgets', authenticateToken, planningController.getBudgets);
router.post('/budgets', authenticateToken, planningController.setBudget);
router.delete('/budgets/:category', authenticateToken, planningController.deleteBudget);

// --- Savings Goal Routes ---
router.get('/goals', authenticateToken, planningController.getGoals);
router.post('/goals', authenticateToken, planningController.createGoal);
router.post('/goals/:id/deposit', authenticateToken, planningController.depositToGoal);
router.delete('/goals/:id', authenticateToken, planningController.deleteGoal);

// --- Statement Import & Reconciliation Routes ---
router.post('/statements/upload', authenticateToken, uploadStatement.single('statement'), statementController.uploadStatement);
router.post('/statements/:id/analyze', authenticateToken, statementController.analyzeStatement);
router.get('/statements/:id/preview', authenticateToken, statementController.getStatementPreview);
router.post('/statements/:id/reconcile', authenticateToken, statementController.reconcileStatement);
router.post('/statements/:id/confirm', authenticateToken, statementController.confirmStatementImport);
router.get('/statements/history', authenticateToken, statementController.getStatementHistory);
router.get('/statements/:id', authenticateToken, statementController.getStatementById);
router.post('/statements/:id/rollback', authenticateToken, statementController.rollbackStatement);

// --- AI Advisor Routes ---
router.post('/ai/test-key', aiController.testApiKey);
router.get('/ai/models', aiController.getAvailableModels);
router.post('/ai/chat', authenticateToken, aiController.chatWithAdvisor);

module.exports = router;
