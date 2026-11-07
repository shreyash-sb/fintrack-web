/**
 * Fintrack - Financial Analytics & Visualizations Layer (Chart.js)
 */
class ChartController {
    constructor() {
        this.cashflowChart = null;
        this.categoryChart = null;
    }

    isDarkMode = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    getTheme() {
        const dark = this.isDarkMode();
        return {
            text: dark ? '#94a3b8' : '#64748b',
            heading: dark ? '#f8fafc' : '#0f172a',
            grid: dark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(100, 116, 139, 0.1)',
            bg: dark ? '#1e293b' : '#ffffff',
            border: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'
        };
    }

    initOrUpdateCharts(transactions) {
        if (typeof Chart === 'undefined') return;
        this.renderCashflow(transactions);
        this.renderCategory(transactions);
    }

    renderCashflow(transactions) {
        const canvas = document.getElementById('cashflowChart');
        if (!canvas) return;
        const theme = this.getTheme();

        const months = [];
        const data = {};
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const k = new Date(now.getFullYear(), now.getMonth() - i, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            months.push(k);
            data[k] = { income: 0, expense: 0 };
        }

        transactions.forEach(t => {
            const k = new Date(t.date || t.createdAt).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            if (data[k]) data[k][t.type === 'income' ? 'income' : 'expense'] += Number(t.amount || 0);
        });

        if (this.cashflowChart) this.cashflowChart.destroy();

        this.cashflowChart = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    { label: 'Income', data: months.map(m => data[m].income), backgroundColor: 'rgba(16, 185, 129, 0.85)', borderRadius: 6, barPercentage: 0.65 },
                    { label: 'Expense', data: months.map(m => data[m].expense), backgroundColor: 'rgba(244, 63, 94, 0.85)', borderRadius: 6, barPercentage: 0.65 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { labels: { color: theme.heading, font: { family: 'Plus Jakarta Sans', weight: '600' } } },
                    tooltip: {
                        backgroundColor: theme.bg, titleColor: theme.heading, bodyColor: theme.text, borderColor: theme.border, borderWidth: 1,
                        callbacks: { label: (c) => ` ${c.dataset.label}: ${window.StorageManager ? window.StorageManager.formatCurrency(c.raw) : c.raw}` }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: theme.text } },
                    y: { grid: { color: theme.grid }, ticks: { color: theme.text, callback: (v) => v >= 1000 ? `${v / 1000}k` : v } }
                }
            }
        });
    }

    renderCategory(transactions, targetPeriod = 'current') {
        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        const theme = this.getTheme();

        const now = new Date();
        const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const activeKey = (!targetPeriod || targetPeriod === 'current') ? curKey : targetPeriod;

        const filteredTxs = (transactions || []).filter(t => {
            if (t.type !== 'expense') return false;
            if (activeKey === 'all') return true;
            const raw = t.date || t.createdAt;
            if (!raw) return false;
            const d = new Date(raw);
            if (isNaN(d.getTime())) return false;
            const txKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            return txKey === activeKey;
        });

        const totals = {};
        let totalExp = 0;
        filteredTxs.forEach(t => {
            const c = t.category || 'other_expense';
            totals[c] = (totals[c] || 0) + Number(t.amount || 0);
            totalExp += Number(t.amount || 0);
        });

        const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(([c]) => window.StorageManager?.getCategory('expense', c).name || c);
        const data = sorted.map(([_, a]) => a);
        const colors = sorted.map(([c]) => window.StorageManager?.getCategory('expense', c).color || '#6366f1');

        if (this.categoryChart) this.categoryChart.destroy();

        this.categoryChart = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['No Expenses in Period'],
                datasets: [{
                    data: data.length ? data : [1],
                    backgroundColor: colors.length ? colors : ['rgba(148, 163, 184, 0.2)'],
                    borderWidth: 2,
                    borderColor: this.isDarkMode() ? '#1e293b' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: { position: 'right', labels: { color: theme.heading, font: { family: 'Plus Jakarta Sans', size: 11 } } },
                    tooltip: {
                        enabled: data.length > 0,
                        backgroundColor: theme.bg, titleColor: theme.heading, bodyColor: theme.text, borderColor: theme.border, borderWidth: 1,
                        callbacks: {
                            label: (c) => ` ${c.label}: ${window.StorageManager?.formatCurrency(c.raw)} (${totalExp ? Math.round((c.raw / totalExp) * 100) : 0}%)`
                        }
                    }
                }
            }
        });
    }

    renderCashFlowChart(data, targetPeriod = 'current') {
        this.renderCashflow(window.activeTransactions || []);
    }

    renderCategoryChart(data, targetPeriod = 'current') {
        this.renderCategory(window.activeTransactions || [], targetPeriod);
    }
}

window.ChartController = new ChartController();
window.ChartManager = window.ChartController;
if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        window.ChartController.initOrUpdateCharts(window.activeTransactions || []);
    });
}
