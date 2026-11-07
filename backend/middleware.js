const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // "Bearer <TOKEN>"

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No authorization token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fintrack_jwt_super_secret_key_2026_finance_secure');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired authorization token.'
        });
    }
}

function errorHandler(err, req, res, next) {
    console.error('🔥 Server Error:', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
}

module.exports = {
    authenticateToken,
    errorHandler
};

