const { pool } = require('../database/db');

// --- Budgets ---

async function getBudgets(req, res, next) {
    try {
        const userId = req.user.id;
        const [budgets] = await pool.query('SELECT category, monthly_limit FROM budgets WHERE user_id = ?', [userId]);
        const [spending] = await pool.query(`
            SELECT category, SUM(amount) as spent FROM transactions
            WHERE user_id = ? AND type = 'expense' AND MONTH(date) = MONTH(CURRENT_DATE()) AND YEAR(date) = YEAR(CURRENT_DATE())
            GROUP BY category
        `, [userId]);

        const spendMap = Object.fromEntries(spending.map(s => [s.category, parseFloat(s.spent)]));
        const budgetObject = Object.fromEntries(budgets.map(b => [b.category, { limit: parseFloat(b.monthly_limit), spent: spendMap[b.category] || 0 }]));

        res.json({ success: true, budgets: budgetObject });
    } catch (error) { next(error); }
}

async function setBudget(req, res, next) {
    try {
        const userId = req.user.id;
        if (req.body.budgets && typeof req.body.budgets === 'object') {
            for (const [cat, limit] of Object.entries(req.body.budgets)) {
                await pool.query(`
                    INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)
                    ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
                `, [userId, cat, parseFloat(limit) || 0]);
            }
            return res.json({ success: true, message: 'All budgets updated successfully.' });
        }

        const { category, limit } = req.body;
        if (!category || limit === undefined) return res.status(400).json({ success: false, message: 'Category and limit are required.' });

        const monthlyLimit = parseFloat(limit);
        await pool.query(`
            INSERT INTO budgets (user_id, category, monthly_limit) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE monthly_limit = VALUES(monthly_limit)
        `, [userId, category, monthlyLimit]);

        res.json({ success: true, message: `Budget for ${category} updated.`, category, limit: monthlyLimit });
    } catch (error) { next(error); }
}

async function deleteBudget(req, res, next) {
    try {
        await pool.query('DELETE FROM budgets WHERE user_id = ? AND category = ?', [req.user.id, req.params.category]);
        res.json({ success: true, message: 'Budget limit removed.' });
    } catch (error) { next(error); }
}

// --- Savings Goals ---

const SELECT_GOAL = `SELECT id, user_id, title, title AS name, target_amount, target_amount AS target, current_amount, current_amount AS current, deadline, color, created_at FROM savings_goals`;

async function getGoals(req, res, next) {
    try {
        const [rows] = await pool.query(`${SELECT_GOAL} WHERE user_id = ? ORDER BY created_at DESC`, [req.user.id]);
        res.json({ success: true, goals: rows });
    } catch (error) { next(error); }
}

async function createGoal(req, res, next) {
    try {
        const userId = req.user.id;
        const title = (req.body.title || req.body.name || '').trim();
        const targetAmount = parseFloat(req.body.targetAmount || req.body.target);
        const currentAmount = parseFloat(req.body.currentAmount || req.body.current || 0);
        const deadline = req.body.deadline || null;
        const color = req.body.color || '#6366f1';
        const goalId = req.body.id || `goal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        if (!title || isNaN(targetAmount)) return res.status(400).json({ success: false, message: 'Title and target amount are required.' });

        await pool.query(
            'INSERT INTO savings_goals (id, user_id, title, target_amount, current_amount, deadline, color) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [goalId, userId, title, targetAmount, currentAmount, deadline, color]
        );

        const [rows] = await pool.query(`${SELECT_GOAL} WHERE id = ?`, [goalId]);
        res.status(201).json({ success: true, message: 'Goal created.', goal: rows[0] });
    } catch (error) { next(error); }
}

async function depositToGoal(req, res, next) {
    try {
        const userId = req.user.id;
        const { id } = req.params;
        const amount = parseFloat(req.body.amount);
        if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Valid deposit amount required.' });

        const [existing] = await pool.query('SELECT * FROM savings_goals WHERE id = ? AND user_id = ?', [id, userId]);
        if (!existing.length) return res.status(404).json({ success: false, message: 'Goal not found.' });

        const newCurrent = Math.min(parseFloat(existing[0].target_amount), parseFloat(existing[0].current_amount) + amount);
        await pool.query('UPDATE savings_goals SET current_amount = ? WHERE id = ? AND user_id = ?', [newCurrent, id, userId]);

        const [updated] = await pool.query(`${SELECT_GOAL} WHERE id = ?`, [id]);
        res.json({ success: true, message: `Deposited ${amount}.`, goal: updated[0] });
    } catch (error) { next(error); }
}

async function deleteGoal(req, res, next) {
    try {
        const [result] = await pool.query('DELETE FROM savings_goals WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: 'Goal not found.' });
        res.json({ success: true, message: 'Goal deleted.' });
    } catch (error) { next(error); }
}

module.exports = {
    getBudgets,
    setBudget,
    deleteBudget,
    getGoals,
    createGoal,
    depositToGoal,
    deleteGoal
};
