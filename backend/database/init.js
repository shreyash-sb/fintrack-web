const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDatabase() {
    const host = process.env.DB_HOST || 'localhost';
    const isRemote = host !== 'localhost' && host !== '127.0.0.1';
    const useSsl = process.env.DB_SSL === 'true' || (isRemote && process.env.DB_SSL !== 'false');
    const dbName = process.env.DB_NAME || 'fintrack_db';

    let connection;
    try {
        if (process.env.DATABASE_URL) {
            connection = await mysql.createConnection({
                uri: process.env.DATABASE_URL,
                multipleStatements: true,
                ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false }
            });
        } else {
            // First try connecting directly to the target database (common for cloud instances where DB already exists)
            try {
                connection = await mysql.createConnection({
                    host: host,
                    port: parseInt(process.env.DB_PORT || '3306', 10),
                    user: process.env.DB_USER || 'root',
                    password: process.env.DB_PASSWORD || '',
                    database: dbName,
                    multipleStatements: true,
                    ssl: useSsl ? { rejectUnauthorized: false } : undefined
                });
            } catch (directErr) {
                // If the target database doesn't exist yet, connect to MySQL server root and create it
                connection = await mysql.createConnection({
                    host: host,
                    port: parseInt(process.env.DB_PORT || '3306', 10),
                    user: process.env.DB_USER || 'root',
                    password: process.env.DB_PASSWORD || '',
                    multipleStatements: true,
                    ssl: useSsl ? { rejectUnauthorized: false } : undefined
                });
                await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
                await connection.changeUser({ database: dbName });
            }
        }

        // Read and execute schema statements
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // Strip comments and split statements cleanly
        const cleanedSql = schemaSql.replace(/--.*$/gm, '');
        const statements = cleanedSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            await connection.query(statement);
        }

        // Migration step: drop redundant balance_adjustments table and clean legacy columns
        try {
            await connection.query('DROP TABLE IF EXISTS balance_adjustments');

            const [userCols] = await connection.query('SHOW COLUMNS FROM users');
            if (userCols.map(c => c.Field).includes('gemini_api_key')) {
                await connection.query('ALTER TABLE users DROP COLUMN gemini_api_key');
            }

            // Ensure transactions schema conforms to updated schema
            const [txCols] = await connection.query('SHOW COLUMNS FROM transactions');
            const txColNames = txCols.map(c => c.Field);
            if (!txColNames.includes('import_id')) {
                await connection.query('ALTER TABLE transactions ADD COLUMN import_id VARCHAR(64) NULL AFTER user_id');
            }
            if (!txColNames.includes('fingerprint')) {
                await connection.query('ALTER TABLE transactions ADD COLUMN fingerprint VARCHAR(64) NULL AFTER import_id');
                await connection.query('ALTER TABLE transactions ADD INDEX idx_user_fingerprint (user_id, fingerprint)');
            }

            await connection.query("ALTER TABLE transactions MODIFY COLUMN type ENUM('income', 'expense', 'transfer', 'refund') NOT NULL DEFAULT 'expense'");
            await connection.query("ALTER TABLE transactions MODIFY COLUMN notes VARCHAR(500) NULL");
        } catch (migErr) {
            // silent migration catch
        }

        return { success: true };
    } catch (error) {
        console.error('❌ Database error:', error.message);
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('💡 Verify DB_USER and DB_PASSWORD');
        }
        return { success: false, error: error.message };
    } finally {
        if (connection) await connection.end();
    }
}

if (require.main === module) {
    initDatabase().then(res => {
        process.exit(res.success ? 0 : 1);
    });
}

module.exports = initDatabase;
