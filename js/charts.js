/**
 * Fintrack - Financial Analytics & Visualizations Layer (Chart.js)
 */

class ChartController {
    constructor() {
        this.cashflowChart = null;
        this.categoryChart = null;
    }

    isDarkMode() {
        return document.documentElement.getAttribute('data-theme') !== 'light';
    }

    getThemeColors() {
        const dark = this.isDarkMode();
        return {
            textColor: dark ? '#94a3b8' : '#64748b',
            headingColor: dark ? '#f8fafc' : '#0f172a',
            gridColor: dark ? 'rgba(148, 163, 184, 0.08)' : 'rgba(100, 116, 139, 0.12)',
            tooltipBg: dark ? '#1e293b' : '#ffffff',
            tooltipText: dark ? '#f8fafc' : '#0f172a',
            tooltipBorder: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
        };
    }

    initOrUpdateCharts(transactions) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js library not loaded yet');
            return;
        }

        this.renderCashflowChart(transactions);
        this.renderCategoryChart(transactions);
    }

    renderCashflowChart(transactions) {
        const canvas = document.getElementById('cashflowChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const theme = this.getThemeColors();

        // Aggregate last 6 months or 7 days of transactions
        const monthlyData = {};
        const months = [];
        const now = new Date();

        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            months.push(key);
            monthlyData[key] = { income: 0, expense: 0 };
        }

        transactions.forEach(t => {
            const tDate = new Date(t.date || t.createdAt);
            const key = tDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            if (monthlyData[key]) {
                if (t.type === 'income') {
                    monthlyData[key].income += Number(t.amount);
                } else {
                    monthlyData[key].expense += Number(t.amount);
                }
            }
        });

        const incomeDataset = months.map(m => monthlyData[m].income);
        const expenseDataset = months.map(m => monthlyData[m].expense);

        if (this.cashflowChart) {
            this.cashflowChart.destroy();
        }

        this.cashflowChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeDataset,
                        backgroundColor: 'rgba(16, 185, 129, 0.85)',
                        borderColor: '#10b981',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        barPercentage: 0.65,
                        categoryPercentage: 0.7
                    },
                    {
                        label: 'Expense',
                        data: expenseDataset,
                        backgroundColor: 'rgba(244, 63, 94, 0.85)',
                        borderColor: '#f43f5e',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        barPercentage: 0.65,
                        categoryPercentage: 0.7
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: {
                        position: 'top',
                        labels: {
                            color: theme.headingColor,
                            font: { family: 'Plus Jakarta Sans', size: 12, weight: '600' },
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 15
                        }
                    },
                    tooltip: {
                        backgroundColor: theme.tooltipBg,
                        titleColor: theme.tooltipText,
                        bodyColor: theme.textColor,
                        borderColor: theme.tooltipBorder,
                        borderWidth: 1,
                        padding: 12,
                        boxPadding: 6,
                        usePointStyle: true,
                        callbacks: {
                            label: function (context) {
                                return ` ${context.dataset.label}: ${window.StorageManager ? window.StorageManager.formatCurrency(context.raw) : context.raw}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: theme.textColor,
                            font: { family: 'Plus Jakarta Sans', size: 11 }
                        }
                    },
                    y: {
                        grid: { color: theme.gridColor },
                        ticks: {
                            color: theme.textColor,
                            font: { family: 'Plus Jakarta Sans', size: 11 },
                            callback: function (val) {
                                if (val >= 1000) return (val / 1000) + 'k';
                                return val;
                            }
                        }
                    }
                }
            }
        });
    }

    renderCategoryChart(transactions) {
        const canvas = document.getElementById('categoryChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const theme = this.getThemeColors();

        // Calculate total expenses grouped by category
        const categoryTotals = {};
        let totalExpense = 0;

        transactions
            .filter(t => t.type === 'expense')
            .forEach(t => {
                const catId = t.category || 'other_expense';
                categoryTotals[catId] = (categoryTotals[catId] || 0) + Number(t.amount);
                totalExpense += Number(t.amount);
            });

        const labels = [];
        const data = [];
        const backgroundColors = [];

        Object.entries(categoryTotals)
            .sort((a, b) => b[1] - a[1])
            .forEach(([catId, amount]) => {
                const cat = window.StorageManager ? window.StorageManager.getCategory('expense', catId) : { name: catId, color: '#6366f1' };
                labels.push(cat.name);
                data.push(amount);
                backgroundColors.push(cat.color);
            });

        const emptyPlaceholder = data.length === 0;
        const finalLabels = emptyPlaceholder ? ['No Expense Data'] : labels;
        const finalData = emptyPlaceholder ? [1] : data;
        const finalColors = emptyPlaceholder ? ['rgba(148, 163, 184, 0.2)'] : backgroundColors;

        if (this.categoryChart) {
            this.categoryChart.destroy();
        }

        this.categoryChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: finalLabels,
                datasets: [{
                    data: finalData,
                    backgroundColor: finalColors,
                    borderColor: this.isDarkMode() ? '#1e293b' : '#ffffff',
                    borderWidth: 2,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '72%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: theme.headingColor,
                            font: { family: 'Plus Jakarta Sans', size: 11, weight: '500' },
                            usePointStyle: true,
                            pointStyle: 'circle',
                            padding: 10,
                            generateLabels: function (chart) {
                                if (emptyPlaceholder) return [];
                                const dataset = chart.data.datasets[0];
                                return chart.data.labels.map((label, i) => {
                                    const value = dataset.data[i];
                                    const percentage = totalExpense > 0 ? Math.round((value / totalExpense) * 100) : 0;
                                    return {
                                        text: `${label} (${percentage}%)`,
                                        fillStyle: dataset.backgroundColor[i],
                                        hidden: false,
                                        index: i
                                    };
                                });
                            }
                        }
                    },
                    tooltip: {
                        enabled: !emptyPlaceholder,
                        backgroundColor: theme.tooltipBg,
                        titleColor: theme.tooltipText,
                        bodyColor: theme.textColor,
                        borderColor: theme.tooltipBorder,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: function (context) {
                                const val = context.raw;
                                const pct = totalExpense > 0 ? ((val / totalExpense) * 100).toFixed(1) : 0;
                                const formatted = window.StorageManager ? window.StorageManager.formatCurrency(val) : val;
                                return ` ${context.label}: ${formatted} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    destroyCharts() {
        if (this.cashflowChart) this.cashflowChart.destroy();
        if (this.categoryChart) this.categoryChart.destroy();
    }
}

window.ChartController = new ChartController();
