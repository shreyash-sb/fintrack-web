/**
 * Fintrack - High-Performance Financial Dashboard & AI Advisor Controller
 */
window.activeTransactions = [];
let lastDeletedTransaction = null;
let lastDeletedIndex = -1;

// Session-Only Gemini Key State (In-Memory Only: Destroyed on reload, logout, and 15m inactivity)
window.sessionState = {
    apiKey: '',
    lastActive: Date.now(),
    inactivityTimer: null
};

// Immediate purge of any legacy keys from storage
try {
    localStorage.removeItem('fintrack_gemini_key');
    localStorage.removeItem('fintrack_gemini_model');
    localStorage.removeItem('fintrack_gemini_model_name');
    sessionStorage.removeItem('fintrack_gemini_key');
    sessionStorage.removeItem('fintrack_gemini_model');
    sessionStorage.removeItem('fintrack_gemini_model_name');
} catch (e) {}

window.getSessionGeminiKey = function() {
    return window.sessionState.apiKey || '';
};

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes of inactivity

function resetInactivityWatchdog() {
    window.sessionState.lastActive = Date.now();
    if (window.sessionState.inactivityTimer) {
        clearTimeout(window.sessionState.inactivityTimer);
        window.sessionState.inactivityTimer = null;
    }
    if (window.sessionState.apiKey) {
        window.sessionState.inactivityTimer = setTimeout(() => {
            if (window.sessionState.apiKey) {
                window.clearSessionGeminiKey('inactivity');
            }
        }, INACTIVITY_TIMEOUT_MS);
    }
}

// User activity listener for resetting inactivity watchdog
['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
    let throttled = false;
    window.addEventListener(evt, () => {
        if (!throttled) {
            throttled = true;
            setTimeout(() => { throttled = false; }, 3000);
            if (window.sessionState.apiKey) {
                resetInactivityWatchdog();
            }
        }
    }, { passive: true });
});

window.setSessionGeminiKey = function(key) {
    window.sessionState.apiKey = (key || '').trim();
    resetInactivityWatchdog();
    syncAllGeminiKeyUIs();
};

window.clearSessionGeminiKey = function(reason = 'manual') {
    window.sessionState.apiKey = '';
    if (window.sessionState.inactivityTimer) {
        clearTimeout(window.sessionState.inactivityTimer);
        window.sessionState.inactivityTimer = null;
    }
    syncAllGeminiKeyUIs();
    if (reason === 'inactivity') {
        window.showToast?.('warning', 'Session Inactive', 'Your Gemini API key was cleared after 15 minutes of inactivity for your security. Please enter your key again to use AI features.');
    } else if (reason === 'manual') {
        window.showToast?.('info', 'Key Cleared', 'Gemini API key removed from this active session.');
    }
};

function syncAllGeminiKeyUIs() {
    const key = window.getSessionGeminiKey();
    const hasKey = Boolean(key && !key.includes('•') && key.length > 15);

    // Settings View Synchronization
    const geminiInput = document.getElementById('geminiApiKey');
    const statusCard = document.getElementById('geminiModelStatus');
    const activeModelBadge = document.getElementById('activeModelBadge');
    const connectedModelName = document.getElementById('connectedModelName');

    if (geminiInput) {
        geminiInput.disabled = false;
        if (hasKey) {
            geminiInput.placeholder = 'Key active (paste new key to replace)';
        } else {
            geminiInput.placeholder = 'AIzaSy...';
        }
    }
    if (statusCard) {
        if (hasKey) {
            statusCard.classList.remove('d-none');
            if (connectedModelName) connectedModelName.textContent = 'Gemini AI Active & Ready (Session Only)';
        } else {
            statusCard.classList.add('d-none');
        }
    }
    if (activeModelBadge) {
        activeModelBadge.textContent = hasKey ? 'Active' : 'No Key Set';
        activeModelBadge.classList.toggle('active', hasKey);
    }
}

const currentUser = window.StorageManager ? window.StorageManager.getCurrentUser() : null;
if (!currentUser) window.location.href = 'index.html';
if (currentUser && currentUser.gemini_api_key) delete currentUser.gemini_api_key;

// Universal Modal Controller
function openModal(id) {
    const el = typeof id === 'string' ? document.getElementById(id) : id;
    if (el) { el.classList.add('active'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
    if (!id) document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    else { const el = typeof id === 'string' ? document.getElementById(id) : id; if (el) el.classList.remove('active'); }
    if (!document.querySelector('.modal-overlay.active')) document.body.style.overflow = '';
}

window.openModal = openModal;
window.closeModal = closeModal;

// Global Delegated Clicks (Modals, Navigation, Edits, Deletes)
document.addEventListener('click', (e) => {
    const closeBtn = e.target.closest('[data-modal-close], .modal-close');
    if (closeBtn) { e.preventDefault(); e.stopPropagation(); const m = closeBtn.closest('.modal-overlay'); if (m) closeModal(m.id); return; }

    const navBtn = e.target.closest('[data-view]');
    if (navBtn) { e.preventDefault(); switchView(navBtn.getAttribute('data-view')); return; }

    const editBtn = e.target.closest('[data-action="edit-tx"]');
    if (editBtn) { e.preventDefault(); openTransactionModalForEdit(editBtn.getAttribute('data-id')); return; }

    const receiptBtn = e.target.closest('[data-action="view-receipt"]');
    if (receiptBtn) { e.preventDefault(); openReceiptLightbox(receiptBtn.getAttribute('data-url'), receiptBtn.getAttribute('data-title')); return; }

    const delTxBtn = e.target.closest('[data-action="delete-tx"]');
    if (delTxBtn) { e.preventDefault(); deleteTransactionWithUndo(delTxBtn.getAttribute('data-id')); return; }

    const addFundsBtn = e.target.closest('[data-action="add-funds-goal"]');
    if (addFundsBtn) { e.preventDefault(); openAddFundsModal(addFundsBtn.getAttribute('data-id'), addFundsBtn.getAttribute('data-name')); return; }

    const delGoalBtn = e.target.closest('[data-action="delete-goal"]');
    if (delGoalBtn) { e.preventDefault(); deleteGoal(delGoalBtn.getAttribute('data-id')); return; }

    if (e.target.classList.contains('modal-overlay')) closeModal(e.target.id);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if ((e.key === 'n' || e.key === 'N') && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        openTransactionModalForAdd();
    }
});

// Toast System
function showToast(type = 'info', title = '', message = '', onUndo = null) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icon = type === 'error' ? 'fa-circle-xmark' : type === 'warning' ? 'fa-triangle-exclamation' : 'fa-circle-check';
    t.innerHTML = `<i class="fa-solid ${icon} toast-icon"></i><div class="toast-content">${title ? `<strong>${title}</strong>` : ''}<span>${message}</span></div>${onUndo ? '<button type="button" class="toast-undo-btn"><i class="fa-solid fa-rotate-left"></i> Undo</button>' : ''}`;

    if (onUndo) {
        t.querySelector('.toast-undo-btn')?.addEventListener('click', () => { onUndo(); t.remove(); });
    }
    c.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(40px)'; setTimeout(() => t.remove(), 250); }, onUndo ? 6000 : 3500);
}
window.showToast = showToast;

// Confirmation Dialog
function showConfirm(title, message, onConfirm) {
    const titleEl = document.getElementById('confirmModalTitle');
    const msgEl = document.getElementById('confirmModalMessage');
    const okBtn = document.getElementById('confirmModalOkBtn');
    if (titleEl) titleEl.textContent = title;
    if (msgEl) msgEl.textContent = message;
    if (okBtn) {
        const newOk = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        newOk.addEventListener('click', () => { closeModal('confirmModal'); onConfirm?.(); });
    }
    openModal('confirmModal');
}
window.showConfirm = showConfirm;

// Dynamic View Switcher Router
function switchView(viewName) {
    if (!viewName) return;
    const viewMetadata = {
        overview: {
            breadcrumb: 'Dashboard',
            title: 'Financial Overview'
        },
        transactions: {
            breadcrumb: 'Transactions',
            title: 'Transactions & Cloud Receipts'
        },
        'statement-import': {
            breadcrumb: 'Smart Statement Import',
            title: 'Financial Statement Import & Reconciliation'
        },
        budgets: {
            breadcrumb: 'Budgets & Goals',
            title: 'Budgets & Savings Goals'
        },
        'ai-advisor': {
            breadcrumb: 'AI Advisor',
            title: 'AI Financial Advisor'
        },
        backup: {
            breadcrumb: 'Data & Backup',
            title: 'Data Portability & Backup Hub'
        },
        settings: {
            breadcrumb: 'Settings & Profile',
            title: 'Settings & Profile'
        }
    };

    const currentMeta = viewMetadata[viewName] || {
        breadcrumb: 'Dashboard',
        title: 'Financial Dashboard'
    };

    document.querySelectorAll('.app-sidebar .nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-view') === viewName);
    });

    document.querySelectorAll('.view-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `view-${viewName}`);
    });

    // Highlight user card when settings & profile view is active
    document.getElementById('sidebarUserCard')?.classList.toggle('active', viewName === 'settings');

    const breadcrumbEl = document.getElementById('activeViewBreadcrumb');
    if (breadcrumbEl) breadcrumbEl.textContent = currentMeta.breadcrumb;

    const titleEl = document.getElementById('activeViewTitle');
    if (titleEl) titleEl.textContent = currentMeta.title;

    // Close mobile sidebar if open
    document.getElementById('appSidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (viewName === 'budgets') renderFullBudgetsAndGoals();
}
window.switchView = switchView;

// Main App Initialization
document.addEventListener('DOMContentLoaded', () => {
    const email = currentUser.email;

    // Sidebar Mobile Toggle
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    document.getElementById('sidebarToggleBtn')?.addEventListener('click', () => {
        sidebar?.classList.add('open');
        backdrop?.classList.add('active');
    });
    const closeSidebar = () => {
        sidebar?.classList.remove('open');
        backdrop?.classList.remove('active');
    };
    document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeSidebar);
    backdrop?.addEventListener('click', closeSidebar);

    // Profile Metadata & Avatar Sync
    renderUserProfileUI(currentUser);

    // Logout & Profile / Settings
    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.logout();
    });
    document.getElementById('sidebarUserCard')?.addEventListener('click', () => switchView('settings'));

    // Populate Filters & Dropdowns
    populateCategoryDropdowns();
    populatePaymentMethodDropdown();
    populateCategoryFilterDropdown();
    populateDateFilterDropdown();

    // Dashboard Period / Month Switcher Handlers
    document.getElementById('dashboardPeriodSelect')?.addEventListener('change', (e) => {
        window.dashboardActivePeriod = e.target.value;
        refreshDashboard();
    });

    document.getElementById('prevMonthBtn')?.addEventListener('click', () => {
        const stats = window.StorageManager.getFinancialSummary(currentUser.email, window.dashboardActivePeriod);
        const available = stats.availableMonths || [];
        const activeVal = window.dashboardActivePeriod || 'current';
        const curIdx = available.findIndex(m => (activeVal === 'current' && m.isCurrent) || activeVal === m.value);
        if (curIdx >= 0 && curIdx < available.length - 1) {
            window.dashboardActivePeriod = available[curIdx + 1].value;
            refreshDashboard();
        }
    });

    document.getElementById('nextMonthBtn')?.addEventListener('click', () => {
        const stats = window.StorageManager.getFinancialSummary(currentUser.email, window.dashboardActivePeriod);
        const available = stats.availableMonths || [];
        const activeVal = window.dashboardActivePeriod || 'current';
        const curIdx = available.findIndex(m => (activeVal === 'current' && m.isCurrent) || activeVal === m.value);
        if (curIdx > 0) {
            window.dashboardActivePeriod = available[curIdx - 1].value;
            refreshDashboard();
        }
    });

    document.getElementById('jumpCurrentMonthBtn')?.addEventListener('click', () => {
        window.dashboardActivePeriod = 'current';
        refreshDashboard();
    });

    // Quick Action Triggers
    ['openAddTransactionBtn', 'mobileAddTxBtn', 'addTxFromTableViewBtn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', openTransactionModalForAdd);
    });
    ['openBudgetModalBtn', 'editBudgetsQuickBtn', 'editBudgetsTabBtn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => { renderBudgetInputs(); openModal('budgetModal'); });
    });
    ['openGoalsModalBtn', 'addGoalQuickBtn', 'addGoalTabBtn'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', () => { document.getElementById('goalForm')?.reset(); openModal('goalModal'); });
    });
    document.getElementById('openExportModalBtn')?.addEventListener('click', () => openModal('exportModal'));
    document.getElementById('clearAllBtn')?.addEventListener('click', () => {
        showConfirm('Clear All Transactions?', 'Are you sure you want to delete all transaction records? This cannot be undone.', () => {
            window.StorageManager.clearAllTransactions(email);
            refreshDashboard();
            showToast('warning', 'Transactions Cleared', 'All records have been removed.');
        });
    });

    // Transaction Type Toggle
    let currentSelectedType = 'expense';
    const typeExp = document.getElementById('typeExpenseBtn');
    const typeInc = document.getElementById('typeIncomeBtn');
    const setType = (t) => {
        currentSelectedType = t;
        typeExp?.classList.toggle('active', t === 'expense');
        typeInc?.classList.toggle('active', t === 'income');
        populateCategorySelect(t);
    };
    typeExp?.addEventListener('click', () => setType('expense'));
    typeInc?.addEventListener('click', () => setType('income'));

    // Receipt File Selection & Clear Handlers
    const receiptInput = document.getElementById('txReceipt');
    const previewBox = document.getElementById('receiptPreviewBox');
    const previewName = document.getElementById('receiptPreviewName');
    receiptInput?.addEventListener('change', () => {
        if (receiptInput.files.length > 0) {
            if (previewName) previewName.textContent = receiptInput.files[0].name;
            previewBox?.classList.remove('d-none');
        }
    });
    document.getElementById('clearReceiptBtn')?.addEventListener('click', () => {
        if (receiptInput) receiptInput.value = '';
        document.getElementById('txReceiptUrl').value = '';
        document.getElementById('txReceiptPublicId').value = '';
        previewBox?.classList.add('d-none');
    });

    // Transaction Form Submit
    document.getElementById('transactionForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId = document.getElementById('txEditId').value;
        const title = document.getElementById('txTitle').value.trim();
        const amount = parseFloat(document.getElementById('txAmount').value);
        const category = document.getElementById('txCategory').value;
        const paymentMethod = document.getElementById('txPaymentMethod').value;
        const date = document.getElementById('txDate').value;
        const notes = document.getElementById('txNotes').value.trim();
        let receiptUrl = document.getElementById('txReceiptUrl').value || null;
        let receiptPublicId = document.getElementById('txReceiptPublicId').value || null;

        if (!title || isNaN(amount) || amount <= 0 || !date) return showToast('error', 'Invalid Input', 'Please enter valid details.');

        const receiptFile = receiptInput?.files[0];
        const saveBtn = document.getElementById('saveTxBtn');
        const origBtnText = saveBtn?.innerHTML;

        if (receiptFile) {
            try {
                if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading to Cloudinary...'; }
                const uploadRes = await window.ApiService.transactions.uploadReceipt(receiptFile);
                if (uploadRes.success) {
                    receiptUrl = uploadRes.receiptUrl;
                    receiptPublicId = uploadRes.receiptPublicId;
                }
            } catch (upErr) {
                showToast('warning', 'Cloudinary Notice', upErr.message || 'Could not upload to Cloudinary. Saving without attachment.');
            } finally {
                if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = origBtnText; }
            }
        }

        const payload = { title, amount, type: currentSelectedType, category, paymentMethod, date, notes, receipt_url: receiptUrl, receipt_public_id: receiptPublicId };
        closeModal('transactionModal');

        if (editId) {
            window.StorageManager.updateTransaction(email, editId, payload);
            refreshDashboard();
            showToast('success', 'Updated', `${title} updated.`);
            window.ApiService?.transactions.update(editId, payload).catch(err => console.debug(err.message));
        } else {
            const created = window.StorageManager.addTransaction(email, payload);
            refreshDashboard();
            showToast('success', 'Added', `${title} recorded.`);
            window.ApiService?.transactions.create(created).catch(err => console.debug(err.message));
        }
    });

    // Budget Form Submit
    document.getElementById('budgetForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const budgets = {};
        document.querySelectorAll('.budget-input-field').forEach(inp => budgets[inp.getAttribute('data-cat')] = parseFloat(inp.value) || 0);
        window.StorageManager.saveBudgets(email, budgets);
        closeModal('budgetModal');
        refreshDashboard();
        showToast('success', 'Saved', 'Category budgets updated.');
        window.ApiService?.budgets.setAll(budgets).catch(err => console.debug(err.message));
    });

    // Goal Form Submit
    document.getElementById('goalForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = document.getElementById('goalName').value.trim();
        const target = parseFloat(document.getElementById('goalTarget').value);
        const deadline = document.getElementById('goalDeadline').value;
        if (!name || isNaN(target) || target <= 0) return showToast('error', 'Invalid Goal', 'Please enter a valid target amount.');

        closeModal('goalModal');
        const goal = window.StorageManager.addSavingsGoal(email, { name, target, deadline });
        refreshDashboard();
        showToast('success', 'Goal Created', `${name} added to your targets.`);
        window.ApiService?.goals.create(goal).catch(err => console.debug(err.message));
    });

    // Add Funds to Goal Form Submit
    document.getElementById('addFundsForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const goalId = document.getElementById('addFundsGoalId').value;
        const amount = parseFloat(document.getElementById('addFundsAmount').value);
        if (!goalId || isNaN(amount) || amount <= 0) return showToast('error', 'Invalid Deposit', 'Please enter a valid amount.');

        closeModal('addFundsModal');
        const updated = window.StorageManager.contributeToSavingsGoal(email, goalId, amount);
        refreshDashboard();
        showToast('success', 'Deposit Recorded', `Added ${window.StorageManager.formatCurrency(amount)} to goal.`);
        window.ApiService?.goals.deposit(goalId, amount).catch(err => console.debug(err.message));
    });

    // Search & Filter Triggers
    ['searchInput', 'typeFilter', 'categoryFilter', 'dateFilter', 'sortFilter'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', renderTransactionsTable);
        document.getElementById(id)?.addEventListener('change', renderTransactionsTable);
    });

    // Data Export & Backup Hub Wire-ups
    const handleCsvExport = () => window.StorageManager.exportToCSV(email);
    const handleJsonBackup = () => window.StorageManager.exportToJSON(email);
    const handleJsonImport = (inputEl) => {
        const file = inputEl?.files[0];
        if (!file) return;
        window.StorageManager.importFromJSON(email, file, (err, count) => {
            if (err) return showToast('error', 'Import Failed', err.message);
            closeModal('exportModal');
            refreshDashboard();
            showToast('success', 'Backup Restored', `Successfully imported ${count} transactions.`);
            const txs = window.StorageManager.getTransactions(email);
            window.ApiService?.transactions.bulkImport(txs).catch(e => console.debug(e.message));
        });
    };

    document.getElementById('exportCsvBtn')?.addEventListener('click', handleCsvExport);
    document.getElementById('settingsExportCsvBtn')?.addEventListener('click', handleCsvExport);
    document.getElementById('backupExportCsvBtn')?.addEventListener('click', handleCsvExport);
    document.getElementById('exportJsonBtn')?.addEventListener('click', handleJsonBackup);
    document.getElementById('settingsExportJsonBtn')?.addEventListener('click', handleJsonBackup);
    document.getElementById('backupExportJsonBtn')?.addEventListener('click', handleJsonBackup);
    document.getElementById('importJsonInput')?.addEventListener('change', (e) => handleJsonImport(e.target));
    document.getElementById('settingsImportJsonInput')?.addEventListener('change', (e) => handleJsonImport(e.target));
    document.getElementById('backupImportJsonInput')?.addEventListener('change', (e) => handleJsonImport(e.target));

    // Profile & Avatar Settings Handlers
    initSettingsAndProfile(currentUser);

    // AI Financial Advisor Chatbot Handlers
    initAiAdvisorChatbot();

    // Sync all AI key status indicators
    syncAllGeminiKeyUIs();

    // Initial Dashboard Render & Silent Sync
    refreshDashboard();
    silentSyncWithServer();
});

// Render User Identity in UI (Avatars, Names, Email)
function renderUserProfileUI(user) {
    if (!user) return;
    const name = user.name || 'User';
    const email = user.email || '';
    const initial = name.charAt(0).toUpperCase();
    const avatarUrl = user.avatar_url || user.avatarUrl || null;

    document.getElementById('heroUserName')?.replaceChildren(name.split(' ')[0]);
    document.getElementById('sidebarUserName')?.replaceChildren(name);
    document.getElementById('sidebarUserEmail')?.replaceChildren(email);
    document.getElementById('sidebarAvatarText')?.replaceChildren(initial);
    document.getElementById('profileAvatarInitial')?.replaceChildren(initial);

    ['sidebarAvatarImg', 'profileAvatarImg'].forEach(id => {
        const img = document.getElementById(id);
        const textSpan = img?.parentElement.querySelector('span');
        if (img) {
            if (avatarUrl) {
                img.src = avatarUrl;
                img.classList.remove('d-none');
                textSpan?.classList.add('d-none');
            } else {
                img.classList.add('d-none');
                textSpan?.classList.remove('d-none');
            }
        }
    });

    const profName = document.getElementById('profileName');
    const profEmail = document.getElementById('profileEmail');
    const profCurr = document.getElementById('profileCurrency');
    if (profName) profName.value = name;
    if (profEmail) profEmail.value = email;
    if (profCurr) profCurr.value = user.currency || window.StorageManager.getUserCurrency();
}

// Settings & Profile Logic (Avatar Upload via Cloudinary + Gemini Key)
function initSettingsAndProfile(user) {
    // Avatar upload trigger
    const fileInput = document.getElementById('avatarFileInput');
    document.getElementById('triggerAvatarUploadBtn')?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', async () => {
        const file = fileInput.files[0];
        if (!file) return;

        const triggerBtn = document.getElementById('triggerAvatarUploadBtn');
        const origText = triggerBtn?.innerHTML;
        if (triggerBtn) { triggerBtn.disabled = true; triggerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Uploading...'; }

        try {
            const uploadRes = await window.ApiService.transactions.uploadReceipt(file);
            if (uploadRes.success && uploadRes.receiptUrl) {
                const avatarUrl = uploadRes.receiptUrl;
                user.avatar_url = avatarUrl;
                window.StorageManager.setCurrentUser(user);
                renderUserProfileUI(user);
                await window.ApiService.auth.updateProfile({ avatar_url: avatarUrl });
                showToast('success', 'Avatar Updated', 'Your profile picture was saved to Cloudinary.');
            }
        } catch (err) {
            showToast('error', 'Upload Failed', err.message || 'Could not upload photo to Cloudinary.');
        } finally {
            if (triggerBtn) { triggerBtn.disabled = false; triggerBtn.innerHTML = origText; }
        }
    });

    // Profile form submit
    document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newName = document.getElementById('profileName').value.trim();
        const newCurr = document.getElementById('profileCurrency').value;
        if (!newName) return showToast('error', 'Invalid Name', 'Name cannot be empty.');

        user.name = newName;
        user.currency = newCurr;
        window.StorageManager.setCurrentUser(user);
        window.StorageManager.setUserCurrency(newCurr);
        renderUserProfileUI(user);
        refreshDashboard();

        try {
            await window.ApiService.auth.updateProfile({ name: newName, currency: newCurr });
            showToast('success', 'Profile Saved', 'Your changes have been saved.');
        } catch (err) {
            showToast('warning', 'Local Update', 'Profile updated locally.');
        }
    });

    // Gemini API Key Management (Session-Only Lifecycle)
    const geminiInput = document.getElementById('geminiApiKey');
    syncAllGeminiKeyUIs();

    const handleSaveAndTestKey = async (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const inputVal = geminiInput ? geminiInput.value.trim() : '';
        const key = inputVal || window.getSessionGeminiKey();

        if (!key || key.includes('•') || key.length < 15) {
            return showToast('warning', 'Key Required', 'Please enter a valid Gemini API Key (starts with AIzaSy...).');
        }

        const saveBtn = document.getElementById('saveGeminiKeyBtn');
        const origBtn = saveBtn ? saveBtn.innerHTML : '<i class="fa-solid fa-flask-vial"></i> Test & Activate Key';
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verifying Key...';
        }

        try {
            const testRes = await window.ApiService.ai.testKey(key);
            if (!testRes || testRes.success === false) {
                throw new Error(testRes?.message || 'Invalid Gemini API key.');
            }

            // Save ONLY in-memory for this active session
            window.setSessionGeminiKey(key);
            if (geminiInput) geminiInput.value = '';
            showToast('success', 'Gemini Key Verified', `Connected for this active session (${testRes.model || 'Gemini Flash'}).`);
        } catch (err) {
            showToast('error', 'Gemini Validation Failed', err.message || 'Key verification failed. Please check your key.');
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.innerHTML = origBtn;
            }
        }
    };

    document.getElementById('saveGeminiKeyBtn')?.addEventListener('click', handleSaveAndTestKey);
    document.getElementById('geminiKeyForm')?.addEventListener('submit', handleSaveAndTestKey);

    document.getElementById('clearGeminiKeyBtn')?.addEventListener('click', () => {
        window.clearSessionGeminiKey('manual');
    });

    document.getElementById('goToGeminiSettingsBtn')?.addEventListener('click', () => switchView('settings'));

    // Change Password Form
    document.getElementById('changePasswordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPass = document.getElementById('currentPassword')?.value;
        const newPass = document.getElementById('newPassword')?.value;
        const confirmPass = document.getElementById('confirmNewPassword')?.value;

        if (!currentPass || !newPass || !confirmPass) {
            return showToast('warning', 'Missing Fields', 'All password fields are required.');
        }
        if (newPass.length < 6) {
            return showToast('warning', 'Weak Password', 'New password must be at least 6 characters.');
        }
        if (newPass !== confirmPass) {
            return showToast('error', 'Mismatch', 'New passwords do not match.');
        }
        if (currentPass === newPass) {
            return showToast('warning', 'Same Password', 'New password must be different from current password.');
        }

        const btn = document.getElementById('changePasswordBtn');
        const origText = btn?.innerHTML;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Updating...'; }

        try {
            await window.ApiService.auth.changePassword({
                currentPassword: currentPass,
                newPassword: newPass
            });
            showToast('success', 'Password Changed', 'Your password has been updated successfully.');
            document.getElementById('changePasswordForm')?.reset();
        } catch (err) {
            showToast('error', 'Update Failed', err.message || 'Could not change password.');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = origText; }
        }
    });

    // Permanently Delete Account Handlers
    document.getElementById('openDeleteAccountModalBtn')?.addEventListener('click', () => {
        document.getElementById('deleteAccountForm')?.reset();
        openModal('deleteAccountModal');
    });

    document.getElementById('deleteAccountForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const password = document.getElementById('deleteAccountPassword')?.value;
        if (!password) {
            return showToast('warning', 'Password Required', 'Please enter your password to confirm account deletion.');
        }

        const confirmBtn = document.getElementById('confirmDeleteAccountBtn');
        const origBtnText = confirmBtn?.innerHTML;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Deleting...';
        }

        try {
            if (window.ApiService) {
                await window.ApiService.auth.deleteAccount({ password });
            }
            if (window.StorageManager?.deleteUserAccount) {
                window.StorageManager.deleteUserAccount(currentUser.email);
            }
            showToast('info', 'Account Deleted', 'Your account and data have been permanently erased.');
            closeModal('deleteAccountModal');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 800);
        } catch (err) {
            showToast('error', 'Deletion Failed', err.message || 'Could not delete account. Verify your password.');
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = origBtnText;
            }
        }
    });

    // Password Visibility Toggles across Dashboard
    document.querySelectorAll('.password-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.parentElement.querySelector('input');
            if (!input) return;
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            btn.classList.toggle('fa-eye', !isPass);
            btn.classList.toggle('fa-eye-slash', isPass);
        });
    });
}

function updateGeminiKeyStatus(key) {
    syncAllGeminiKeyUIs();
}

// AI Financial Advisor Engine (Gemini + Local Financial Grounding)
function initAiAdvisorChatbot() {
    const chatForm = document.getElementById('aiChatForm');
    const chatInput = document.getElementById('aiChatInput');
    const messagesContainer = document.getElementById('aiChatMessages');
    const email = currentUser.email;

    const defaultWelcomeHtml = `
        <p>👋 Hello! I am your <strong>Fintrack AI Financial Advisor</strong>. I analyze your transactions, budgets, and savings goals to give you personalized guidance.</p>
        <p>Connect your <strong>Gemini API Key</strong> for this session to activate intelligent AI recommendations, or ask me directly about your current expenses!</p>
    `;

    const appendMessage = (sender, html, save = true) => {
        if (!messagesContainer) return;
        const msg = document.createElement('div');
        msg.className = `chat-msg ${sender}`;
        const avatarIcon = sender === 'ai' ? 'fa-brain' : 'fa-user';
        msg.innerHTML = `
            <div class="msg-avatar"><i class="fa-solid ${avatarIcon}"></i></div>
            <div class="msg-content">${html}</div>
        `;
        messagesContainer.appendChild(msg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        if (save && window.StorageManager?.saveAiChatHistory) {
            const history = window.StorageManager.getAiChatHistory(email);
            history.push({ sender, html, timestamp: new Date().toISOString() });
            window.StorageManager.saveAiChatHistory(email, history);
        }
        return msg;
    };

    // Load persistent AI history for current user
    if (messagesContainer) {
        const savedHistory = window.StorageManager?.getAiChatHistory ? window.StorageManager.getAiChatHistory(email) : [];
        if (savedHistory && savedHistory.length > 0) {
            messagesContainer.innerHTML = '';
            savedHistory.forEach(m => {
                appendMessage(m.sender, m.html, false);
            });
        } else {
            messagesContainer.innerHTML = `
                <div class="chat-msg ai">
                    <div class="msg-avatar"><i class="fa-solid fa-brain"></i></div>
                    <div class="msg-content">${defaultWelcomeHtml}</div>
                </div>
            `;
        }
    }

    // Navigate to Settings from AI Advisor prompt link
    document.getElementById('aiGoToSettingsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        switchView('settings');
    });

    const handleSendQuery = async (queryText) => {
        const query = (queryText !== undefined && queryText !== null ? queryText : (chatInput?.value || '')).trim();
        if (!query) return;

        if (chatInput) chatInput.value = '';

        const activeKey = window.getSessionGeminiKey();
        if (!activeKey) {
            appendMessage('user', `<p>${escapeHTML(query)}</p>`, true);
            appendMessage('ai', `
                <p>⚠️ <strong>Gemini API Key Required:</strong> To chat with the AI Advisor, please enter your personal Google Gemini API key in <strong>Settings & Profile</strong> for this session.</p>
                <p class="text-xs text-muted">🔒 Keys are stored in browser memory only and automatically deleted upon reload, logout, or 15 minutes of inactivity.</p>
            `, true);
            return;
        }

        appendMessage('user', `<p>${escapeHTML(query)}</p>`, true);

        // Typing placeholder
        const typingMsg = document.createElement('div');
        typingMsg.className = 'chat-msg ai';
        typingMsg.innerHTML = `
            <div class="msg-avatar"><i class="fa-solid fa-brain"></i></div>
            <div class="msg-content"><p><i class="fa-solid fa-spinner fa-spin"></i> Analyzing your financial data with Gemini 3.5 Flash...</p></div>
        `;
        messagesContainer.appendChild(typingMsg);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const answer = await generateAiFinancialAdvice(query);
            typingMsg.remove();
            appendMessage('ai', answer, true);
        } catch (err) {
            typingMsg.remove();
            const errHtml = `<p class="text-expense"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHTML(err.message)}</p>`;
            appendMessage('ai', errHtml, true);
        } finally {
            if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    };

    // Reset Chat
    document.getElementById('clearChatHistoryBtn')?.addEventListener('click', () => {
        if (!messagesContainer) return;
        window.StorageManager?.clearAiChatHistory(email);
        messagesContainer.innerHTML = `
            <div class="chat-msg ai">
                <div class="msg-avatar"><i class="fa-solid fa-brain"></i></div>
                <div class="msg-content">
                    <p>Chat reset! I am ready to analyze your latest transactions and budgets.</p>
                </div>
            </div>
        `;
        showToast('info', 'Chat Cleared', 'Your AI conversation history has been reset.');
    });

    // Form Submission
    chatForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleSendQuery();
    });
}

// Generate Financial Advice Grounded on Actual User Metrics
async function generateAiFinancialAdvice(userQuery) {
    const email = currentUser.email;
    const currency = window.StorageManager.getUserCurrency();
    const txs = window.StorageManager.getTransactions(email);
    const budgets = window.StorageManager.getBudgets(email);
    const goals = window.StorageManager.getSavingsGoals(email);

    let income = 0, expense = 0;
    const catMap = {};
    txs.forEach(t => {
        const amt = parseFloat(t.amount || 0);
        if (t.type === 'income') income += amt;
        else {
            expense += amt;
            catMap[t.category] = (catMap[t.category] || 0) + amt;
        }
    });
    const balance = income - expense;
    const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;

    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const topCatString = sortedCats.slice(0, 3).map(([c, a]) => `${window.StorageManager.getCategory('expense', c).name}: ${currency} ${a.toFixed(2)}`).join(', ') || 'No expenses';

    const overBudgets = [];
    Object.entries(budgets).forEach(([cat, limit]) => {
        const spent = catMap[cat] || 0;
        if (limit > 0 && spent >= limit) {
            overBudgets.push(`${window.StorageManager.getCategory('expense', cat).name} (Spent: ${currency} ${spent.toFixed(2)} / Limit: ${currency} ${limit.toFixed(2)})`);
        }
    });

    const goalsSummary = goals.map(g => `${g.name}: ${currency} ${g.currentAmount} / ${currency} ${g.targetAmount} (${Math.round((g.currentAmount / g.targetAmount) * 100)}%)`).join(', ') || 'No active goals';

    const financialContext = `
[USER FINANCIAL CONTEXT]:
- Currency: ${currency}
- Total Recorded Income: ${currency} ${income.toFixed(2)}
- Total Recorded Expenses: ${currency} ${expense.toFixed(2)}
- Current Net Balance: ${currency} ${balance.toFixed(2)}
- Savings Rate: ${savingsRate}%
- Top 3 Spending Categories: ${topCatString}
- Over Budget Alert Categories: ${overBudgets.length ? overBudgets.join(', ') : 'None! All within budget limits.'}
- Active Savings Goals: ${goalsSummary}
- Total Transactions Logged: ${txs.length}
`;

    // Call backend AI Advisor (uses Gemini 3.5 if key is present, or data engine if no key)
    const activeKey = window.getSessionGeminiKey();
    try {
        const aiRes = await window.ApiService.ai.chat(userQuery, activeKey);
        if (aiRes && aiRes.success && aiRes.reply) {
            const isGemini = aiRes.source === 'gemini';
            const modelBadge = isGemini
                ? `<div class="ai-model-tag"><i class="fa-solid fa-bolt"></i> ${aiRes.model || 'Gemini 3.5 Flash'} &bull; Google Gen AI</div>`
                : '<div class="ai-model-tag"><i class="fa-solid fa-chart-line"></i> Fintrack Intelligence &bull; Data Grounded</div>';
            return `${formatMarkdownToHtml(aiRes.reply)}${modelBadge}`;
        }
    } catch (err) {
        console.warn('[AI Advisor] Falling back to client-side data engine:', err.message);
    }

    // PATH 2: Local Rule-Based Financial Analyzer (Runs instantly as zero-latency fallback)
    const q = userQuery.toLowerCase();
    if (q.includes('where') || q.includes('most') || q.includes('spend') || q.includes('expense')) {
        const top = sortedCats[0];
        if (!top) return '<p>You have not logged any expenses yet! Add transactions to see spending analysis.</p>';
        const catName = window.StorageManager.getCategory('expense', top[0]).name;
        const pct = expense > 0 ? Math.round((top[1] / expense) * 100) : 0;
        return `
            <p>📊 <strong>Top Spending Category:</strong></p>
            <p>Your highest expense is <strong>${catName}</strong> at <strong>${currency} ${top[1].toFixed(2)}</strong>, which accounts for <strong>${pct}%</strong> of your total spending.</p>
            <p>Top 3 categories: ${topCatString}.</p>
            <p>💡 <em>Tip: Connect your Google Gemini API Key in Settings to get deep AI personalized tips on cutting these expenses!</em></p>
        `;
    }

    if (q.includes('save') || q.includes('saving') || q.includes('cut')) {
        return `
            <p>💡 <strong>Savings Rate Analysis:</strong></p>
            <p>Your current savings rate is <strong>${savingsRate}%</strong> (Net: ${currency} ${balance.toFixed(2)}).</p>
            <ul>
                <li><strong>Target:</strong> Financial experts recommend aiming for at least <strong>20%–30%</strong> savings rate.</li>
                <li><strong>Potential optimization:</strong> Review your top expense (<em>${sortedCats[0] ? window.StorageManager.getCategory('expense', sortedCats[0][0]).name : 'discretionary items'}</em>). Trimming just 10% can boost your savings by ${currency} ${(expense * 0.1).toFixed(2)}/month!</li>
            </ul>
        `;
    }

    if (q.includes('budget') || q.includes('over') || q.includes('limit')) {
        if (!overBudgets.length) {
            return `<p>✅ <strong>Budget Health: Excellent!</strong></p><p>None of your spending categories have exceeded their monthly limits. Keep it up!</p>`;
        }
        return `
            <p>⚠️ <strong>Budget Alert:</strong></p>
            <p>The following categories have reached or exceeded your spending limits:</p>
            <ul>${overBudgets.map(b => `<li>${b}</li>`).join('')}</ul>
            <p>Review the <em>Budgets & Goals</em> tab to adjust your caps or pause discretionary spending.</p>
        `;
    }

    if (q.includes('goal') || q.includes('emergency') || q.includes('forecast')) {
        if (!goals.length) {
            return `<p>🎯 You haven't created any savings goals yet! Head to <strong>Budgets & Goals</strong> to create your first target.</p>`;
        }
        return `
            <p>🎯 <strong>Savings Goals Status:</strong></p>
            <ul>${goals.map(g => {
                const pct = Math.round((g.currentAmount / g.targetAmount) * 100);
                return `<li><strong>${escapeHTML(g.name)}:</strong> ${currency} ${g.currentAmount} of ${currency} ${g.targetAmount} (<strong>${pct}%</strong> completed).</li>`;
            }).join('')}</ul>
            <p>Keep depositing into your targets whenever you record extra income!</p>
        `;
    }

    // Default snapshot
    return `
        <p>📈 <strong>Financial Summary:</strong></p>
        <ul>
            <li><strong>Current Balance:</strong> ${currency} ${balance.toFixed(2)}</li>
            <li><strong>Savings Rate:</strong> ${savingsRate}%</li>
            <li><strong>Top Category:</strong> ${sortedCats[0] ? window.StorageManager.getCategory('expense', sortedCats[0][0]).name : 'None'}</li>
            <li><strong>Active Goals:</strong> ${goals.length} target(s)</li>
        </ul>
        <p>Ask me: <em>"Where did my money go?"</em>, <em>"How can I save more?"</em>, or connect your <strong>Google Gemini API Key</strong> in Settings for open conversation!</p>
    `;
}

function formatMarkdownToHtml(text) {
    if (!text) return '';
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/^\s*\*\s+(.*)$/gm, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>')
        .split('\n\n')
        .map(p => p.trim().startsWith('<') ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('');
}

// Background Server Sync
async function silentSyncWithServer() {
    if (!window.ApiService) return;
    try {
        const [txRes, bgRes, gRes] = await Promise.all([
            window.ApiService.transactions.getAll().catch(() => null),
            window.ApiService.budgets.getAll().catch(() => null),
            window.ApiService.goals.getAll().catch(() => null)
        ]);
        const email = currentUser.email;
        if (txRes?.transactions) window.StorageManager.saveTransactions(email, txRes.transactions);
        if (bgRes?.budgets) window.StorageManager.saveBudgets(email, bgRes.budgets);
        if (gRes?.goals) window.StorageManager.saveSavingsGoals(email, gRes.goals);
        refreshDashboard();
    } catch (e) {
        console.debug('Sync fallback:', e.message);
    }
}

// Modal Helpers
function openTransactionModalForAdd() {
    document.getElementById('modalTransactionTitle').textContent = 'Add New Transaction';
    ['txEditId', 'txTitle', 'txAmount', 'txNotes', 'txReceiptUrl', 'txReceiptPublicId'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
    const receiptInput = document.getElementById('txReceipt');
    if (receiptInput) receiptInput.value = '';
    document.getElementById('receiptPreviewBox')?.classList.add('d-none');
    document.getElementById('txDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('typeExpenseBtn')?.click();
    openModal('transactionModal');
}
window.openTransactionModalForAdd = openTransactionModalForAdd;

function openTransactionModalForEdit(txId) {
    const tx = window.StorageManager.getTransactions(currentUser.email).find(t => t.id === txId);
    if (!tx) return;
    document.getElementById('modalTransactionTitle').textContent = 'Edit Transaction';
    document.getElementById('txEditId').value = tx.id;
    document.getElementById('txTitle').value = tx.title || '';
    document.getElementById('txAmount').value = tx.amount || '';
    document.getElementById('txDate').value = tx.date || '';
    document.getElementById('txNotes').value = tx.notes || '';
    (tx.type === 'income' ? document.getElementById('typeIncomeBtn') : document.getElementById('typeExpenseBtn'))?.click();
    document.getElementById('txCategory').value = tx.category || '';
    document.getElementById('txPaymentMethod').value = tx.paymentMethod || tx.payment_method || 'other';

    const rUrl = tx.receipt_url || tx.receiptUrl;
    const rPub = tx.receipt_public_id || tx.receiptPublicId;
    document.getElementById('txReceiptUrl').value = rUrl || '';
    document.getElementById('txReceiptPublicId').value = rPub || '';
    const receiptInput = document.getElementById('txReceipt');
    if (receiptInput) receiptInput.value = '';

    const previewBox = document.getElementById('receiptPreviewBox');
    const previewName = document.getElementById('receiptPreviewName');
    if (rUrl && previewBox && previewName) {
        previewName.textContent = 'Attached Document';
        previewBox.classList.remove('d-none');
    } else if (previewBox) {
        previewBox.classList.add('d-none');
    }

    openModal('transactionModal');
}
window.openTransactionModalForEdit = openTransactionModalForEdit;

function openReceiptLightbox(url, title = 'Attached Receipt') {
    if (!url) return;
    document.getElementById('receiptModalTitle').textContent = `${title} Receipt`;
    const img = document.getElementById('receiptModalImg');
    const pdf = document.getElementById('receiptModalPdf');
    const ext = document.getElementById('receiptExternalLink');
    const isPdf = url.toLowerCase().includes('.pdf');

    if (ext) ext.href = url;
    if (isPdf) {
        img?.classList.add('d-none');
        pdf?.classList.remove('d-none');
        const dl = document.getElementById('receiptDownloadLink');
        if (dl) dl.href = url;
    } else {
        pdf?.classList.add('d-none');
        if (img) { img.src = url; img.classList.remove('d-none'); }
    }
    openModal('receiptModal');
}
window.openReceiptLightbox = openReceiptLightbox;

function deleteTransactionWithUndo(txId) {
    const email = currentUser.email;
    const list = window.StorageManager.getTransactions(email);
    const idx = list.findIndex(t => t.id === txId);
    if (idx === -1) return;
    lastDeletedTransaction = list[idx];
    lastDeletedIndex = idx;
    window.StorageManager.deleteTransaction(email, txId);
    refreshDashboard();
    window.ApiService?.transactions.delete(txId).catch(err => console.debug(err.message));

    showToast('info', 'Deleted', `${lastDeletedTransaction.title} removed.`, () => {
        if (lastDeletedTransaction) {
            const restored = window.StorageManager.getTransactions(email);
            restored.splice(lastDeletedIndex, 0, lastDeletedTransaction);
            window.StorageManager.saveTransactions(email, restored);
            refreshDashboard();
            window.ApiService?.transactions.create(lastDeletedTransaction).catch(err => console.debug(err.message));
            showToast('success', 'Restored', `${lastDeletedTransaction.title} restored.`);
            lastDeletedTransaction = null;
        }
    });
}

function openAddFundsModal(goalId, goalName) {
    document.getElementById('addFundsGoalId').value = goalId;
    document.getElementById('addFundsGoalName').textContent = `Target: ${goalName}`;
    document.getElementById('addFundsAmount').value = '';
    openModal('addFundsModal');
}

function deleteGoal(goalId) {
    showConfirm('Delete Goal?', 'Are you sure you want to remove this savings goal?', () => {
        const email = currentUser.email;
        window.StorageManager.deleteSavingsGoal(email, goalId);
        refreshDashboard();
        showToast('warning', 'Goal Removed', 'Savings goal was deleted.');
        window.ApiService?.goals.delete(goalId).catch(err => console.debug(err.message));
    });
}

// Active Dashboard Period State ('current', 'YYYY-MM', or 'all')
window.dashboardActivePeriod = 'current';

function renderPeriodSelector(stats) {
    const sel = document.getElementById('dashboardPeriodSelect');
    const pill = document.getElementById('dashboardPeriodPill');
    const pillText = document.getElementById('periodPillText');
    const jumpBtn = document.getElementById('jumpCurrentMonthBtn');
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');
    const activeVal = window.dashboardActivePeriod || 'current';

    if (pillText) {
        if (stats.isCurrentMonth) {
            pillText.textContent = 'Current Month';
            if (pill) pill.classList.remove('past-period');
        } else if (activeVal === 'all') {
            pillText.textContent = 'All Time';
            if (pill) pill.classList.add('past-period');
        } else {
            pillText.textContent = 'Past Period';
            if (pill) pill.classList.add('past-period');
        }
    }

    if (sel) {
        const available = stats.availableMonths || [];

        let html = '';
        available.forEach(m => {
            const isCur = m.isCurrent;
            const selected = (activeVal === 'current' && isCur) || (activeVal === m.value);
            html += `<option value="${m.value}" ${selected ? 'selected' : ''}>${m.label}</option>`;
        });
        html += `<option value="all" ${activeVal === 'all' ? 'selected' : ''}>All Time (Cumulative)</option>`;
        sel.innerHTML = html;

        // Find active index
        const curIdx = available.findIndex(m => (activeVal === 'current' && m.isCurrent) || activeVal === m.value);
        if (prevBtn) {
            prevBtn.disabled = curIdx === -1 || curIdx >= available.length - 1;
        }
        if (nextBtn) {
            nextBtn.disabled = curIdx <= 0;
        }
        if (jumpBtn) {
            jumpBtn.classList.toggle('d-none', !!stats.isCurrentMonth);
        }
    }
}

// Refresh Dashboard State & Renders
function refreshDashboard() {
    const email = currentUser.email;
    window.activeTransactions = window.StorageManager.getTransactions(email);
    const stats = window.StorageManager.getFinancialSummary(email, window.dashboardActivePeriod);

    renderPeriodSelector(stats);
    renderKPICards();
    renderTransactionsTable();
    renderBudgetProgress();
    renderSavingsGoalsList();
    populateDateFilterDropdown();

    if (window.ChartManager) {
        window.ChartManager.renderCashFlowChart(stats.monthlyCashFlow, window.dashboardActivePeriod);
        window.ChartManager.renderCategoryChart(stats.categoryBreakdown, window.dashboardActivePeriod);
    }
}
window.refreshDashboard = refreshDashboard;

function renderKPICards() {
    const stats = window.StorageManager.getFinancialSummary(currentUser.email, window.dashboardActivePeriod);
    
    // Balance is always cumulative cash on hand
    document.getElementById('kpiBalance').textContent = window.StorageManager.formatCurrency(stats.netBalance);
    const balanceSub = document.getElementById('kpiBalanceSubtext');
    if (balanceSub) balanceSub.textContent = 'Cumulative net cash';

    // Income
    document.getElementById('kpiIncome').textContent = window.StorageManager.formatCurrency(stats.totalIncome);
    const incomeLabel = document.getElementById('kpiIncomeLabel');
    if (incomeLabel) incomeLabel.textContent = `${stats.isCurrentMonth ? 'Monthly' : stats.periodLabel} Income`;
    const incomeSub = document.getElementById('kpiIncomeSubtext');
    if (incomeSub) incomeSub.textContent = `${stats.periodLabel} earnings`;
    document.getElementById('kpiIncomeCount').textContent = `${stats.periodIncomeCount} credit${stats.periodIncomeCount === 1 ? '' : 's'}`;

    // Expense
    document.getElementById('kpiExpense').textContent = window.StorageManager.formatCurrency(stats.totalExpense);
    const expLabel = document.getElementById('kpiExpenseLabel');
    if (expLabel) expLabel.textContent = `${stats.isCurrentMonth ? 'Monthly' : stats.periodLabel} Expenses`;
    const expSub = document.getElementById('kpiExpenseSubtext');
    if (expSub) expSub.textContent = `${stats.periodLabel} spending`;

    // Savings Rate
    document.getElementById('kpiSavingsRate').textContent = `${stats.savingsRate}%`;
    const savLabel = document.getElementById('kpiSavingsLabel');
    if (savLabel) savLabel.textContent = `${stats.isCurrentMonth ? 'Monthly' : stats.periodLabel} Savings`;
    const savSub = document.getElementById('kpiSavingsSubtext');
    if (savSub) savSub.textContent = `Saved in ${stats.periodLabel}`;

    const topExpEl = document.getElementById('kpiTopExpenseCategory');
    if (topExpEl) {
        if (stats.categoryBreakdown.length > 0) {
            const top = stats.categoryBreakdown[0];
            const cat = window.StorageManager.getCategory('expense', top.category);
            topExpEl.textContent = `Top: ${cat.name}`;
        } else {
            topExpEl.textContent = 'No expenses';
        }
    }
}

function renderBudgetProgress() {
    const email = currentUser.email;
    const list = document.getElementById('budgetProgressList');
    if (!list) return;
    const progress = window.StorageManager.getBudgetProgress(email, window.dashboardActivePeriod);

    if (!progress.length) {
        list.innerHTML = `<div class="empty-state" style="padding: 24px 0;"><i class="fa-solid fa-sliders" style="font-size: 28px;"></i><h4>No budgets set</h4><p>Click "Set Limits" to set monthly category budgets.</p></div>`;
        return;
    }

    list.innerHTML = progress.slice(0, 4).map(b => {
        const cat = window.StorageManager.getCategory('expense', b.category);
        const pct = Math.min(b.percentage, 100);
        const color = b.isOverBudget ? 'var(--expense)' : (b.percentage >= 80 ? 'var(--warning)' : 'var(--income)');
        return `
            <div class="progress-item">
                <div class="progress-info">
                    <span class="progress-label"><i class="fa-solid ${cat.icon}" style="color: ${cat.color};"></i> ${cat.name}</span>
                    <span class="progress-values">${window.StorageManager.formatCurrency(b.spent)} / ${window.StorageManager.formatCurrency(b.limit)}</span>
                </div>
                <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%; background: ${color};"></div></div>
            </div>`;
    }).join('');
}

function renderFullBudgetsAndGoals() {
    const email = currentUser.email;
    const fullBudgets = document.getElementById('budgetProgressListFull');
    const fullGoals = document.getElementById('savingsGoalsListFull');
    const progress = window.StorageManager.getBudgetProgress(email, window.dashboardActivePeriod);
    const goals = window.StorageManager.getSavingsGoals(email);

    if (fullBudgets) {
        if (!progress.length) {
            fullBudgets.innerHTML = `<div class="empty-state"><i class="fa-solid fa-sliders"></i><h4>No budgets set</h4><p>Click "Set Limits" to cap monthly category spending.</p></div>`;
        } else {
            fullBudgets.innerHTML = progress.map(b => {
                const cat = window.StorageManager.getCategory('expense', b.category);
                const pct = Math.min(b.percentage, 100);
                const color = b.isOverBudget ? 'var(--expense)' : (b.percentage >= 80 ? 'var(--warning)' : 'var(--income)');
                return `
                    <div class="progress-item">
                        <div class="progress-info">
                            <span class="progress-label"><i class="fa-solid ${cat.icon}" style="color: ${cat.color};"></i> ${cat.name}</span>
                            <span class="progress-values">${window.StorageManager.formatCurrency(b.spent)} / ${window.StorageManager.formatCurrency(b.limit)} (${b.percentage}%)</span>
                        </div>
                        <div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ${pct}%; background: ${color};"></div></div>
                    </div>`;
            }).join('');
        }
    }

    if (fullGoals) {
        if (!goals.length) {
            fullGoals.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bullseye"></i><h4>No goals created</h4><p>Click "New Goal" to set milestone targets.</p></div>`;
        } else {
            fullGoals.innerHTML = goals.map(g => {
                const pct = Math.min(Math.round((g.currentAmount / g.targetAmount) * 100), 100);
                return `
                    <div class="progress-item">
                        <div class="progress-info">
                            <span class="progress-label"><i class="fa-solid fa-flag" style="color: ${g.color || 'var(--income)'};"></i> ${escapeHTML(g.name)}</span>
                            <div class="tx-actions">
                                <span class="progress-values">${window.StorageManager.formatCurrency(g.currentAmount)} / ${window.StorageManager.formatCurrency(g.targetAmount)} (${pct}%)</span>
                                <button type="button" class="btn btn-outline btn-sm" data-action="add-funds-goal" data-id="${g.id}" data-name="${escapeHTML(g.name)}">+ Deposit</button>
                                <button type="button" class="action-btn delete" data-action="delete-goal" data-id="${g.id}"><i class="fa-regular fa-trash-can"></i></button>
                            </div>
                        </div>
                        <div class="progress-bar-bg" style="margin-top: 6px;"><div class="progress-bar-fill" style="width: ${pct}%; background: ${pct >= 100 ? 'var(--income)' : (g.color || 'var(--primary)')};"></div></div>
                    </div>`;
            }).join('');
        }
    }
}

function renderSavingsGoalsList() {
    const email = currentUser.email;
    const list = document.getElementById('savingsGoalsList');
    if (!list) return;
    const goals = window.StorageManager.getSavingsGoals(email);

    if (!goals.length) {
        list.innerHTML = `<div class="empty-state" style="padding: 24px 0;"><i class="fa-solid fa-bullseye" style="font-size: 28px;"></i><h4>No goals yet</h4><p>Click "New Goal" to create savings milestones.</p></div>`;
        return;
    }

    list.innerHTML = goals.slice(0, 3).map(g => {
        const pct = Math.min(Math.round((g.currentAmount / g.targetAmount) * 100), 100);
        return `
            <div class="progress-item">
                <div class="progress-info">
                    <span class="progress-label"><i class="fa-solid fa-flag" style="color: ${g.color || 'var(--income)'};"></i> ${escapeHTML(g.name)}</span>
                    <div class="tx-actions">
                        <span class="progress-values">${window.StorageManager.formatCurrency(g.currentAmount)} / ${window.StorageManager.formatCurrency(g.targetAmount)}</span>
                        <button type="button" class="btn btn-outline btn-sm" data-action="add-funds-goal" data-id="${g.id}" data-name="${escapeHTML(g.name)}" title="Add funds">+ Deposit</button>
                        <button type="button" class="action-btn delete" data-action="delete-goal" data-id="${g.id}" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                    </div>
                </div>
                <div class="progress-bar-bg" style="margin-top: 6px;"><div class="progress-bar-fill" style="width: ${pct}%; background: ${pct >= 100 ? 'var(--income)' : (g.color || 'var(--primary)')};"></div></div>
            </div>`;
    }).join('');
}

function getFilteredTransactions() {
    const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const type = document.getElementById('typeFilter')?.value || 'all';
    const cat = document.getElementById('categoryFilter')?.value || 'all';
    const range = document.getElementById('dateFilter')?.value || 'all';
    const sort = document.getElementById('sortFilter')?.value || 'date_desc';
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    return (window.activeTransactions || [])
        .filter(t => {
            if (type !== 'all' && t.type !== type) return false;
            if (cat !== 'all' && t.category !== cat) return false;
            if (q && !(t.title?.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q) || window.StorageManager.getCategory(t.type, t.category).name.toLowerCase().includes(q))) return false;

            const d = new Date(t.date || t.createdAt);
            if (range && range.startsWith('month:')) {
                const targetK = range.replace('month:', '');
                const txK = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
                if (txK !== targetK) return false;
            } else if (range === 'today' && t.date !== today) return false;
            else if (range === 'this_week' && d < new Date(now.getTime() - 7 * 86400000)) return false;
            else if (range === 'this_month' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
            else if (range === 'last_month') {
                const lm = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
                const lmy = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
                if (d.getMonth() !== lm || d.getFullYear() !== lmy) return false;
            }
            return true;
        })
        .sort((a, b) => {
            if (sort === 'date_desc') return new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt);
            if (sort === 'date_asc') return new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt);
            if (sort === 'amount_desc') return Number(b.amount) - Number(a.amount);
            if (sort === 'amount_asc') return Number(a.amount) - Number(b.amount);
            return (a.title || '').localeCompare(b.title || '');
        });
}

function renderTransactionsTable() {
    const tbody = document.getElementById('transactionTableBody');
    const empty = document.getElementById('emptyState');
    if (!tbody) return;
    const list = getFilteredTransactions();

    if (!list.length) { tbody.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';

    tbody.innerHTML = list.map(t => {
        const cat = window.StorageManager.getCategory(t.type, t.category);
        const pay = window.StorageManager.getPaymentMethod(t.paymentMethod || t.payment_method);
        const isInc = t.type === 'income';
        const rUrl = t.receipt_url || t.receiptUrl;
        return `
            <tr class="transaction-row">
                <td>
                    <div class="tx-category-cell">
                        <div class="category-icon-bubble" style="background: ${cat.bg}; color: ${cat.color};"><i class="fa-solid ${cat.icon}"></i></div>
                        <div>
                            <div class="tx-title-text">${escapeHTML(t.title)}</div>
                            <div class="tx-notes-text">
                                ${escapeHTML(t.notes || cat.name)}
                                ${rUrl ? `<button type="button" class="receipt-pill" data-action="view-receipt" data-url="${escapeHTML(rUrl)}" data-title="${escapeHTML(t.title)}" title="View Attached Receipt"><i class="fa-solid fa-paperclip"></i> Receipt</button>` : ''}
                            </div>
                        </div>
                    </div>
                </td>
                <td><span class="tx-date-badge">${window.StorageManager.formatDate(t.date || t.createdAt)}</span></td>
                <td><span class="payment-method-badge"><i class="fa-solid ${pay.icon}"></i> ${pay.name}</span></td>
                <td class="text-right"><span class="tx-amount ${isInc ? 'income' : 'expense'}">${isInc ? '+' : '-'}${window.StorageManager.formatCurrency(t.amount)}</span></td>
                <td class="text-right">
                    <div class="tx-actions">
                        <button type="button" class="action-btn" data-action="edit-tx" data-id="${t.id}" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
                        <button type="button" class="action-btn delete" data-action="delete-tx" data-id="${t.id}" title="Delete"><i class="fa-regular fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>`;
    }).join('');
}

function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
}

// Helpers for Category & Payment Dropdowns
function populateCategorySelect(type = 'expense') {
    const sel = document.getElementById('txCategory');
    if (!sel) return;
    const rawCats = window.StorageManager?.getCategories ? window.StorageManager.getCategories(type) : (window.CATEGORIES?.[type] || []);
    const cats = Array.isArray(rawCats) ? rawCats : Object.entries(rawCats).map(([id, c]) => ({ id, ...c }));
    sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function populateCategoryDropdowns() {
    populateCategorySelect('expense');
}

function populatePaymentMethodDropdown() {
    const sel = document.getElementById('txPaymentMethod');
    if (!sel) return;
    const rawMethods = window.StorageManager?.getPaymentMethods ? window.StorageManager.getPaymentMethods() : (window.PAYMENT_METHODS || []);
    const methods = Array.isArray(rawMethods) ? rawMethods : Object.entries(rawMethods).map(([id, m]) => ({ id, ...m }));
    sel.innerHTML = methods.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function populateDateFilterDropdown() {
    const sel = document.getElementById('dateFilter');
    if (!sel) return;
    const months = window.StorageManager?.getDistinctMonths ? window.StorageManager.getDistinctMonths(window.activeTransactions || []) : [];
    const currentVal = sel.value || 'all';

    let html = '<option value="all">All Dates</option>' +
               '<option value="this_month">This Month</option>' +
               '<option value="last_month">Last Month</option>' +
               '<option value="this_week">This Week</option>' +
               '<option value="today">Today</option>';

    if (months.length > 0) {
        html += '<optgroup label="Specific Months">';
        months.forEach(m => {
            html += '<option value="month:' + m.value + '">' + m.label + (m.isCurrent ? ' (Current)' : '') + '</option>';
        });
        html += '</optgroup>';
    }

    sel.innerHTML = html;
    sel.value = currentVal;
}

function populateCategoryFilterDropdown() {
    const sel = document.getElementById('categoryFilter');
    if (!sel) return;
    const exp = window.StorageManager?.getCategories ? window.StorageManager.getCategories('expense') : (window.CATEGORIES?.expense || []);
    const inc = window.StorageManager?.getCategories ? window.StorageManager.getCategories('income') : (window.CATEGORIES?.income || []);
    const listExp = Array.isArray(exp) ? exp : Object.entries(exp).map(([id, c]) => ({ id, ...c }));
    const listInc = Array.isArray(inc) ? inc : Object.entries(inc).map(([id, c]) => ({ id, ...c }));
    const all = [...listExp, ...listInc];
    sel.innerHTML = '<option value="all">All Categories</option>' + all.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

function renderBudgetInputs() {
    const container = document.getElementById('budgetInputsContainer');
    if (!container) return;
    const rawCats = window.StorageManager?.getCategories ? window.StorageManager.getCategories('expense') : (window.CATEGORIES?.expense || []);
    const cats = Array.isArray(rawCats) ? rawCats : Object.entries(rawCats).map(([id, c]) => ({ id, ...c }));
    const budgets = window.StorageManager.getBudgets(currentUser.email);
    const curr = window.StorageManager.getUserCurrency();

    container.innerHTML = `
        <p class="modal-desc">Set maximum monthly spending limits per category to receive automatic alerts.</p>
        ${cats.map(c => `
            <div class="form-group mb-3">
                <label class="d-flex justify-between align-center">
                    <span><i class="fa-solid ${c.icon} text-primary mr-1"></i> ${c.name}</span>
                    <span class="card-subtitle">${curr}</span>
                </label>
                <input type="number" class="budget-input-field" data-cat="${c.id}" placeholder="No limit" min="0" step="100" value="${budgets[c.id] || ''}" />
            </div>
        `).join('')}
    `;
}

// Global Auth Helpers
function logout() {
    window.clearSessionGeminiKey?.('logout');
    try {
        localStorage.removeItem('fintrack_gemini_key');
        localStorage.removeItem('fintrack_gemini_model');
        localStorage.removeItem('fintrack_gemini_model_name');
        sessionStorage.removeItem('fintrack_gemini_key');
        sessionStorage.removeItem('fintrack_gemini_model');
    } catch (e) {}
    window.ApiService?.clearToken();
    localStorage.removeItem('fintrack_current_user');
    window.location.href = 'index.html';
}
window.logout = logout;
