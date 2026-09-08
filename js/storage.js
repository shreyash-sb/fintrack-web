/**
 * Fintrack - Data Storage & Core State Management Layer
 */

const STORAGE_KEYS = {
    USERS: 'fintrack_users',
    CURRENT_USER: 'fintrack_current_user',
    THEME: 'fintrack_theme',
    CURRENCY: 'fintrack_currency'
};

// Default Categories with FontAwesome icons & vibrant colors
const CATEGORIES = {
    expense: [
        { id: 'food', name: 'Food & Dining', icon: 'fa-utensils', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
        { id: 'transport', name: 'Transportation', icon: 'fa-car', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
        { id: 'housing', name: 'Housing & Rent', icon: 'fa-home', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
        { id: 'bills', name: 'Bills & Utilities', icon: 'fa-bolt', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
        { id: 'shopping', name: 'Shopping', icon: 'fa-bag-shopping', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
        { id: 'entertainment', name: 'Entertainment', icon: 'fa-film', color: '#f43f5e', bg: 'rgba(244, 63, 94, 0.15)' },
        { id: 'health', name: 'Health & Medical', icon: 'fa-heart-pulse', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' },
        { id: 'education', name: 'Education', icon: 'fa-graduation-cap', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },
        { id: 'travel', name: 'Travel & Trips', icon: 'fa-plane', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)' },
        { id: 'other_expense', name: 'Other Expense', icon: 'fa-receipt', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.15)' }
    ],
    income: [
        { id: 'salary', name: 'Salary', icon: 'fa-money-bill-wave', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
        { id: 'freelance', name: 'Freelance & Side Gig', icon: 'fa-laptop-code', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
        { id: 'investments', name: 'Investments & Dividends', icon: 'fa-chart-line', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)' },
        { id: 'business', name: 'Business Income', icon: 'fa-briefcase', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)' },
        { id: 'gifts', name: 'Gifts & Rewards', icon: 'fa-gift', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)' },
        { id: 'other_income', name: 'Other Income', icon: 'fa-vault', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)' }
    ]
};

const PAYMENT_METHODS = [
    { id: 'upi', name: 'UPI / Digital Wallet', icon: 'fa-mobile-screen-button' },
    { id: 'credit_card', name: 'Credit Card', icon: 'fa-credit-card' },
    { id: 'debit_card', name: 'Debit Card', icon: 'fa-id-card' },
    { id: 'net_banking', name: 'Net Banking', icon: 'fa-building-columns' },
    { id: 'cash', name: 'Cash', icon: 'fa-wallet' },
    { id: 'other', name: 'Other', icon: 'fa-receipt' }
];

const CURRENCIES = {
    INR: { symbol: '₹', code: 'INR', locale: 'en-IN', name: 'Indian Rupee (₹)' },
    USD: { symbol: '$', code: 'USD', locale: 'en-US', name: 'US Dollar ($)' },
    EUR: { symbol: '€', code: 'EUR', locale: 'de-DE', name: 'Euro (€)' },
    GBP: { symbol: '£', code: 'GBP', locale: 'en-GB', name: 'British Pound (£)' },
    JPY: { symbol: '¥', code: 'JPY', locale: 'ja-JP', name: 'Japanese Yen (¥)' },
    CAD: { symbol: 'CA$', code: 'CAD', locale: 'en-CA', name: 'Canadian Dollar (CA$)' },
    AUD: { symbol: 'A$', code: 'AUD', locale: 'en-AU', name: 'Australian Dollar (A$)' },
    AED: { symbol: 'AED', code: 'AED', locale: 'ar-AE', name: 'UAE Dirham (AED)' }
};

const StorageManager = {
    // Current User
    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER));
        } catch {
            return null;
        }
    },

    setCurrentUser(user) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    },

    clearCurrentUser() {
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    },

    // User Directory
    getUsers() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || [];
        } catch {
            return [];
        }
    },

    saveUsers(users) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    },

    getUserDataKey(email, dataType) {
        const safeEmail = (email || 'guest').toLowerCase().replace(/[^a-z0-9]/g, '_');
        return `fintrack_data_${safeEmail}_${dataType}`;
    },

    // Transactions CRUD
    getTransactions(email) {
        const key = this.getUserDataKey(email, 'transactions');
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    },

    saveTransactions(email, transactions) {
        const key = this.getUserDataKey(email, 'transactions');
        localStorage.setItem(key, JSON.stringify(transactions));
    },

    addTransaction(email, transaction) {
        const list = this.getTransactions(email);
        const newTransaction = {
            id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            createdAt: new Date().toISOString(),
            date: transaction.date || new Date().toISOString().split('T')[0],
            ...transaction
        };
        list.unshift(newTransaction);
        this.saveTransactions(email, list);
        return newTransaction;
    },

    updateTransaction(email, id, updatedData) {
        const list = this.getTransactions(email);
        const index = list.findIndex(t => t.id === id);
        if (index !== -1) {
            list[index] = { ...list[index], ...updatedData, updatedAt: new Date().toISOString() };
            this.saveTransactions(email, list);
            return list[index];
        }
        return null;
    },

    deleteTransaction(email, id) {
        let list = this.getTransactions(email);
        const deleted = list.find(t => t.id === id);
        list = list.filter(t => t.id !== id);
        this.saveTransactions(email, list);
        return deleted;
    },

    clearAllTransactions(email) {
        this.saveTransactions(email, []);
    },

    // Budgets
    getBudgets(email) {
        const key = this.getUserDataKey(email, 'budgets');
        try {
            return JSON.parse(localStorage.getItem(key)) || {};
        } catch {
            return {};
        }
    },

    saveBudgets(email, budgets) {
        const key = this.getUserDataKey(email, 'budgets');
        localStorage.setItem(key, JSON.stringify(budgets));
    },

    // Savings Goals
    getSavingsGoals(email) {
        const key = this.getUserDataKey(email, 'savings_goals');
        try {
            return JSON.parse(localStorage.getItem(key)) || [];
        } catch {
            return [];
        }
    },

    saveSavingsGoals(email, goals) {
        const key = this.getUserDataKey(email, 'savings_goals');
        localStorage.setItem(key, JSON.stringify(goals));
    },

    addSavingsGoal(email, goal) {
        const goals = this.getSavingsGoals(email);
        const newGoal = {
            id: 'goal_' + Date.now(),
            current: 0,
            color: goal.color || '#6366f1',
            ...goal
        };
        goals.push(newGoal);
        this.saveSavingsGoals(email, goals);
        return newGoal;
    },

    updateSavingsGoal(email, id, deltaAmount) {
        const goals = this.getSavingsGoals(email);
        const goal = goals.find(g => g.id === id);
        if (goal) {
            goal.current = Math.max(0, Math.min(goal.target, (goal.current || 0) + Number(deltaAmount)));
            this.saveSavingsGoals(email, goals);
            return goal;
        }
        return null;
    },

    deleteSavingsGoal(email, id) {
        let goals = this.getSavingsGoals(email);
        goals = goals.filter(g => g.id !== id);
        this.saveSavingsGoals(email, goals);
    },

    // Settings (Currency & Theme)
    getUserCurrency(email) {
        const user = this.getCurrentUser();
        return user?.currency || localStorage.getItem(STORAGE_KEYS.CURRENCY) || 'INR';
    },

    setUserCurrency(currencyCode) {
        localStorage.setItem(STORAGE_KEYS.CURRENCY, currencyCode);
        const user = this.getCurrentUser();
        if (user) {
            user.currency = currencyCode;
            this.setCurrentUser(user);
            const users = this.getUsers();
            const idx = users.findIndex(u => u.email.toLowerCase() === user.email.toLowerCase());
            if (idx !== -1) {
                users[idx].currency = currencyCode;
                this.saveUsers(users);
            }
        }
    },

    getUserTheme() {
        return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
    },

    setUserTheme(theme) {
        localStorage.setItem(STORAGE_KEYS.THEME, theme);
        document.documentElement.setAttribute('data-theme', theme);
    },

    // Formatters
    formatCurrency(amount, currencyCode = null) {
        const code = currencyCode || this.getUserCurrency();
        const info = CURRENCIES[code] || CURRENCIES.INR;
        const num = Number(amount) || 0;
        
        try {
            return new Intl.NumberFormat(info.locale, {
                style: 'currency',
                currency: info.code,
                maximumFractionDigits: 0
            }).format(num);
        } catch {
            return `${info.symbol}${num.toLocaleString()}`;
        }
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    },

    // Category Lookup
    getCategory(type, categoryId) {
        const list = CATEGORIES[type] || [];
        const found = list.find(c => c.id === categoryId);
        if (found) return found;

        // Fallback search in all categories
        const all = [...CATEGORIES.expense, ...CATEGORIES.income];
        return all.find(c => c.id === categoryId) || {
            id: categoryId || 'other',
            name: categoryId ? categoryId.replace(/_/g, ' ') : 'General',
            icon: type === 'income' ? 'fa-wallet' : 'fa-receipt',
            color: type === 'income' ? '#10b981' : '#f43f5e',
            bg: 'rgba(100, 116, 139, 0.15)'
        };
    },

    getPaymentMethod(id) {
        return PAYMENT_METHODS.find(p => p.id === id) || {
            id: 'other',
            name: 'Other',
            icon: 'fa-receipt'
        };
    },

    // Demo Data Seeder
    seedDemoData(email) {
        const now = new Date();
        const getDateStr = (daysAgo) => {
            const d = new Date(now);
            d.setDate(d.getDate() - daysAgo);
            return d.toISOString().split('T')[0];
        };

        const demoTransactions = [
            {
                id: 'tx_demo_1',
                title: 'Monthly Tech Lead Salary',
                amount: 85000,
                type: 'income',
                category: 'salary',
                paymentMethod: 'net_banking',
                date: getDateStr(2),
                notes: 'Base salary after tax deductions'
            },
            {
                id: 'tx_demo_2',
                title: 'Fullstack Freelance Project',
                amount: 32000,
                type: 'income',
                category: 'freelance',
                paymentMethod: 'net_banking',
                date: getDateStr(8),
                notes: 'Milestone 2 payment for SaaS dashboard'
            },
            {
                id: 'tx_demo_3',
                title: 'Stock Dividend Payout',
                amount: 4500,
                type: 'income',
                category: 'investments',
                paymentMethod: 'net_banking',
                date: getDateStr(15),
                notes: 'Q3 tech index dividend'
            },
            {
                id: 'tx_demo_4',
                title: 'Apartment Monthly Rent',
                amount: 22000,
                type: 'expense',
                category: 'housing',
                paymentMethod: 'net_banking',
                date: getDateStr(3),
                notes: 'October flat rent + maintenance'
            },
            {
                id: 'tx_demo_5',
                title: 'Supermarket Grocery Run',
                amount: 4250,
                type: 'expense',
                category: 'food',
                paymentMethod: 'credit_card',
                date: getDateStr(4),
                notes: 'Weekly pantry & fresh produce'
            },
            {
                id: 'tx_demo_6',
                title: 'Dinner at Olive Bistro',
                amount: 2180,
                type: 'expense',
                category: 'food',
                paymentMethod: 'upi',
                date: getDateStr(6),
                notes: 'Dinner with college friends'
            },
            {
                id: 'tx_demo_7',
                title: 'Electricity & High-speed Wifi',
                amount: 3100,
                type: 'expense',
                category: 'bills',
                paymentMethod: 'upi',
                date: getDateStr(9),
                notes: 'Power bill and 300Mbps fiber internet'
            },
            {
                id: 'tx_demo_8',
                title: 'Mechanical Keyboard & Desk Mat',
                amount: 6800,
                type: 'expense',
                category: 'shopping',
                paymentMethod: 'credit_card',
                date: getDateStr(11),
                notes: 'Keychron wireless keyboard setup'
            },
            {
                id: 'tx_demo_9',
                title: 'Uber Rides to City Center',
                amount: 850,
                type: 'expense',
                category: 'transport',
                paymentMethod: 'upi',
                date: getDateStr(12),
                notes: 'Office commute & client visit'
            },
            {
                id: 'tx_demo_10',
                title: 'Netflix & Spotify Premium',
                amount: 1199,
                type: 'expense',
                category: 'entertainment',
                paymentMethod: 'credit_card',
                date: getDateStr(14),
                notes: 'Monthly digital subscriptions'
            },
            {
                id: 'tx_demo_11',
                title: 'Gym Membership Renewal',
                amount: 3500,
                type: 'expense',
                category: 'health',
                paymentMethod: 'debit_card',
                date: getDateStr(18),
                notes: 'Monthly fitness center access'
            },
            {
                id: 'tx_demo_12',
                title: 'Udemy System Design Course',
                amount: 1499,
                type: 'expense',
                category: 'education',
                paymentMethod: 'credit_card',
                date: getDateStr(22),
                notes: 'Advanced distributed systems architecture'
            },
            {
                id: 'tx_demo_13',
                title: 'Fuel & Car Maintenance',
                amount: 2400,
                type: 'expense',
                category: 'transport',
                paymentMethod: 'credit_card',
                date: getDateStr(25),
                notes: 'Full tank petrol & tyre pressure check'
            }
        ];

        this.saveTransactions(email, demoTransactions);

        const demoBudgets = {
            food: 8000,
            transport: 4000,
            housing: 25000,
            bills: 5000,
            shopping: 8000,
            entertainment: 3000,
            health: 4000
        };
        this.saveBudgets(email, demoBudgets);
    },

    // CSV Export
    exportToCSV(transactions, currencyCode) {
        const symbol = (CURRENCIES[currencyCode] || CURRENCIES.INR).symbol;
        const headers = ['ID', 'Date', 'Title', 'Type', 'Category', 'Payment Method', `Amount (${symbol})`, 'Notes'];
        
        const rows = transactions.map(t => [
            `"${t.id}"`,
            `"${t.date}"`,
            `"${(t.title || '').replace(/"/g, '""')}"`,
            `"${t.type.toUpperCase()}"`,
            `"${this.getCategory(t.type, t.category).name}"`,
            `"${this.getPaymentMethod(t.paymentMethod).name}"`,
            t.amount,
            `"${(t.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Fintrack_Report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // JSON Export
    exportToJSON(email) {
        const data = {
            version: '2.0',
            exportedAt: new Date().toISOString(),
            user: this.getCurrentUser(),
            transactions: this.getTransactions(email),
            budgets: this.getBudgets(email),
            savingsGoals: this.getSavingsGoals(email)
        };

        const jsonStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(data, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', jsonStr);
        link.setAttribute('download', `Fintrack_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    },

    // JSON Import
    importFromJSON(jsonText, email) {
        try {
            const data = JSON.parse(jsonText);
            if (Array.isArray(data.transactions)) {
                this.saveTransactions(email, data.transactions);
            }
            if (data.budgets && typeof data.budgets === 'object') {
                this.saveBudgets(email, data.budgets);
            }
            if (Array.isArray(data.savingsGoals)) {
                this.saveSavingsGoals(email, data.savingsGoals);
            }
            return { success: true, count: data.transactions ? data.transactions.length : 0 };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
};

window.StorageManager = StorageManager;
window.CATEGORIES = CATEGORIES;
window.PAYMENT_METHODS = PAYMENT_METHODS;
window.CURRENCIES = CURRENCIES;
