const mysql = require('mysql2/promise');
require('dotenv').config();

function getPoolConfig() {
    if (process.env.DATABASE_URL) {
        return {
            uri: process.env.DATABASE_URL,
            waitForConnections: true,
            connectionLimit: 15,
            queueLimit: 0,
            enableKeepAlive: true,
            keepAliveInitialDelay: 10000,
            ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
        };
    }

    const host = process.env.DB_HOST || 'localhost';
    const isRemote = host !== 'localhost' && host !== '127.0.0.1';
    const useSsl = process.env.DB_SSL === 'true' || (isRemote && process.env.DB_SSL !== 'false');

    return {
        host: host,
        port: parseInt(process.env.DB_PORT || '3306', 10),
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'fintrack_db',
        waitForConnections: true,
        connectionLimit: 15,
        queueLimit: 0,
        enableKeepAlive: true,
        keepAliveInitialDelay: 10000,
        ssl: useSsl ? { rejectUnauthorized: false } : undefined
    };
}

const pool = mysql.createPool(getPoolConfig());

// Helper to check DB connectivity
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        await connection.ping();
        connection.release();
        return { connected: true };
    } catch (error) {
        return { connected: false, error: error.message };
    }
}

module.exports = {
    pool,
    testConnection
};
