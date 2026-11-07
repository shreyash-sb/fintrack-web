const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const apiRoutes = require('./routes');
const { errorHandler } = require('./middleware');
const initDatabase = require('./database/init');
const { testConnection } = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security Headers with relaxed CSP for CDN charts and fonts
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://generativelanguage.googleapis.com"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

// CORS and Body Parsers
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend delivery
const frontendPath = path.join(__dirname, '../frontend');
app.use(express.static(frontendPath));

// API Routes
app.use('/api', apiRoutes);

// Dedicated page routes
app.get('/login', (req, res) => res.sendFile(path.join(frontendPath, 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(frontendPath, 'signup.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(frontendPath, 'dashboard.html')));

// Fallback route for client-side pages
app.get('*', (req, res, next) => {
    // If request is an API request that didn't match, return 404 JSON
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, message: 'API endpoint not found.' });
    }
    // Otherwise serve index.html
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// Centralized error handling
app.use(errorHandler);

// Server boot
app.listen(PORT, async () => {
    console.log(`🚀 Fintrack running on http://localhost:${PORT}`);

    // Verify DB Connection & run migrations
    const dbTest = await testConnection();
    if (dbTest.connected) {
        await initDatabase();
        console.log('✅ MySQL database connected');
    } else {
        console.warn(`⚠️ MySQL connection error: ${dbTest.error}`);
        console.warn(`💡 Check DB credentials in .env and verify MySQL is running.`);
    }
});

module.exports = app;

