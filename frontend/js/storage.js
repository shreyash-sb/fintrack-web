/**
 * Fintrack - Core State & Storage Layer
 */
const CATEGORIES = {
    expense: [
        { id: 'food', name: 'Food & Dining', icon: 'fa-utensils', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
        { id: 'transport', name: 'Transportation', icon: 'fa-car', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
        { id: 'housing', name: 'Housing & Rent', icon: 'fa-home', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
        { id: 'bills', name: 'Bills & Utilities', icon: 'fa-bolt', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' },
        { id: 'shopping', name: 'Shopping', icon: 'fa-bag-shopping', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
        { id: 'entertainment', name: 'Entertainment', icon: 'fa-film', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.12)' },
        { id: 'health', name: 'Health & Medical', icon: 'fa-heart-pulse', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' },
        { id: 'education', name: 'Education', icon: 'fa-graduation-cap', color: '#eab308', bg: 'rgba(234, 179, 8, 0.12)' },
        { id: 'travel', name: 'Travel & Trips', icon: 'fa-plane', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.12)' },
        { id: 'other_expense', name: 'Other Expense', icon: 'fa-receipt', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)' }
    ],
    income: [
        { id: 'salary', name: 'Salary', icon: 'fa-money-bill-wave', color: '#10b981', bg: 'rgba(16, 185, 129, 0.12)' },
        { id: 'freelance', name: 'Freelance & Side Gig', icon: 'fa-laptop-code', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)' },
        { id: 'investments', name: 'Investments & Dividends', icon: 'fa-chart-line', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.12)' },
        { id: 'business', name: 'Business Income', icon: 'fa-briefcase', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)' },
        { id: 'gifts', name: 'Gifts & Rewards', icon: 'fa-gift', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.12)' },
        { id: 'other_income', name: 'Other Income', icon: 'fa-vault', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.12)' }
    ]
};

const PAYMENT_METHODS = [
    { id: 'upi', name: 'UPI / Wallet', icon: 'fa-mobile-screen-button' },
    { id: 'credit_card', name: 'Credit Card', icon: 'fa-credit-card' },
    { id: 'debit_card', name: 'Debit Card', icon: 'fa-id-card' },
    { id: 'net_banking', name: 'Net Banking', icon: 'fa-building-columns' },
    { id: 'cash', name: 'Cash', icon: 'fa-wallet' },
    { id: 'other', name: 'Other', icon: 'fa-receipt' }
];

const CURRENCIES = {
    INR: { symbol: '₹', code: 'INR', locale: 'en-IN' },
    USD: { symbol: '$', code: 'USD', locale: 'en-US' },
    EUR: { symbol: '€', code: 'EUR', locale: 'de-DE' },
    GBP: { symbol: '£', code: 'GBP', locale: 'en-GB' },
    JPY: { symbol: '¥', code: 'JPY', locale: 'ja-JP' },
    CAD: { symbol: 'CA$', code: 'CAD', locale: 'en-CA' },
    AUD: { symbol: 'A$', code: 'AUD', locale: 'en-AU' },
    AED: { symbol: 'AED', code: 'AED', locale: 'ar-AE' }
};

const StorageManager = {
    _get: (k, def = null) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
    _set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
    _userKey: (email, type) => `fintrack_${(email || 'guest').toLowerCase().replace(/[^a-z0-9]/g, '_')}_${type}`,

    getCurrentUser: () => StorageManager._get('fintrack_current_user'),
    setCurrentUser: (u) => StorageManager._set('fintrack_current_user', u),
    clearCurrentUser: () => localStorage.removeItem('fintrack_current_user'),

    deleteUserAccount(email) {
        if (!email) return;
        localStorage.removeItem(this._userKey(email, 'transactions'));
        localStorage.removeItem(this._userKey(email, 'budgets'));
        localStorage.removeItem(this._userKey(email, 'savings_goals'));
        localStorage.removeItem(this._userKey(email, 'ai_history'));

        const users = this.getUsers().filter(u => u.email.toLowerCase() !== email.toLowerCase());
        this.saveUsers(users);

        this.clearCurrentUser();
        localStorage.removeItem('fintrack_token');
        localStorage.removeItem('fintrack_gemini_key');
        localStorage.removeItem('fintrack_gemini_model');
        localStorage.removeItem('fintrack_gemini_model_name');
    },

    getUsers: () => StorageManager._get('fintrack_users', []),
    saveUsers: (u) => StorageManager._set('fintrack_users', u),

    // Transactions
    getTransactions: (email) => StorageManager._get(StorageManager._userKey(email, 'transactions'), []),
    saveTransactions: (email, txs) => StorageManager._set(StorageManager._userKey(email, 'transactions'), txs),
    addTransaction(email, tx) {
        const list = this.getTransactions(email);
        const item = { id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, createdAt: new Date().toISOString(), ...tx };
        list.unshift(item);
        this.saveTransactions(email, list);
        return item;
    },
    updateTransaction(email, id, data) {
        const list = this.getTransactions(email);
        const idx = list.findIndex(t => t.id === id);
        if (idx !== -1) { list[idx] = { ...list[idx], ...data, updatedAt: new Date().toISOString() }; this.saveTransactions(email, list); return list[idx]; }
        return null;
    },
    deleteTransaction(email, id) {
        const list = this.getTransactions(email);
        const deleted = list.find(t => t.id === id);
        this.saveTransactions(email, list.filter(t => t.id !== id));
        return deleted;
    },
    clearAllTransactions: (email) => StorageManager.saveTransactions(email, []),

    // Budgets
    getBudgets: (email) => StorageManager._get(StorageManager._userKey(email, 'budgets'), {}),
    saveBudgets: (email, b) => StorageManager._set(StorageManager._userKey(email, 'budgets'), b),

    // Goals
    getSavingsGoals: (email) => StorageManager._get(StorageManager._userKey(email, 'goals'), []),
    saveSavingsGoals: (email, g) => StorageManager._set(StorageManager._userKey(email, 'goals'), g),
    addSavingsGoal(email, goal) {
        const list = this.getSavingsGoals(email);
        const item = { id: `goal_${Date.now()}`, current: 0, color: '#6366f1', ...goal };
        list.push(item);
        this.saveSavingsGoals(email, list);
        return item;
    },
    updateSavingsGoal(email, id, delta) {
        const list = this.getSavingsGoals(email);
        const g = list.find(x => x.id === id);
        if (g) {
            g.current = Math.max(0, Math.min(g.target, Number(g.current || 0) + Number(delta)));
            this.saveSavingsGoals(email, list);
            return g;
        }
        return null;
    },
    deleteSavingsGoal(email, id) {
        this.saveSavingsGoals(email, this.getSavingsGoals(email).filter(g => g.id !== id));
    },

    // AI Chat History (Persisted per user)
    getAiChatHistory(email) {
        return this._get(this._userKey(email, 'ai_history'), []);
    },
    saveAiChatHistory(email, history) {
        this._set(this._userKey(email, 'ai_history'), history);
    },
    clearAiChatHistory(email) {
        localStorage.removeItem(this._userKey(email, 'ai_history'));
    },

    // Preferences & Formatters
    getUserCurrency: () => StorageManager.getCurrentUser()?.currency || localStorage.getItem('fintrack_currency') || 'INR',
    setUserCurrency(c) {
        localStorage.setItem('fintrack_currency', c);
        const u = this.getCurrentUser();
        if (u) { u.currency = c; this.setCurrentUser(u); }
    },

    formatCurrency(amt, code = null) {
        const c = CURRENCIES[code || this.getUserCurrency()] || CURRENCIES.INR;
        try {
            return new Intl.NumberFormat(c.locale, { style: 'currency', currency: c.code, maximumFractionDigits: 0 }).format(Number(amt) || 0);
        } catch {
            return `${c.symbol}${Number(amt || 0).toLocaleString()}`;
        }
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return isNaN(d) ? dateStr : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    getCategory(type, catId) {
        const all = [...CATEGORIES.expense, ...CATEGORIES.income];
        return (CATEGORIES[type] || []).find(c => c.id === catId) || all.find(c => c.id === catId) || {
            id: catId || 'other', name: catId ? catId.replace(/_/g, ' ') : 'General', icon: 'fa-receipt', color: '#6366f1', bg: 'rgba(99, 102, 241, 0.12)'
        };
    },

    getCategories(type) {
        if (!type) return [...CATEGORIES.expense, ...CATEGORIES.income];
        return CATEGORIES[type] || [];
    },

    getPaymentMethod: (id) => PAYMENT_METHODS.find(p => p.id === id) || { id: 'other', name: 'Other', icon: 'fa-receipt' },

    getPaymentMethods() {
        return PAYMENT_METHODS;
    },

    getDistinctMonths(transactions) {
        const monthSet = new Set();
        const now = new Date();
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        monthSet.add(curKey);

        (transactions || []).forEach(t => {
            const raw = t.date || t.createdAt;
            if (raw) {
                const d = new Date(raw);
                if (!isNaN(d.getTime())) {
                    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    monthSet.add(k);
                }
            }
        });

        return Array.from(monthSet)
            .sort((a, b) => b.localeCompare(a))
            .map(k => {
                const [y, m] = k.split('-').map(Number);
                const d = new Date(y, m - 1, 1);
                const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
                return {
                    value: k,
                    label,
                    isCurrent: k === curKey,
                    year: y,
                    month: m
                };
            });
    },

    getFinancialSummary(email, targetPeriod = 'current') {
        const txs = this.getTransactions(email) || [];
        const now = new Date();
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const activeMonthKey = (!targetPeriod || targetPeriod === 'current') ? curKey : targetPeriod;

        let allTimeIncome = 0;
        let allTimeExpense = 0;

        let periodIncome = 0;
        let periodExpense = 0;
        let periodIncomeCount = 0;
        let periodExpenseCount = 0;
        const periodCatMap = {};

        txs.forEach(t => {
            const amt = parseFloat(t.amount || 0);
            const isInc = t.type === 'income' || t.type === 'credit';
            const isExp = t.type === 'expense' || t.type === 'debit';
            const isTransfer = t.type === 'transfer';

            if (isTransfer) return; // Own-account transfers are balance movements, not revenue/expense

            if (isInc) allTimeIncome += amt;
            else if (isExp) allTimeExpense += amt;

            // Check if transaction date matches the active target period
            let inPeriod = false;
            if (activeMonthKey === 'all') {
                inPeriod = true;
            } else {
                const raw = t.date || t.createdAt;
                if (raw) {
                    const d = new Date(raw);
                    if (!isNaN(d.getTime())) {
                        const txKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        inPeriod = (txKey === activeMonthKey);
                    }
                }
            }

            if (inPeriod) {
                if (isInc) {
                    periodIncome += amt;
                    periodIncomeCount++;
                } else if (isExp) {
                    periodExpense += amt;
                    periodExpenseCount++;
                    const c = t.category || 'other';
                    periodCatMap[c] = (periodCatMap[c] || 0) + amt;
                }
            }
        });

        // Net balance is cumulative all-time net cash on hand
        const netBalance = allTimeIncome - allTimeExpense;
        const periodSavingsRate = periodIncome > 0 ? Math.max(0, Math.round(((periodIncome - periodExpense) / periodIncome) * 100)) : 0;
        const categoryBreakdown = Object.entries(periodCatMap)
            .map(([category, amount]) => ({ category, amount }))
            .sort((a, b) => b.amount - a.amount);

        // Format user-facing period label
        let periodLabel = 'Current Month';
        if (activeMonthKey === 'all') {
            periodLabel = 'All Time';
        } else {
            const [y, m] = activeMonthKey.split('-').map(Number);
            const d = new Date(y, m - 1, 1);
            periodLabel = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        }

        const availableMonths = this.getDistinctMonths(txs);

        return {
            netBalance,
            totalIncome: periodIncome,
            totalExpense: periodExpense,
            savingsRate: periodSavingsRate,
            categoryBreakdown,
            allTimeIncome,
            allTimeExpense,
            periodKey: activeMonthKey,
            periodLabel,
            isCurrentMonth: activeMonthKey === curKey,
            periodIncomeCount,
            periodExpenseCount,
            availableMonths
        };
    },

    getBudgetProgress(email, targetPeriod = 'current') {
        const budgets = this.getBudgets(email) || {};
        const txs = this.getTransactions(email) || [];
        const now = new Date();
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const activeMonthKey = (!targetPeriod || targetPeriod === 'current') ? curKey : targetPeriod;

        const spentMap = {};
        txs.filter(t => t.type === 'expense').forEach(t => {
            let inPeriod = false;
            if (activeMonthKey === 'all') {
                inPeriod = true;
            } else {
                const raw = t.date || t.createdAt;
                if (raw) {
                    const d = new Date(raw);
                    if (!isNaN(d.getTime())) {
                        const txKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                        inPeriod = (txKey === activeMonthKey);
                    }
                }
            }

            if (inPeriod) {
                const c = t.category || 'other';
                spentMap[c] = (spentMap[c] || 0) + Number(t.amount || 0);
            }
        });

        return Object.entries(budgets)
            .filter(([_, limit]) => Number(limit) > 0)
            .map(([category, limit]) => {
                const numLimit = Number(limit);
                const spent = spentMap[category] || 0;
                const percentage = numLimit > 0 ? Math.round((spent / numLimit) * 100) : 0;
                return {
                    category,
                    limit: numLimit,
                    spent,
                    percentage,
                    isOverBudget: spent > numLimit
                };
            })
            .sort((a, b) => b.percentage - a.percentage);
    },

    // Export & Import
    exportToCSV(txsOrEmail, currencyCode) {
        const txs = Array.isArray(txsOrEmail) ? txsOrEmail : this.getTransactions(txsOrEmail);
        const curr = currencyCode || this.getUserCurrency();
        const symbol = (CURRENCIES[curr] || CURRENCIES.INR).symbol;
        const rows = [
            ['ID', 'Date', 'Title', 'Type', 'Category', 'Payment Method', `Amount (${symbol})`, 'Notes'].join(','),
            ...txs.map(t => [
                `"${t.id}"`, `"${t.date}"`, `"${(t.title || '').replace(/"/g, '""')}"`,
                `"${t.type.toUpperCase()}"`, `"${this.getCategory(t.type, t.category).name}"`,
                `"${this.getPaymentMethod(t.paymentMethod).name}"`, t.amount, `"${(t.notes || '').replace(/"/g, '""')}"`
            ].join(','))
        ];
        this._downloadFile(rows.join('\n'), `Fintrack_Export_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    },

    exportToJSON(email) {
        const data = {
            version: '2.0', exportedAt: new Date().toISOString(), user: this.getCurrentUser(),
            transactions: this.getTransactions(email), budgets: this.getBudgets(email), savingsGoals: this.getSavingsGoals(email)
        };
        this._downloadFile(JSON.stringify(data, null, 2), `Fintrack_Backup_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
    },

    importFromJSON(email, fileOrText, callback) {
        // Support both (jsonText, email) and (email, file, callback) signatures
        if (typeof fileOrText === 'string') {
            try {
                const data = JSON.parse(fileOrText);
                if (Array.isArray(data.transactions)) this.saveTransactions(email, data.transactions);
                if (data.budgets && typeof data.budgets === 'object') this.saveBudgets(email, data.budgets);
                if (Array.isArray(data.savingsGoals)) this.saveSavingsGoals(email, data.savingsGoals);
                if (callback) callback(null, data.transactions?.length || 0);
                return { success: true, count: data.transactions?.length || 0 };
            } catch (err) {
                if (callback) callback(err);
                return { success: false, error: err.message };
            }
        } else if (fileOrText && typeof fileOrText === 'object') {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (Array.isArray(data.transactions)) this.saveTransactions(email, data.transactions);
                    if (data.budgets && typeof data.budgets === 'object') this.saveBudgets(email, data.budgets);
                    if (Array.isArray(data.savingsGoals)) this.saveSavingsGoals(email, data.savingsGoals);
                    if (callback) callback(null, data.transactions?.length || 0);
                } catch (err) {
                    if (callback) callback(err);
                }
            };
            reader.onerror = () => { if (callback) callback(new Error('Failed to read file.')); };
            reader.readAsText(fileOrText);
        }
    },

    _downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(link.href);
    }
};

window.StorageManager = StorageManager;
window.CATEGORIES = CATEGORIES;
window.PAYMENT_METHODS = PAYMENT_METHODS;
window.CURRENCIES = CURRENCIES;
