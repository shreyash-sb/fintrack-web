/**
 * Fintrack - Dashboard Main Application Controller
 */

// Route Guard
const currentUser = window.StorageManager ? window.StorageManager.getCurrentUser() : null;
if (!currentUser) {
    window.location.href = 'index.html';
}

// Global UI State
let activeTransactions = [];
let lastDeletedTransaction = null;
let lastDeletedIndex = -1;

// Modal Helpers
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Toast Notification System
function showToast(type = 'info', title = '', message = '', onUndo = null) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-circle-xmark';
    else if (type === 'warning') iconClass = 'fa-triangle-exclamation';
    else if (type === 'info') iconClass = 'fa-circle-info';

    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <div class="toast-content">
            ${title ? `<strong>${title}</strong>` : ''}
            <span>${message}</span>
        </div>
        ${onUndo ? `<button class="toast-undo-btn"><i class="fa-solid fa-rotate-left"></i> Undo</button>` : ''}
    `;

    if (onUndo) {
        const undoBtn = toast.querySelector('.toast-undo-btn');
        undoBtn.addEventListener('click', () => {
            onUndo();
            toast.remove();
        });
    }

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 300);
    }, onUndo ? 6000 : 3500);
}

// Global Confirm Dialog
function showConfirm(title, message, onConfirm) {
    const modalTitle = document.getElementById('confirmModalTitle');
    const modalMsg = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('confirmModalOkBtn');

    if (modalTitle) modalTitle.textContent = title;
    if (modalMsg) modalMsg.textContent = message;

    // Clone button to remove older listeners
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);

    newOkBtn.addEventListener('click', () => {
        closeModal('confirmModal');
        onConfirm();
    });

    openModal('confirmModal');
}

// Main Dashboard Controller
document.addEventListener('DOMContentLoaded', () => {
    const email = currentUser.email;

    // Initialize User Info
    const userNameEl = document.getElementById('userName');
    const heroUserNameEl = document.getElementById('heroUserName');
    const userAvatarEl = document.getElementById('userAvatar');
    const currentDateSubtext = document.getElementById('currentDateSubtext');

    if (userNameEl) userNameEl.textContent = currentUser.name || 'User';
    if (heroUserNameEl) heroUserNameEl.textContent = currentUser.name ? currentUser.name.split(' ')[0] : 'Friend';
    if (userAvatarEl) userAvatarEl.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();

    if (currentDateSubtext) {
        const now = new Date();
        currentDateSubtext.textContent = `Financial pulse for ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.`;
    }

    // Initialize Theme Switcher
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const themeIcon = document.getElementById('themeIcon');
    const currentTheme = window.StorageManager.getUserTheme();
    document.documentElement.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const nowTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
            window.StorageManager.setUserTheme(nowTheme);
            updateThemeIcon(nowTheme);
            if (window.ChartController) {
                window.ChartController.initOrUpdateCharts(getFilteredTransactions());
            }
        });
    }

    function updateThemeIcon(theme) {
        if (!themeIcon) return;
        if (theme === 'light') {
            themeIcon.className = 'fa-regular fa-sun';
            themeIcon.style.color = '#f59e0b';
        } else {
            themeIcon.className = 'fa-regular fa-moon';
            themeIcon.style.color = '#94a3b8';
        }
    }

    // Initialize Currency Selector
    const currencySelector = document.getElementById('currencySelector');
    if (currencySelector) {
        currencySelector.value = window.StorageManager.getUserCurrency();
        currencySelector.addEventListener('change', (e) => {
            window.StorageManager.setUserCurrency(e.target.value);
            refreshDashboard();
            showToast('info', 'Currency Updated', `Switched display currency to ${e.target.value}`);
        });
    }

    // Populate Category Dropdowns
    populateCategoryDropdowns();
    populatePaymentMethodDropdown();
    populateCategoryFilterDropdown();

    // Modal Close Triggers (Light dismiss & ESC key)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeModal(overlay.id);
            }
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
        }
    });

    // Quick Action Button Triggers
    const openAddTxBtn = document.getElementById('openAddTransactionBtn');
    if (openAddTxBtn) {
        openAddTxBtn.addEventListener('click', () => {
            openTransactionModalForAdd();
        });
    }

    const openBudgetModalBtn = document.getElementById('openBudgetModalBtn');
    const editBudgetsQuickBtn = document.getElementById('editBudgetsQuickBtn');
    [openBudgetModalBtn, editBudgetsQuickBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                renderBudgetInputs();
                openModal('budgetModal');
            });
        }
    });

    const openGoalsModalBtn = document.getElementById('openGoalsModalBtn');
    const addGoalQuickBtn = document.getElementById('addGoalQuickBtn');
    [openGoalsModalBtn, addGoalQuickBtn].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                document.getElementById('goalForm').reset();
                openModal('goalModal');
            });
        }
    });

    const openExportModalBtn = document.getElementById('openExportModalBtn');
    if (openExportModalBtn) {
        openExportModalBtn.addEventListener('click', () => {
            openModal('exportModal');
        });
    }


    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            showConfirm(
                'Clear All Transactions?',
                'Are you sure you want to delete all transaction records? This cannot be undone.',
                () => {
                    window.StorageManager.clearAllTransactions(email);
                    refreshDashboard();
                    showToast('warning', 'Transactions Cleared', 'All transaction history has been removed.');
                }
            );
        });
    }

    // Modal: Transaction Type Toggle (Expense / Income)
    const typeExpenseBtn = document.getElementById('typeExpenseBtn');
    const typeIncomeBtn = document.getElementById('typeIncomeBtn');
    let currentSelectedType = 'expense';

    function setTransactionType(type) {
        currentSelectedType = type;
        if (type === 'expense') {
            typeExpenseBtn.classList.add('active', 'expense');
            typeIncomeBtn.classList.remove('active', 'income');
        } else {
            typeIncomeBtn.classList.add('active', 'income');
            typeExpenseBtn.classList.remove('active', 'expense');
        }
        populateCategorySelect(type);
    }

    if (typeExpenseBtn && typeIncomeBtn) {
        typeExpenseBtn.addEventListener('click', () => setTransactionType('expense'));
        typeIncomeBtn.addEventListener('click', () => setTransactionType('income'));
    }

    // Transaction Form Submit (Add / Edit)
    const txForm = document.getElementById('transactionForm');
    if (txForm) {
        txForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const editId = document.getElementById('txEditId').value;
            const title = document.getElementById('txTitle').value.trim();
            const amount = parseFloat(document.getElementById('txAmount').value);
            const category = document.getElementById('txCategory').value;
            const paymentMethod = document.getElementById('txPaymentMethod').value;
            const date = document.getElementById('txDate').value;
            const notes = document.getElementById('txNotes').value.trim();

            if (!title || isNaN(amount) || amount <= 0 || !date) {
                showToast('error', 'Invalid Input', 'Please enter a valid title, amount, and date.');
                return;
            }

            const txPayload = {
                title,
                amount,
                type: currentSelectedType,
                category,
                paymentMethod,
                date,
                notes
            };

            if (editId) {
                window.StorageManager.updateTransaction(email, editId, txPayload);
                showToast('success', 'Transaction Updated', `${title} updated successfully.`);
            } else {
                window.StorageManager.addTransaction(email, txPayload);
                showToast('success', 'Transaction Added', `${title} recorded.`);
            }

            closeModal('transactionModal');
            refreshDashboard();
        });
    }

    // Budget Form Submit
    const budgetForm = document.getElementById('budgetForm');
    if (budgetForm) {
        budgetForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputs = document.querySelectorAll('.budget-input-field');
            const budgets = {};

            inputs.forEach(inp => {
                const catId = inp.getAttribute('data-cat');
                const val = parseFloat(inp.value) || 0;
                budgets[catId] = val;
            });

            window.StorageManager.saveBudgets(email, budgets);
            closeModal('budgetModal');
            refreshDashboard();
            showToast('success', 'Budgets Saved', 'Monthly limits updated successfully.');
        });
    }

    // Goal Form Submit
    const goalForm = document.getElementById('goalForm');
    if (goalForm) {
        goalForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('goalName').value.trim();
            const target = parseFloat(document.getElementById('goalTarget').value);
            const deadline = document.getElementById('goalDeadline').value;

            if (!name || isNaN(target) || target <= 0) {
                showToast('error', 'Invalid Goal', 'Please enter a valid name and target amount.');
                return;
            }

            window.StorageManager.addSavingsGoal(email, { name, target, deadline });
            closeModal('goalModal');
            refreshDashboard();
            showToast('success', 'Goal Created', `Target for "${name}" added!`);
        });
    }

    // Add Funds to Goal Submit
    const addFundsForm = document.getElementById('addFundsForm');
    if (addFundsForm) {
        addFundsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const goalId = document.getElementById('addFundsGoalId').value;
            const amount = parseFloat(document.getElementById('addFundsAmount').value);

            if (!goalId || isNaN(amount) || amount <= 0) return;

            window.StorageManager.updateSavingsGoal(email, goalId, amount);
            closeModal('addFundsModal');
            refreshDashboard();
            showToast('success', 'Deposit Added', `Added ${window.StorageManager.formatCurrency(amount)} towards your goal!`);
        });
    }

    // Export & Backup Actions
    const exportCsvBtn = document.getElementById('exportCsvBtn');
    if (exportCsvBtn) {
        exportCsvBtn.addEventListener('click', () => {
            const txs = window.StorageManager.getTransactions(email);
            window.StorageManager.exportToCSV(txs, window.StorageManager.getUserCurrency());
            showToast('success', 'CSV Exported', 'Downloaded transaction spreadsheet.');
        });
    }

    const exportJsonBtn = document.getElementById('exportJsonBtn');
    if (exportJsonBtn) {
        exportJsonBtn.addEventListener('click', () => {
            window.StorageManager.exportToJSON(email);
            showToast('success', 'Backup Downloaded', 'Exported full JSON backup.');
        });
    }

    const importJsonInput = document.getElementById('importJsonInput');
    if (importJsonInput) {
        importJsonInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const res = window.StorageManager.importFromJSON(event.target.result, email);
                if (res.success) {
                    refreshDashboard();
                    closeModal('exportModal');
                    showToast('success', 'Backup Restored', `Restored ${res.count} transactions.`);
                } else {
                    showToast('error', 'Import Failed', res.error || 'Invalid backup file');
                }
            };
            reader.readAsText(file);
        });
    }

    // Filter, Search, and Sort Event Listeners
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const categoryFilter = document.getElementById('categoryFilter');
    const dateFilter = document.getElementById('dateFilter');
    const sortFilter = document.getElementById('sortFilter');

    [searchInput, typeFilter, categoryFilter, dateFilter, sortFilter].forEach(ctrl => {
        if (ctrl) {
            ctrl.addEventListener('input', () => renderTransactionsTable());
            ctrl.addEventListener('change', () => renderTransactionsTable());
        }
    });

    // Initial Dashboard Render
    refreshDashboard();
});

// Helper: Open Modal for Add
function openTransactionModalForAdd() {
    document.getElementById('modalTransactionTitle').textContent = 'Add New Transaction';
    document.getElementById('txEditId').value = '';
    document.getElementById('txTitle').value = '';
    document.getElementById('txAmount').value = '';
    document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('txNotes').value = '';
    document.getElementById('typeExpenseBtn').click();
    openModal('transactionModal');
}

// Helper: Open Modal for Edit
function openTransactionModalForEdit(txId) {
    const email = currentUser.email;
    const txs = window.StorageManager.getTransactions(email);
    const tx = txs.find(t => t.id === txId);
    if (!tx) return;

    document.getElementById('modalTransactionTitle').textContent = 'Edit Transaction';
    document.getElementById('txEditId').value = tx.id;
    document.getElementById('txTitle').value = tx.title || '';
    document.getElementById('txAmount').value = tx.amount || '';
    document.getElementById('txDate').value = tx.date || '';
    document.getElementById('txNotes').value = tx.notes || '';

    if (tx.type === 'income') {
        document.getElementById('typeIncomeBtn').click();
    } else {
        document.getElementById('typeExpenseBtn').click();
    }

    document.getElementById('txCategory').value = tx.category || '';
    document.getElementById('txPaymentMethod').value = tx.paymentMethod || 'other';

    openModal('transactionModal');
}

// Helper: Delete Transaction with Undo
function deleteTransactionWithUndo(txId) {
    const email = currentUser.email;
    const txs = window.StorageManager.getTransactions(email);
    const idx = txs.findIndex(t => t.id === txId);
    if (idx === -1) return;

    lastDeletedTransaction = txs[idx];
    lastDeletedIndex = idx;

    window.StorageManager.deleteTransaction(email, txId);
    refreshDashboard();

    showToast('info', 'Transaction Deleted', `${lastDeletedTransaction.title} removed.`, () => {
        if (lastDeletedTransaction) {
            const restoredList = window.StorageManager.getTransactions(email);
            restoredList.splice(lastDeletedIndex, 0, lastDeletedTransaction);
            window.StorageManager.saveTransactions(email, restoredList);
            lastDeletedTransaction = null;
            refreshDashboard();
            showToast('success', 'Restored', 'Transaction successfully recovered.');
        }
    });
}

// Helper: Open Deposit Modal for Goal
function openAddFundsModal(goalId, goalName) {
    document.getElementById('addFundsGoalId').value = goalId;
    document.getElementById('addFundsGoalName').textContent = `Target: ${goalName}`;
    document.getElementById('addFundsAmount').value = '';
    openModal('addFundsModal');
}

// Delete Goal
function deleteGoal(goalId) {
    const email = currentUser.email;
    showConfirm('Delete Goal?', 'Are you sure you want to remove this savings goal?', () => {
        window.StorageManager.deleteSavingsGoal(email, goalId);
        refreshDashboard();
        showToast('warning', 'Goal Removed', 'Savings goal deleted.');
    });
}

// Populate Category & Payment Selects
function populateCategorySelect(type) {
    const select = document.getElementById('txCategory');
    if (!select) return;
    select.innerHTML = '';
    const categories = window.CATEGORIES[type] || [];
    categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
}

function populateCategoryDropdowns() {
    populateCategorySelect('expense');
}

function populatePaymentMethodDropdown() {
    const select = document.getElementById('txPaymentMethod');
    if (!select) return;
    select.innerHTML = '';
    window.PAYMENT_METHODS.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function populateCategoryFilterDropdown() {
    const select = document.getElementById('categoryFilter');
    if (!select) return;
    select.innerHTML = '<option value="all">All Categories</option>';
    const all = [...window.CATEGORIES.expense, ...window.CATEGORIES.income];
    all.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        select.appendChild(opt);
    });
}

function renderBudgetInputs() {
    const container = document.getElementById('budgetInputsContainer');
    if (!container) return;
    const email = currentUser.email;
    const budgets = window.StorageManager.getBudgets(email);

    let html = `
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
            Set maximum monthly spending limits per category to receive progress alerts.
        </p>
    `;

    window.CATEGORIES.expense.forEach(c => {
        const val = budgets[c.id] !== undefined ? budgets[c.id] : 0;
        html += `
            <div class="form-group" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
                <label style="margin-bottom: 0; min-width: 140px; display: flex; align-items: center; gap: 8px;">
                    <i class="fa-solid ${c.icon}" style="color: ${c.color};"></i>
                    ${c.name}
                </label>
                <div class="input-with-icon" style="flex: 1; max-width: 180px;">
                    <i class="fa-solid fa-coins"></i>
                    <input type="number" class="budget-input-field" data-cat="${c.id}" value="${val}" min="0" placeholder="0" />
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Master Refresh Function
function refreshDashboard() {
    const email = currentUser.email;
    const allTransactions = window.StorageManager.getTransactions(email);
    activeTransactions = allTransactions;

    // 1. Calculate & Render KPI Cards
    renderKPICards(allTransactions);

    // 2. Render Charts
    if (window.ChartController) {
        window.ChartController.initOrUpdateCharts(allTransactions);
    }

    // 3. Render Budgets Progress
    renderBudgetsProgress(allTransactions);

    // 4. Render Savings Goals
    renderSavingsGoals();

    // 5. Render Transactions Table with active filters
    renderTransactionsTable();
}

// Calculate and Update KPI Stat Cards
function renderKPICards(transactions) {
    let income = 0;
    let incomeCount = 0;
    let expense = 0;
    const categoryExpenseTotals = {};

    transactions.forEach(t => {
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') {
            income += amt;
            incomeCount++;
        } else {
            expense += amt;
            const cat = t.category || 'other_expense';
            categoryExpenseTotals[cat] = (categoryExpenseTotals[cat] || 0) + amt;
        }
    });

    const balance = income - expense;
    const savingsRate = income > 0 ? Math.max(0, Math.round(((income - expense) / income) * 100)) : 0;

    // Update Elements
    document.getElementById('kpiBalance').textContent = window.StorageManager.formatCurrency(balance);
    document.getElementById('kpiIncome').textContent = window.StorageManager.formatCurrency(income);
    document.getElementById('kpiExpense').textContent = window.StorageManager.formatCurrency(expense);
    document.getElementById('kpiSavingsRate').textContent = `${savingsRate}%`;

    // Badges & Context
    const balanceStatus = document.getElementById('kpiBalanceStatus');
    if (balanceStatus) {
        if (balance > 0) {
            balanceStatus.textContent = 'Surplus';
            balanceStatus.className = 'kpi-badge badge-income';
        } else if (balance < 0) {
            balanceStatus.textContent = 'Deficit';
            balanceStatus.className = 'kpi-badge badge-expense';
        } else {
            balanceStatus.textContent = 'Neutral';
            balanceStatus.className = 'kpi-badge badge-primary';
        }
    }

    const incomeCountEl = document.getElementById('kpiIncomeCount');
    if (incomeCountEl) {
        incomeCountEl.textContent = `${incomeCount} credit${incomeCount === 1 ? '' : 's'}`;
    }

    const topCategoryEl = document.getElementById('kpiTopExpenseCategory');
    if (topCategoryEl) {
        const topCatEntry = Object.entries(categoryExpenseTotals).sort((a, b) => b[1] - a[1])[0];
        if (topCatEntry) {
            const catInfo = window.StorageManager.getCategory('expense', topCatEntry[0]);
            topCategoryEl.textContent = `Top: ${catInfo.name}`;
        } else {
            topCategoryEl.textContent = 'No expenses';
        }
    }

    const savingsAdviceEl = document.getElementById('kpiSavingsAdvice');
    if (savingsAdviceEl) {
        if (savingsRate >= 30) {
            savingsAdviceEl.textContent = 'Excellent 🚀';
            savingsAdviceEl.className = 'kpi-badge badge-income';
        } else if (savingsRate >= 15) {
            savingsAdviceEl.textContent = 'Healthy 👍';
            savingsAdviceEl.className = 'kpi-badge badge-income';
        } else if (savingsRate > 0) {
            savingsAdviceEl.textContent = 'Fair ⚡';
            savingsAdviceEl.className = 'kpi-badge badge-primary';
        } else {
            savingsAdviceEl.textContent = 'Needs Review ⚠️';
            savingsAdviceEl.className = 'kpi-badge badge-expense';
        }
    }
}

// Render Monthly Budgets Progress
function renderBudgetsProgress(transactions) {
    const container = document.getElementById('budgetProgressList');
    if (!container) return;
    const email = currentUser.email;
    const budgets = window.StorageManager.getBudgets(email);

    // Calculate current month's expenses per category
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthlyExpenses = {};
    transactions.forEach(t => {
        if (t.type !== 'expense') return;
        const d = new Date(t.date || t.createdAt);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            const cat = t.category || 'other_expense';
            monthlyExpenses[cat] = (monthlyExpenses[cat] || 0) + Number(t.amount);
        }
    });

    const budgetEntries = Object.entries(budgets).filter(([_, limit]) => limit > 0);

    if (budgetEntries.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--text-muted);">
                <i class="fa-solid fa-sliders" style="font-size: 28px; margin-bottom: 8px; opacity: 0.5;"></i>
                <p style="font-size: 13px;">No monthly budgets configured.</p>
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('editBudgetsQuickBtn').click()" style="margin-top: 8px;">
                    Set Monthly Limits
                </button>
            </div>
        `;
        return;
    }

    let html = '';
    budgetEntries.forEach(([catId, limit]) => {
        const cat = window.StorageManager.getCategory('expense', catId);
        const spent = monthlyExpenses[catId] || 0;
        const pct = Math.min(100, Math.round((spent / limit) * 100));

        let barColor = 'var(--income)';
        if (pct >= 90) barColor = 'var(--expense)';
        else if (pct >= 70) barColor = 'var(--warning)';

        html += `
            <div class="progress-item">
                <div class="progress-info">
                    <span class="progress-label">
                        <i class="fa-solid ${cat.icon}" style="color: ${cat.color};"></i>
                        ${cat.name}
                    </span>
                    <span class="progress-values">
                        ${window.StorageManager.formatCurrency(spent)} / ${window.StorageManager.formatCurrency(limit)} (${pct}%)
                    </span>
                </div>
                <div class="progress-bar-bg">
                    <div class="progress-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Render Savings Goals
function renderSavingsGoals() {
    const container = document.getElementById('savingsGoalsList');
    if (!container) return;
    const email = currentUser.email;
    const goals = window.StorageManager.getSavingsGoals(email);

    if (goals.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--text-muted);">
                <i class="fa-solid fa-bullseye" style="font-size: 28px; margin-bottom: 8px; opacity: 0.5;"></i>
                <p style="font-size: 13px;">No savings goals added yet.</p>
                <button class="btn btn-outline btn-sm" onclick="document.getElementById('addGoalQuickBtn').click()" style="margin-top: 8px;">
                    Create First Goal
                </button>
            </div>
        `;
        return;
    }

    let html = '';
    goals.forEach(g => {
        const current = g.current || 0;
        const target = g.target || 1;
        const pct = Math.min(100, Math.round((current / target) * 100));

        html += `
            <div class="progress-item" style="background: var(--bg-card); padding: 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); margin-bottom: 10px;">
                <div class="progress-info">
                    <span class="progress-label" style="font-weight: 700;">
                        <i class="fa-solid fa-bullseye" style="color: ${g.color || 'var(--income)'};"></i>
                        ${g.name}
                        ${g.deadline ? `<span style="font-size: 11px; font-weight: 400; color: var(--text-muted); margin-left: 4px;">(Due: ${window.StorageManager.formatDate(g.deadline)})</span>` : ''}
                    </span>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span class="progress-values">${window.StorageManager.formatCurrency(current)} / ${window.StorageManager.formatCurrency(target)}</span>
                        <button class="btn btn-success btn-sm" onclick="openAddFundsModal('${g.id}', '${g.name}')" title="Deposit funds">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteGoal('${g.id}')" title="Delete goal">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </div>
                <div class="progress-bar-bg" style="margin-top: 6px;">
                    <div class="progress-bar-fill" style="width: ${pct}%; background: ${pct >= 100 ? 'var(--income)' : (g.color || 'var(--primary)')};"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// Filtered & Sorted Transactions Provider
function getFilteredTransactions() {
    const searchVal = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const typeVal = document.getElementById('typeFilter')?.value || 'all';
    const catVal = document.getElementById('categoryFilter')?.value || 'all';
    const dateVal = document.getElementById('dateFilter')?.value || 'all';
    const sortVal = document.getElementById('sortFilter')?.value || 'date_desc';

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    return activeTransactions
        .filter(t => {
            // Type
            if (typeVal !== 'all' && t.type !== typeVal) return false;

            // Category
            if (catVal !== 'all' && t.category !== catVal) return false;

            // Search
            if (searchVal) {
                const titleMatch = (t.title || '').toLowerCase().includes(searchVal);
                const notesMatch = (t.notes || '').toLowerCase().includes(searchVal);
                const catName = window.StorageManager.getCategory(t.type, t.category).name.toLowerCase();
                if (!titleMatch && !notesMatch && !catName.includes(searchVal)) return false;
            }

            // Date Range
            const tDate = new Date(t.date || t.createdAt);
            if (dateVal === 'today') {
                if (t.date !== todayStr) return false;
            } else if (dateVal === 'this_week') {
                const oneWeekAgo = new Date();
                oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
                if (tDate < oneWeekAgo) return false;
            } else if (dateVal === 'this_month') {
                if (tDate.getMonth() !== now.getMonth() || tDate.getFullYear() !== now.getFullYear()) return false;
            } else if (dateVal === 'last_month') {
                const lastMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
                const lastMonthYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                if (tDate.getMonth() !== lastMonth || tDate.getFullYear() !== lastMonthYear) return false;
            }

            return true;
        })
        .sort((a, b) => {
            if (sortVal === 'date_desc') return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
            if (sortVal === 'date_asc') return new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt);
            if (sortVal === 'amount_desc') return Number(b.amount) - Number(a.amount);
            if (sortVal === 'amount_asc') return Number(a.amount) - Number(b.amount);
            if (sortVal === 'title_asc') return (a.title || '').localeCompare(b.title || '');
            return 0;
        });
}

// Render Transactions Table Rows
function renderTransactionsTable() {
    const tableBody = document.getElementById('transactionTableBody');
    const emptyState = document.getElementById('emptyState');
    if (!tableBody) return;

    const list = getFilteredTransactions();

    if (list.length === 0) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';

    tableBody.innerHTML = list.map(t => {
        const cat = window.StorageManager.getCategory(t.type, t.category);
        const payment = window.StorageManager.getPaymentMethod(t.paymentMethod);
        const formattedAmt = window.StorageManager.formatCurrency(t.amount);
        const isIncome = t.type === 'income';

        return `
            <tr class="transaction-row">
                <td>
                    <div class="tx-category-cell">
                        <div class="category-icon-bubble" style="background: ${cat.bg}; color: ${cat.color};">
                            <i class="fa-solid ${cat.icon}"></i>
                        </div>
                        <div>
                            <div class="tx-title-text">${escapeHTML(t.title)}</div>
                            ${t.notes ? `<div class="tx-notes-text">${escapeHTML(t.notes)}</div>` : `<div class="tx-notes-text">${cat.name}</div>`}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="tx-date-badge">${window.StorageManager.formatDate(t.date || t.createdAt)}</span>
                </td>
                <td>
                    <span class="payment-method-badge">
                        <i class="fa-solid ${payment.icon}"></i> ${payment.name}
                    </span>
                </td>
                <td style="text-align: right;">
                    <span class="tx-amount ${isIncome ? 'income' : 'expense'}">
                        ${isIncome ? '+' : '-'}${formattedAmt}
                    </span>
                </td>
                <td style="text-align: right;">
                    <div class="tx-actions">
                        <button class="action-btn" onclick="openTransactionModalForEdit('${t.id}')" title="Edit Transaction">
                            <i class="fa-regular fa-pen-to-square"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteTransactionWithUndo('${t.id}')" title="Delete Transaction">
                            <i class="fa-regular fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// XSS Safety Helper
function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

// Global Exports
window.openModal = openModal;
window.closeModal = closeModal;
window.openTransactionModalForAdd = openTransactionModalForAdd;
window.openTransactionModalForEdit = openTransactionModalForEdit;
window.deleteTransactionWithUndo = deleteTransactionWithUndo;
window.openAddFundsModal = openAddFundsModal;
window.deleteGoal = deleteGoal;