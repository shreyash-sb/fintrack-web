const { GoogleGenAI } = require('@google/genai');
const { pool } = require('../database/db');

const MODEL_NAME = 'gemini-3.5-flash-lite';

/**
 * 1. Test Gemini API Key
 * POST /api/ai/test-key
 */
async function testApiKey(req, res) {
    try {
        const rawKey = req.body.apiKey || req.headers['x-gemini-key'] || '';
        const key = typeof rawKey === 'string' ? rawKey.trim() : '';

        if (!key || key.includes('•') || key.length < 15) {
            return res.status(400).json({
                success: false,
                requiresApiKey: true,
                message: 'No valid Gemini API key provided. Please paste your Gemini API key (starts with AIzaSy...).'
            });
        }

        const ai = new GoogleGenAI({ apiKey: key });

        const generatePromise = ai.models.generateContent({
            model: MODEL_NAME,
            contents: 'Test connection. Reply with: OK'
        });

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection to Gemini API timed out after 8s.')), 8000)
        );

        const result = await Promise.race([generatePromise, timeoutPromise]);
        if (!result || !result.text) {
            throw new Error('No response returned from Gemini API.');
        }

        return res.json({
            success: true,
            model: MODEL_NAME,
            message: 'Gemini 3.5 Flash connected and verified successfully.'
        });
    } catch (error) {
        console.error('Gemini Key Test Error:', error.message);
        let errorMsg = error.message || 'Failed to verify Gemini API key.';
        try {
            const parsed = JSON.parse(error.message);
            if (parsed.error && parsed.error.message) {
                errorMsg = parsed.error.message;
            }
        } catch (_) {}
        return res.status(400).json({
            success: false,
            message: errorMsg
        });
    }
}

/**
 * 2. Get Available Models Catalog (Compatibility)
 * GET /api/ai/models
 */
async function getAvailableModels(req, res) {
    return res.json({
        success: true,
        model: MODEL_NAME,
        defaultModel: MODEL_NAME
    });
}

/**
 * 3. Chat with Gemini Financial Advisor
 * POST /api/ai/chat
 */
async function chatWithAdvisor(req, res) {
    try {
        const userId = req.user.id;
        const { message, sessionApiKey } = req.body;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: 'Message prompt cannot be empty.' });
        }

        // 1. Gather live financial context for this user from database
        const [userRows] = await pool.query('SELECT name, currency FROM users WHERE id = ?', [userId]);
        const user = userRows[0] || {};
        const currency = user.currency || 'INR';

        const [transactions] = await pool.query(
            'SELECT title, amount, type, category, date FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 100',
            [userId]
        );

        const [budgets] = await pool.query(
            'SELECT category, monthly_limit FROM budgets WHERE user_id = ?',
            [userId]
        );

        const [goals] = await pool.query(
            'SELECT title, target_amount, current_amount, deadline FROM savings_goals WHERE user_id = ?',
            [userId]
        );

        // Summarize financial profile
        let totalIncome = 0;
        let totalExpense = 0;
        const categoryMap = {};

        transactions.forEach(t => {
            const amt = Number(t.amount || 0);
            if (t.type === 'income' || t.type === 'credit') {
                totalIncome += amt;
            } else if (t.type === 'expense' || t.type === 'debit') {
                totalExpense += amt;
                const cat = t.category || 'General';
                categoryMap[cat] = (categoryMap[cat] || 0) + amt;
            }
        });

        const netBalance = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100)) : 0;
        const topCategories = Object.entries(categoryMap)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cat, amt]) => `${cat}: ${currency} ${amt.toLocaleString()}`)
            .join(', ');

        const financialContext = `
USER FINANCIAL PROFILE:
- Name: ${user.name || 'User'}
- Currency: ${currency}
- Total Cumulative Balance: ${currency} ${netBalance.toLocaleString()}
- Total Income: ${currency} ${totalIncome.toLocaleString()}
- Total Expenses: ${currency} ${totalExpense.toLocaleString()}
- Savings Rate: ${savingsRate}%
- Top Spending Categories: ${topCategories || 'None recorded yet'}
- Active Budgets: ${budgets.map(b => `${b.category}: limit ${currency} ${b.monthly_limit}`).join(', ') || 'No budgets configured'}
- Savings Goals: ${goals.map(g => `${g.title || g.name}: ${currency} ${g.current_amount} / ${currency} ${g.target_amount}`).join(', ') || 'No goals configured'}
- Recent 10 Transactions: ${transactions.slice(0, 10).map(t => `${t.date} | ${t.type.toUpperCase()} | ${t.title} | ${currency} ${t.amount} | ${t.category}`).join('; ')}
        `.trim();

        // 2. If API Key is present, attempt Gemini multi-model call
        const rawKey = sessionApiKey || req.body.apiKey || req.headers['x-gemini-key'] || '';
        const key = typeof rawKey === 'string' ? rawKey.trim() : '';
        const hasValidKey = Boolean(key && !key.includes('•') && key.length > 15);

        if (hasValidKey) {
            try {
                const ai = new GoogleGenAI({ apiKey: key });
                const prompt = `
You are Fintrack's expert, friendly personal financial advisor. 
Answer the user's question with specific, actionable, encouraging advice grounded in their actual financial data below.
Use HTML tags like <p>, <strong>, <ul>, and <li> for formatting.
Do not use markdown symbols like * or # - return clean HTML paragraphs and lists directly.
Never recommend high-risk crypto or speculative trading. Keep the tone professional, supportive, and practical.

CRITICAL INSTRUCTION:
- Do NOT always mention or recite the user's total balance, account total, or net worth unless the user explicitly asks about their balance, account total, or net worth.
- Answer the user's specific question completely, focusing on the specific categories, expenses, budgets, or advice they asked for.

${financialContext}

USER QUESTION: "${message.trim()}"
                `.trim();

                const callPromise = ai.models.generateContent({
                    model: MODEL_NAME,
                    contents: prompt
                });
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('AI generation timed out after 12s')), 12000)
                );
                const response = await Promise.race([callPromise, timeoutPromise]);

                if (response && response.text) {
                    return res.json({
                        success: true,
                        reply: response.text.trim(),
                        source: 'gemini',
                        model: MODEL_NAME
                    });
                }
            } catch (geminiError) {
                console.warn('[Gemini Fallback to Data Engine]:', geminiError.message);
                // When Gemini model is overloaded or fails, smoothly proceed to Data-Grounded Engine below
            }
        }

        // 3. Data-Grounded Financial Intelligence Engine (Runs when no API key or when cloud models are busy)
        const q = message.toLowerCase();
        let fallbackReply = '';

        if (q.includes('where') || q.includes('spend') || q.includes('expense') || q.includes('cost') || q.includes('purchase')) {
            if (topCategories) {
                fallbackReply = `<p>Based on your logged transactions, your highest spending categories are:</p><p><strong>${topCategories}</strong></p><p>Total recorded expenses stand at <strong>${currency} ${totalExpense.toLocaleString()}</strong> across ${transactions.length} transactions.</p><p>💡 <em>Tip: Reviewing recurring purchases in your top category often reveals quick ways to cut discretionary spending!</em></p>`;
            } else {
                fallbackReply = `<p>You haven't recorded any expenses yet! Once you log daily expenses or import a bank statement, I will provide a deep category breakdown.</p>`;
            }
        } else if (q.includes('save') || q.includes('goal') || q.includes('cut') || q.includes('reduce')) {
            fallbackReply = `<p>Here is your tailored savings analysis:</p><ul><li>Your current savings rate is <strong>${savingsRate}%</strong>.</li><li>Target recommendation: aim for a <strong>20% to 30%</strong> savings rate.</li>${goals.length ? `<li>You have <strong>${goals.length}</strong> active savings goal(s). Contributing just 10% of your earnings on payday accelerates your milestones!</li>` : '<li>Consider setting up a targeted savings goal in the Budgets & Goals tab to keep track of your emergency fund.</li>'}</ul>`;
        } else if (q.includes('budget') || q.includes('over') || q.includes('limit') || q.includes('cap')) {
            const overBudgets = budgets.filter(b => (categoryMap[b.category] || 0) >= b.monthly_limit);
            if (overBudgets.length > 0) {
                fallbackReply = `<p>⚠️ <strong>Budget Attention Needed:</strong></p><p>The following categories have reached or exceeded your monthly caps:</p><ul>${overBudgets.map(b => `<li><strong>${b.category}:</strong> Spent ${currency} ${(categoryMap[b.category] || 0).toLocaleString()} (Limit: ${currency} ${Number(b.monthly_limit).toLocaleString()})</li>`).join('')}</ul>`;
            } else if (budgets.length > 0) {
                fallbackReply = `<p>✅ <strong>Budget Health: Strong!</strong></p><p>All of your <strong>${budgets.length}</strong> active category budgets are within their monthly limits.</p>`;
            } else {
                fallbackReply = `<p>You haven't set any monthly category budgets yet. Creating budgets in the <strong>Budgets & Goals</strong> tab helps prevent overspending before month-end!</p>`;
            }
        } else if (q.includes('balance') || q.includes('net') || q.includes('how much do i have')) {
            fallbackReply = `<p>Your current financial ledger balance is <strong>${currency} ${netBalance.toLocaleString()}</strong> (Income: ${currency} ${totalIncome.toLocaleString()} &bull; Expenses: ${currency} ${totalExpense.toLocaleString()}).</p>`;
        } else if (q.includes('transaction') || q.includes('recent') || q.includes('last')) {
            if (transactions.length > 0) {
                fallbackReply = `<p>Here are your most recent recorded transactions:</p><ul>${transactions.slice(0, 5).map(t => `<li><strong>${t.date}</strong> &bull; ${t.title}: <span style="color: ${t.type === 'income' ? 'var(--income)' : 'var(--expense)'}; font-weight: 600;">${t.type === 'income' ? '+' : '-'}${currency} ${Number(t.amount).toLocaleString()}</span> (${t.category})</li>`).join('')}</ul>`;
            } else {
                fallbackReply = `<p>No transactions logged yet. Click <strong>Add Transaction</strong> or upload a statement to get started!</p>`;
            }
        } else {
            fallbackReply = `<p>I have analyzed your live financial data:</p><ul><li><strong>Top Spending Categories:</strong> ${topCategories || 'None recorded yet'}</li><li><strong>Active Budgets:</strong> ${budgets.length ? `${budgets.length} categories monitored` : 'No limits set'}</li><li><strong>Savings Goals:</strong> ${goals.length ? `${goals.length} target(s) tracked` : 'No active targets'}</li></ul><p>Feel free to ask me specific questions like: <em>"Where did I spend the most?"</em>, <em>"How can I cut expenses?"</em>, or <em>"Check my budget limits."</em></p>`;
        }

        return res.json({
            success: true,
            reply: fallbackReply,
            model: 'fintrack-data-grounded',
            source: 'data_grounded'
        });

        res.json({
            success: true,
            reply: fallbackReply,
            model: 'fintrack-local-rules',
            source: 'local_engine'
        });
    } catch (error) {
        console.error('AI Advisor Controller Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process AI chat message.',
            error: error.message
        });
    }
}

module.exports = {
    testApiKey,
    getAvailableModels,
    chatWithAdvisor
};
