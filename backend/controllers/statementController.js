const { pool } = require('../database/db');
const documentParser = require('../services/documentParser');
const geminiService = require('../services/geminiService');
const reconciliationEngine = require('../services/reconciliationEngine');
const duplicateDetector = reconciliationEngine;

// Temporary in-memory cache for uploaded document buffers (keyed by importId)
const fileBufferCache = new Map();

/**
 * 1. Upload Statement Document
 * POST /api/statements/upload
 */
async function uploadStatement(req, res, next) {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please select a statement file to upload.' });
        }

        const fileInfo = documentParser.validateAndDetectFileType(req.file);
        const userId = req.user.id;

        // Check if identical statement file was already imported by this user
        const [existing] = await pool.query(
            'SELECT id, filename, status, created_at FROM statement_imports WHERE user_id = ? AND file_hash = ? AND status != "rolled_back"',
            [userId, fileInfo.fileHash]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                success: false,
                isDuplicateStatement: true,
                message: `This statement file ("${fileInfo.filename}") has already been imported on ${new Date(existing[0].created_at).toLocaleDateString()}. Duplicate imports are blocked to prevent distorted records.`,
                existingImportId: existing[0].id
            });
        }

        const importId = `stmt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        // Retrieve user currency
        const [userRow] = await pool.query('SELECT currency FROM users WHERE id = ?', [userId]);
        const userCurrency = userRow[0]?.currency || 'INR';

        await pool.query(
            'INSERT INTO statement_imports (id, user_id, filename, file_hash, file_type, currency, status) VALUES (?, ?, ?, ?, ?, ?, "uploaded")',
            [importId, userId, fileInfo.filename, fileInfo.fileHash, fileInfo.detectedType, userCurrency]
        );

        // Retain buffer in cache for analysis turn
        fileBufferCache.set(importId, {
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            detectedType: fileInfo.detectedType,
            filename: fileInfo.filename,
            uploadedAt: Date.now()
        });

        // Set memory eviction after 30 minutes
        setTimeout(() => fileBufferCache.delete(importId), 30 * 60 * 1000);

        res.status(201).json({
            success: true,
            importId,
            filename: fileInfo.filename,
            fileType: fileInfo.detectedType,
            fileSize: fileInfo.fileSize
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 2. Analyze Statement with Gemini & Reconcile
 * POST /api/statements/:id/analyze
 */
async function analyzeStatement(req, res, next) {
    try {
        const importId = req.params.id;
        const userId = req.user.id;
        const { customStartDate, customEndDate } = req.body;
        const userApiKey = (req.body.apiKey || req.body.sessionApiKey || req.headers['x-gemini-key'] || '').trim();
        const userModel = (req.body.model || req.headers['x-gemini-model'] || '').trim();

        if (!userApiKey) {
            return res.status(400).json({
                success: false,
                requiresApiKey: true,
                message: 'A Google Gemini API key is required to analyze and categorize statements. Please provide your key for this active session.'
            });
        }

        const [importRows] = await pool.query(
            'SELECT * FROM statement_imports WHERE id = ? AND user_id = ?',
            [importId, userId]
        );

        if (!importRows.length) {
            return res.status(404).json({ success: false, message: 'Statement import session not found.' });
        }

        const importRecord = importRows[0];
        const cached = fileBufferCache.get(importId);

        if (!cached || !cached.buffer) {
            return res.status(410).json({
                success: false,
                message: 'Statement file buffer has expired from session memory. Please re-upload the statement.'
            });
        }

        const userDates = {
            startDate: customStartDate || null,
            endDate: customEndDate || null
        };

        let extraction;
        const detectedType = cached.detectedType;

        if (detectedType === 'xlsx' || detectedType === 'xls' || detectedType === 'csv') {
            const spreadsheetData = documentParser.parseSpreadsheet(cached.buffer, detectedType);
            extraction = await geminiService.extractFromSpreadsheetText(
                spreadsheetData.csvContent,
                userDates,
                importRecord.currency,
                userApiKey,
                userModel
            );
        } else {
            // PDF or Image (JPG, PNG) -> Multimodal extraction
            extraction = await geminiService.extractFromMultimodal(
                cached.buffer,
                cached.mimetype,
                userDates,
                importRecord.currency,
                userApiKey,
                userModel
            );
        }

        const statementData = extraction.statement;
        let transactions = extraction.transactions;

        // Perform Decimal-Safe Reconciliation
        const reconciliation = reconciliationEngine.reconcileStatement(statementData, transactions);

        // Fetch User's Existing Transactions for Duplicate Detection
        const [existingTxs] = await pool.query(
            'SELECT id, title, amount, type, date, fingerprint FROM transactions WHERE user_id = ?',
            [userId]
        );

        // Smart Duplicate Detection & Fingerprinting
        transactions = duplicateDetector.detectDuplicates(transactions, existingTxs);

        const newCount = transactions.filter(t => t.duplicateStatus === 'new').length;
        const exactDupeCount = transactions.filter(t => t.duplicateStatus === 'duplicate_exact').length;
        const potentialDupeCount = transactions.filter(t => t.duplicateStatus === 'duplicate_potential').length;

        // Persist Analyzed Extraction in DB
        const extractedJson = JSON.stringify({
            statement: statementData,
            transactions,
            reconciliation
        });

        await pool.query(
            `UPDATE statement_imports SET
                account_name = ?,
                start_date = ?,
                end_date = ?,
                opening_balance = ?,
                closing_balance = ?,
                calculated_closing_balance = ?,
                reconciliation_difference = ?,
                total_credits = ?,
                total_debits = ?,
                total_extracted = ?,
                reconciliation_status = ?,
                status = 'analyzed',
                extracted_data_json = ?
             WHERE id = ? AND user_id = ?`,
            [
                statementData.accountName || 'Primary Account',
                statementData.startDate,
                statementData.endDate,
                reconciliation.openingBalance,
                reconciliation.closingBalance,
                reconciliation.calculatedClosingBalance,
                reconciliation.reconciliationDifference,
                reconciliation.totalCredits,
                reconciliation.totalDebits,
                transactions.length,
                reconciliation.reconciliationStatus,
                extractedJson,
                importId,
                userId
            ]
        );

        res.json({
            success: true,
            importId,
            statement: statementData,
            reconciliation,
            duplicateSummary: {
                totalExtracted: transactions.length,
                newTransactions: newCount,
                exactDuplicates: exactDupeCount,
                potentialDuplicates: potentialDupeCount
            },
            transactions
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 3. Get Statement Preview & Extraction Data
 * GET /api/statements/:id/preview
 */
async function getStatementPreview(req, res, next) {
    try {
        const importId = req.params.id;
        const userId = req.user.id;

        const [rows] = await pool.query(
            'SELECT * FROM statement_imports WHERE id = ? AND user_id = ?',
            [importId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Statement import not found.' });
        }

        const record = rows[0];
        let data = {};
        if (record.extracted_data_json) {
            try { data = JSON.parse(record.extracted_data_json); } catch (_) {}
        }

        res.json({
            success: true,
            import: {
                id: record.id,
                filename: record.filename,
                fileType: record.file_type,
                accountName: record.account_name,
                currency: record.currency,
                startDate: record.start_date,
                endDate: record.end_date,
                openingBalance: record.opening_balance,
                closingBalance: record.closing_balance,
                calculatedClosingBalance: record.calculated_closing_balance,
                reconciliationDifference: record.reconciliation_difference,
                reconciliationStatus: record.reconciliation_status,
                status: record.status,
                adjustmentApplied: Boolean(record.adjustment_applied),
                createdAt: record.created_at
            },
            statement: data.statement || {},
            reconciliation: data.reconciliation || {},
            transactions: data.transactions || []
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 4. Re-calculate Reconciliation Dynamically on User Edits
 * POST /api/statements/:id/reconcile
 */
async function reconcileStatement(req, res, next) {
    try {
        const importId = req.params.id;
        const userId = req.user.id;
        const { statement, transactions } = req.body;

        if (!statement || !Array.isArray(transactions)) {
            return res.status(400).json({ success: false, message: 'Statement and transactions are required.' });
        }

        const [rows] = await pool.query(
            'SELECT id FROM statement_imports WHERE id = ? AND user_id = ?',
            [importId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Statement import not found.' });
        }

        // Run decimal-safe reconciliation on the updated transactions
        const reconciliation = reconciliationEngine.reconcileStatement(statement, transactions);

        res.json({
            success: true,
            reconciliation
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 5. Confirm Import & Synchronize Account Balance
 * POST /api/statements/:id/confirm
 */
async function confirmStatementImport(req, res, next) {
    try {
        const importId = req.params.id;
        const userId = req.user.id;
        const { transactions = [], authorizeBalanceAdjustment = false, adjustmentReason = '' } = req.body;

        const [rows] = await pool.query(
            'SELECT * FROM statement_imports WHERE id = ? AND user_id = ?',
            [importId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Statement import not found.' });
        }

        const record = rows[0];
        if (record.status === 'confirmed') {
            return res.status(400).json({ success: false, message: 'This statement import has already been confirmed.' });
        }

        let parsedData = {};
        try { parsedData = JSON.parse(record.extracted_data_json || '{}'); } catch (_) {}

        // Use submitted transactions or fallback to parsed data
        const txList = transactions.length ? transactions : (parsedData.transactions || []);
        const toImport = txList.filter(t => t.selectedForImport !== false);

        if (!toImport.length && !authorizeBalanceAdjustment) {
            return res.status(400).json({ success: false, message: 'No transactions selected for import.' });
        }

        // Run final reconciliation check
        const finalReconcile = reconciliationEngine.reconcileStatement(parsedData.statement || record, toImport);

        // If discrepancy exists and user did NOT authorize adjustment, block synchronization
        if (!finalReconcile.isReconciled && !authorizeBalanceAdjustment) {
            return res.status(422).json({
                success: false,
                requiresAuthorization: true,
                reconciliationDifference: finalReconcile.reconciliationDifference,
                message: `Reconciliation discrepancy of ₹${finalReconcile.reconciliationDifference} detected. Please resolve invalid transactions or check 'Authorize Balance Adjustment' with a verified explanation to proceed.`
            });
        }

        // Insert validated transactions into MySQL
        let insertedCount = 0;
        for (const t of toImport) {
            const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
            const fp = t.fingerprint || duplicateDetector.generateTransactionFingerprint(t);
            const amt = Math.abs(parseFloat(t.amount || 0));
            const txDate = t.date || new Date().toISOString().split('T')[0];
            const type = t.type || 'expense';
            const cat = t.category || (type === 'income' ? 'Other Income' : 'Other Expense');

            await pool.query(
                `INSERT INTO transactions (id, user_id, title, amount, type, category, payment_method, date, notes, import_id, fingerprint)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    txId,
                    userId,
                    (t.description || t.title || 'Statement Item').trim(),
                    amt,
                    type,
                    cat,
                    'statement_import',
                    txDate,
                    t.referenceNumber ? `Statement Ref: ${t.referenceNumber}` : (t.notes || 'Imported from statement'),
                    importId,
                    fp
                ]
            );
            insertedCount++;
        }

        // Handle explicit balance adjustment if authorized by user
        const adjustmentApplied = Boolean(authorizeBalanceAdjustment && finalReconcile.reconciliationDifference !== 0);
        const adjAmount = adjustmentApplied ? finalReconcile.reconciliationDifference : null;
        const adjReason = adjustmentApplied ? (adjustmentReason || `Reconciliation adjustment for ${record.filename}`) : null;

        const skippedCount = txList.length - insertedCount;

        // Mark import as confirmed and record adjustment audit directly on the import record
        await pool.query(
            `UPDATE statement_imports SET
                status = 'confirmed',
                imported_count = ?,
                skipped_count = ?,
                adjustment_applied = ?,
                adjustment_amount = ?,
                adjustment_reason = ?
             WHERE id = ? AND user_id = ?`,
            [
                insertedCount,
                skippedCount,
                adjustmentApplied,
                adjAmount,
                adjReason,
                importId,
                userId
            ]
        );

        // Free memory cache
        fileBufferCache.delete(importId);

        res.json({
            success: true,
            message: 'Statement imported and account balance synchronized successfully.',
            importedCount: insertedCount,
            skippedCount,
            adjustmentApplied: Boolean(adjustmentRecordId),
            importId
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 6. Get User Import History
 * GET /api/statements/history
 */
async function getStatementHistory(req, res, next) {
    try {
        const userId = req.user.id;
        const [rows] = await pool.query(
            `SELECT id, filename, file_type, account_name, currency, start_date, end_date,
                    opening_balance, closing_balance, calculated_closing_balance, reconciliation_difference,
                    total_credits, total_debits, total_extracted, imported_count, skipped_count,
                    reconciliation_status, status, adjustment_applied, created_at
             FROM statement_imports
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );

        res.json({
            success: true,
            history: rows
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 7. Get Statement Details by ID
 * GET /api/statements/:id
 */
async function getStatementById(req, res, next) {
    try {
        const importId = req.params.id;
        const userId = req.user.id;

        const [rows] = await pool.query(
            'SELECT * FROM statement_imports WHERE id = ? AND user_id = ?',
            [importId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Statement not found.' });
        }

        const record = rows[0];

        // Fetch transactions imported by this statement
        const [txs] = await pool.query(
            'SELECT id, title, amount, type, category, date, notes, created_at FROM transactions WHERE import_id = ? AND user_id = ?',
            [importId, userId]
        );

        res.json({
            success: true,
            statement: record,
            importedTransactions: txs
        });
    } catch (error) {
        next(error);
    }
}

/**
 * 8. Rollback Statement Import
 * POST /api/statements/:id/rollback
 */
async function rollbackStatement(req, res, next) {
    try {
        const importId = req.params.id;
        const userId = req.user.id;

        const [rows] = await pool.query(
            'SELECT * FROM statement_imports WHERE id = ? AND user_id = ?',
            [importId, userId]
        );

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Statement not found.' });
        }

        const record = rows[0];
        if (record.status === 'rolled_back') {
            return res.status(400).json({ success: false, message: 'This statement import has already been rolled back.' });
        }

        // Delete ONLY transactions created by this specific statement import
        const [delResult] = await pool.query(
            'DELETE FROM transactions WHERE import_id = ? AND user_id = ?',
            [importId, userId]
        );

        // Update import status to rolled_back
        await pool.query(
            'UPDATE statement_imports SET status = "rolled_back" WHERE id = ? AND user_id = ?',
            [importId, userId]
        );

        res.json({
            success: true,
            message: `Statement "${record.filename}" successfully rolled back. ${delResult.affectedRows} transactions were safely removed.`,
            reversedTransactionsCount: delResult.affectedRows,
            importId
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    uploadStatement,
    analyzeStatement,
    getStatementPreview,
    reconcileStatement,
    confirmStatementImport,
    getStatementHistory,
    getStatementById,
    rollbackStatement
};
