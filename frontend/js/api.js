/**
 * Fintrack - Centralized API Service Client
 */
const ApiService = {
    getToken: () => localStorage.getItem('fintrack_token'),
    setToken: (t) => localStorage.setItem('fintrack_token', t),
    clearToken: () => localStorage.removeItem('fintrack_token'),

    async request(endpoint, options = {}) {
        const token = this.getToken();
        const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData;
        const headers = isForm ? { ...(options.headers || {}) } : { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const sessionKey = (typeof window !== 'undefined' && window.getSessionGeminiKey) ? window.getSessionGeminiKey() : '';
        if (sessionKey && typeof sessionKey === 'string' && !sessionKey.includes('•') && sessionKey.length > 15) {
            headers['x-gemini-key'] = sessionKey;
        }

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeoutMs = options.timeout || 12000;
        const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

        try {
            const fetchOpts = { ...options, headers };
            if (controller) fetchOpts.signal = controller.signal;
            const res = await fetch(`/api${endpoint}`, fetchOpts);
            if (timeoutId) clearTimeout(timeoutId);
            if (res.status === 401 && !endpoint.startsWith('/auth/')) {
                this.clearToken();
                localStorage.removeItem('fintrack_current_user');
                window.location.href = 'index.html';
                throw new Error('Session expired. Please log in again.');
            }
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || data.error || `Request failed (${res.status})`);
            return data;
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('Verification timed out after 12s. Please check your internet connection.');
            }
            console.warn(`[API] ${options.method || 'GET'} ${endpoint}:`, err.message);
            throw err;
        }
    },

    checkHealth: () => ApiService.request('/health').catch(() => ({ status: 'offline', database: { connected: false } })),

    auth: {
        register: (u) => ApiService.request('/auth/register', { method: 'POST', body: JSON.stringify(u) }),
        login: (c) => ApiService.request('/auth/login', { method: 'POST', body: JSON.stringify(c) }),
        getProfile: () => ApiService.request('/auth/me'),
        updateProfile: (p) => ApiService.request('/auth/profile', { method: 'PUT', body: JSON.stringify(p) }),
        changePassword: (d) => ApiService.request('/auth/change-password', { method: 'PUT', body: JSON.stringify(d) }),
        deleteAccount: (d) => ApiService.request('/auth/account', { method: 'DELETE', body: JSON.stringify(d) })
    },

    transactions: {
        getAll: (p = {}) => ApiService.request(`/transactions?${new URLSearchParams(p)}`),
        getSummary: () => ApiService.request('/transactions/summary'),
        uploadReceipt: (file) => {
            const fd = new FormData();
            fd.append('receipt', file);
            return ApiService.request('/transactions/upload-receipt', { method: 'POST', body: fd });
        },
        create: (tx) => ApiService.request('/transactions', { method: 'POST', body: JSON.stringify(tx) }),
        update: (id, u) => ApiService.request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(u) }),
        delete: (id) => ApiService.request(`/transactions/${id}`, { method: 'DELETE' }),
        bulkImport: (txs) => ApiService.request('/transactions/bulk', { method: 'POST', body: JSON.stringify({ transactions: txs }) })
    },

    budgets: {
        getAll: () => ApiService.request('/budgets'),
        set: (cat, limit) => ApiService.request('/budgets', { method: 'POST', body: JSON.stringify({ category: cat, limit }) }),
        setAll: (b) => ApiService.request('/budgets', { method: 'POST', body: JSON.stringify({ budgets: b }) }),
        delete: (cat) => ApiService.request(`/budgets/${cat}`, { method: 'DELETE' })
    },

    goals: {
        getAll: () => ApiService.request('/goals'),
        create: (g) => ApiService.request('/goals', { method: 'POST', body: JSON.stringify(g) }),
        deposit: (id, amt) => ApiService.request(`/goals/${id}/deposit`, { method: 'POST', body: JSON.stringify({ amount: amt }) }),
        delete: (id) => ApiService.request(`/goals/${id}`, { method: 'DELETE' })
    },

    statements: {
        upload: (file) => {
            const fd = new FormData();
            fd.append('statement', file);
            return ApiService.request('/statements/upload', { method: 'POST', body: fd });
        },
        analyze: (id, customDates = {}) => {
            const key = (typeof window !== 'undefined' && window.getSessionGeminiKey) ? window.getSessionGeminiKey() : '';
            return ApiService.request(`/statements/${id}/analyze`, {
                method: 'POST',
                body: JSON.stringify({ ...customDates, apiKey: key })
            });
        },
        getPreview: (id) => ApiService.request(`/statements/${id}/preview`),
        reconcile: (id, payload) => ApiService.request(`/statements/${id}/reconcile`, { method: 'POST', body: JSON.stringify(payload) }),
        confirm: (id, payload) => ApiService.request(`/statements/${id}/confirm`, { method: 'POST', body: JSON.stringify(payload) }),
        getHistory: () => ApiService.request('/statements/history'),
        getById: (id) => ApiService.request(`/statements/${id}`),
        rollback: (id) => ApiService.request(`/statements/${id}/rollback`, { method: 'POST' })
    },

    ai: {
        testKey: (apiKey) => {
            return ApiService.request('/ai/test-key', {
                method: 'POST',
                body: JSON.stringify({ apiKey })
            });
        },
        getModels: () => ApiService.request('/ai/models'),
        chat: (message, sessionApiKey) => {
            const key = sessionApiKey || ((typeof window !== 'undefined' && window.getSessionGeminiKey) ? window.getSessionGeminiKey() : '');
            return ApiService.request('/ai/chat', {
                method: 'POST',
                body: JSON.stringify({ message, sessionApiKey: key })
            });
        }
    }
};

window.ApiService = ApiService;
