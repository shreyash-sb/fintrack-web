const { pool } = require('../database/db');
const cloudinary = require('cloudinary').v2;

const isCloudinaryConfigured = () => {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
    return Boolean(
        CLOUDINARY_CLOUD_NAME && CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
        CLOUDINARY_API_KEY && CLOUDINARY_API_KEY !== 'your_api_key' &&
        CLOUDINARY_API_SECRET && CLOUDINARY_API_SECRET !== 'your_api_secret'
    );
};

if (isCloudinaryConfigured()) {
    cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
    });
}

const uploadStream = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
        if (!isCloudinaryConfigured()) {
            return reject(new Error('Cloudinary is not configured. Please add credentials to .env file.'));
        }
        const stream = cloudinary.uploader.upload_stream(
            { folder: 'fintrack_receipts', resource_type: 'auto', ...options },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });
};

const deleteResource = async (publicId) => {
    if (!isCloudinaryConfigured() || !publicId) return null;
    try {
        return await cloudinary.uploader.destroy(publicId);
    } catch (err) {
        console.warn('[Cloudinary] Failed to delete resource:', err.message);
        return null;
    }
};

// List user transactions with filtering and sorting
async function getTransactions(req, res, next) {
    try {
        const { type, category, search, startDate, endDate, sort } = req.query;
        let query = 'SELECT id, user_id, title, amount, type, category, payment_method, payment_method AS paymentMethod, date, notes, receipt_url, receipt_url AS receiptUrl, receipt_public_id, receipt_public_id AS receiptPublicId, created_at, updated_at FROM transactions WHERE user_id = ?';
        const params = [req.user.id];

        if (type && (type === 'income' || type === 'expense')) { query += ' AND type = ?'; params.push(type); }
        if (category && category !== 'all') { query += ' AND category = ?'; params.push(category); }
        if (startDate) { query += ' AND date >= ?'; params.push(startDate); }
        if (endDate) { query += ' AND date <= ?'; params.push(endDate); }
        if (search) { query += ' AND (title LIKE ? OR notes LIKE ? OR category LIKE ?)'; const t = `%${search}%`; params.push(t, t, t); }

        const sortMap = { date_asc: 'date ASC, created_at ASC', amount_desc: 'amount DESC', amount_asc: 'amount ASC', title_asc: 'title ASC' };
        query += ` ORDER BY ${sortMap[sort] || 'date DESC, created_at DESC'}`;

        const [rows] = await pool.query(query, params);
        res.json({ success: true, count: rows.length, transactions: rows });
    } catch (error) { next(error); }
}

// Financial KPI metrics and chart aggregation
async function getFinancialSummary(req, res, next) {
    try {
        const uid = req.user.id;
        const [kpi] = await pool.query(`
            SELECT COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS total_income,
                   COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS total_expense,
                   COUNT(id) as total_count FROM transactions WHERE user_id = ?
        `, [uid]);

        const totalIncome = parseFloat(kpi[0].total_income), totalExpense = parseFloat(kpi[0].total_expense);
        const [categories] = await pool.query('SELECT category, SUM(amount) AS total FROM transactions WHERE user_id = ? AND type = "expense" GROUP BY category ORDER BY total DESC', [uid]);
        const [monthly] = await pool.query(`
            SELECT DATE_FORMAT(date, '%Y-%m') AS month,
                   SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
                   SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
            FROM transactions WHERE user_id = ? AND date >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY DATE_FORMAT(date, '%Y-%m') ORDER BY month ASC
        `, [uid]);

        res.json({
            success: true,
            summary: {
                totalIncome, totalExpense, netBalance: totalIncome - totalExpense,
                savingsRate: totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0,
                totalTransactions: kpi[0].total_count, categoryBreakdown: categories, monthlyCashFlow: monthly
            }
        });
    } catch (error) { next(error); }
}

// Upload receipt directly to Cloudinary
async function uploadReceipt(req, res, next) {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No receipt file provided.' });
        const result = await uploadStream(req.file.buffer);
        res.json({
            success: true,
            receiptUrl: result.secure_url,
            receiptPublicId: result.public_id
        });
    } catch (error) { next(error); }
}

// Create new transaction
async function createTransaction(req, res, next) {
    try {
        const { title, amount, type, category, date, notes = '' } = req.body;
        const paymentMethod = req.body.paymentMethod || req.body.payment_method || 'upi';
        const receiptUrl = req.body.receiptUrl || req.body.receipt_url || null;
        const receiptPublicId = req.body.receiptPublicId || req.body.receipt_public_id || null;
        if (!title || !amount || !type || !category) return res.status(400).json({ success: false, message: 'Required fields missing.' });

        const txId = req.body.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const txDate = date || new Date().toISOString().split('T')[0];

        await pool.query(
            'INSERT INTO transactions (id, user_id, title, amount, type, category, payment_method, date, notes, receipt_url, receipt_public_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [txId, req.user.id, title.trim(), parseFloat(amount), type, category, paymentMethod, txDate, notes.trim(), receiptUrl, receiptPublicId]
        );

        const [rows] = await pool.query('SELECT * FROM transactions WHERE id = ?', [txId]);
        res.status(201).json({ success: true, message: 'Transaction created.', transaction: rows[0] });
    } catch (error) { next(error); }
}

// Update existing transaction
async function updateTransaction(req, res, next) {
    try {
        const { title, amount, type, category, date, notes } = req.body;
        const paymentMethod = req.body.paymentMethod ?? req.body.payment_method;
        const receiptUrl = req.body.receiptUrl ?? req.body.receipt_url;
        const receiptPublicId = req.body.receiptPublicId ?? req.body.receipt_public_id;
        const updates = [], values = [];

        if (title !== undefined) { updates.push('title = ?'); values.push(title.trim()); }
        if (amount !== undefined && !isNaN(amount)) { updates.push('amount = ?'); values.push(parseFloat(amount)); }
        if (type !== undefined) { updates.push('type = ?'); values.push(type); }
        if (category !== undefined) { updates.push('category = ?'); values.push(category); }
        if (paymentMethod !== undefined) { updates.push('payment_method = ?'); values.push(paymentMethod); }
        if (date !== undefined) { updates.push('date = ?'); values.push(date); }
        if (notes !== undefined) { updates.push('notes = ?'); values.push(notes ? notes.trim() : ''); }
        if (receiptUrl !== undefined) { updates.push('receipt_url = ?'); values.push(receiptUrl); }
        if (receiptPublicId !== undefined) { updates.push('receipt_public_id = ?'); values.push(receiptPublicId); }

        if (updates.length) {
            values.push(req.params.id, req.user.id);
            await pool.query(`UPDATE transactions SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`, values);
        }

        const [updated] = await pool.query('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
        if (!updated.length) return res.status(404).json({ success: false, message: 'Transaction not found.' });
        res.json({ success: true, message: 'Transaction updated.', transaction: updated[0] });
    } catch (error) { next(error); }
}

// Delete transaction (and cleanup Cloudinary asset if exists)
async function deleteTransaction(req, res, next) {
    try {
        const [rows] = await pool.query('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!rows.length) return res.status(404).json({ success: false, message: 'Transaction not found.' });
        
        if (rows[0].receipt_public_id) {
            await deleteResource(rows[0].receipt_public_id);
        }

        await pool.query('DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ success: true, message: 'Transaction deleted.', deletedTransaction: rows[0] });
    } catch (error) { next(error); }
}

// Bulk Import transactions
async function bulkImport(req, res, next) {
    try {
        const { transactions = [] } = req.body;
        if (!Array.isArray(transactions) || !transactions.length) return res.status(400).json({ success: false, message: 'Empty transactions.' });

        for (const t of transactions) {
            const txId = t.id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            await pool.query(`
                INSERT INTO transactions (id, user_id, title, amount, type, category, payment_method, date, notes, receipt_url, receipt_public_id) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE title=VALUES(title), amount=VALUES(amount), type=VALUES(type), category=VALUES(category), payment_method=VALUES(payment_method), date=VALUES(date), notes=VALUES(notes), receipt_url=VALUES(receipt_url), receipt_public_id=VALUES(receipt_public_id)
            `, [txId, req.user.id, t.title || 'Untitled', parseFloat(t.amount || 0), t.type || 'expense', t.category || 'other_expense', t.paymentMethod || t.payment_method || 'upi', t.date || new Date().toISOString().split('T')[0], t.notes || '', t.receiptUrl || t.receipt_url || null, t.receiptPublicId || t.receipt_public_id || null]);
        }
        res.json({ success: true, message: `Imported ${transactions.length} records.` });
    } catch (error) { next(error); }
}

module.exports = { getTransactions, getFinancialSummary, uploadReceipt, createTransaction, updateTransaction, deleteTransaction, bulkImport };
