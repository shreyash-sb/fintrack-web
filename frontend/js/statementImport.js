/**
 * Fintrack - Smart Financial Statement Import & Account Balance Synchronization Controller
 * Features:
 * - Multimodal document understanding (PDF, Excel, CSV, Images) via Gemini 3.5 Flash
 * - Decimal-safe integer paise financial reconciliation engine
 * - Deterministic duplicate detection & conflict warnings
 * - Accounting-compliant balance synchronization & safe rollback
 */

(function () {
    let currentSelectedFile = null;
    let activeImportId = null;
    let currentExtractedData = null; // { statement, transactions, reconciliation }

    // Initialize module once DOM is loaded
    function init() {
        bindUploadEvents();
        bindWorkflowButtons();
        bindHistoryEvents();
    }

    // 1. Drag & Drop and File Selection
    function bindUploadEvents() {
        const dropZone = document.getElementById('statementDropZone');
        const fileInput = document.getElementById('statementFileInput');
        const browseBtn = document.getElementById('statementBrowseBtn');
        const previewCard = document.getElementById('statementFilePreviewCard');
        const removeBtn = document.getElementById('statementRemoveFileBtn');

        if (!dropZone || !fileInput) return;

        browseBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            fileInput.click();
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files[0]) {
                handleFileSelection(fileInput.files[0]);
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('drag-active');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('drag-active');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileSelection(e.dataTransfer.files[0]);
            }
        });

        removeBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            clearSelectedFile();
        });
    }

    function handleFileSelection(file) {
        // Validate max size 10MB
        if (file.size > 10 * 1024 * 1024) {
            window.showToast?.('error', 'File Too Large', 'Maximum allowed file size is 10 MB.');
            clearSelectedFile();
            return;
        }

        currentSelectedFile = file;
        const nameEl = document.getElementById('statementFileName');
        const sizeEl = document.getElementById('statementFileSize');
        const iconEl = document.getElementById('statementFileIcon');
        const previewCard = document.getElementById('statementFilePreviewCard');
        const dropZone = document.getElementById('statementDropZone');
        const analyzeBtn = document.getElementById('startAnalyzeStatementBtn');

        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = formatBytes(file.size);

        // Icon based on type
        const ext = file.name.split('.').pop().toLowerCase();
        let iconClass = 'fa-file-invoice-dollar';
        if (ext === 'pdf') iconClass = 'fa-file-pdf text-expense';
        else if (['xlsx', 'xls', 'csv'].includes(ext)) iconClass = 'fa-file-excel text-income';
        else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) iconClass = 'fa-file-image text-primary';

        if (iconEl) iconEl.className = `fa-solid ${iconClass} statement-preview-icon`;

        previewCard?.classList.remove('d-none');
        dropZone?.classList.add('d-none');
        if (analyzeBtn) analyzeBtn.disabled = false;
    }

    function clearSelectedFile() {
        currentSelectedFile = null;
        activeImportId = null;
        currentExtractedData = null;
        const fileInput = document.getElementById('statementFileInput');
        if (fileInput) fileInput.value = '';

        document.getElementById('statementFilePreviewCard')?.classList.add('d-none');
        document.getElementById('statementDropZone')?.classList.remove('d-none');
        const analyzeBtn = document.getElementById('startAnalyzeStatementBtn');
        if (analyzeBtn) analyzeBtn.disabled = true;

        hideWorkflowSections();
    }

    function formatBytes(bytes) {
        if (!bytes) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function hideWorkflowSections() {
        document.getElementById('statementProcessingCard')?.classList.add('d-none');
        document.getElementById('statementSummaryCard')?.classList.add('d-none');
        document.getElementById('statementPreviewCard')?.classList.add('d-none');
        document.getElementById('statementConfirmationCard')?.classList.add('d-none');
    }

    // 2. Workflow Actions: Analyze, Reconcile, Confirm
    function bindWorkflowButtons() {
        // Tab switching between Import and History
        document.getElementById('stmtTabImportBtn')?.addEventListener('click', () => switchStatementSubTab('import'));
        document.getElementById('stmtTabHistoryBtn')?.addEventListener('click', () => {
            switchStatementSubTab('history');
            loadStatementHistory();
        });

        // Start Analysis
        document.getElementById('startAnalyzeStatementBtn')?.addEventListener('click', async () => {
            if (!currentSelectedFile) {
                return window.showToast?.('warning', 'No File', 'Please select a statement file first.');
            }
            await runStatementAnalysisWorkflow();
        });

        // Filter / Search in preview table
        document.getElementById('stmtSearchInput')?.addEventListener('input', filterPreviewTable);
        document.getElementById('stmtTypeFilter')?.addEventListener('change', filterPreviewTable);
        document.getElementById('stmtDuplicateFilter')?.addEventListener('change', filterPreviewTable);

        // Bulk Selection Buttons
        document.getElementById('stmtSelectAllBtn')?.addEventListener('click', () => toggleAllImportCheckboxes(true));
        document.getElementById('stmtDeselectAllBtn')?.addEventListener('click', () => toggleAllImportCheckboxes(false));
        document.getElementById('stmtSkipDuplicatesBtn')?.addEventListener('click', skipAllDuplicates);

        // Confirm & Synchronize
        document.getElementById('stmtConfirmSyncBtn')?.addEventListener('click', confirmAndSynchronize);
    }

    function switchStatementSubTab(tab) {
        const importBtn = document.getElementById('stmtTabImportBtn');
        const historyBtn = document.getElementById('stmtTabHistoryBtn');
        const importPanel = document.getElementById('statementImportWorkflowPanel');
        const historyPanel = document.getElementById('statementHistoryPanel');

        if (tab === 'history') {
            historyBtn?.classList.add('active');
            importBtn?.classList.remove('active');
            historyPanel?.classList.remove('d-none');
            importPanel?.classList.add('d-none');
        } else {
            importBtn?.classList.add('active');
            historyBtn?.classList.remove('active');
            importPanel?.classList.remove('d-none');
            historyPanel?.classList.add('d-none');
        }
    }

    // 3. Complete Upload & Analysis Pipeline
    async function runStatementAnalysisWorkflow() {
        const analyzeBtn = document.getElementById('startAnalyzeStatementBtn');
        const processingCard = document.getElementById('statementProcessingCard');

        if (!currentSelectedFile) {
            window.showToast?.('warning', 'No File Selected', 'Please upload a bank statement first.');
            return;
        }

        // Check active session Gemini key
        let currentKey = (typeof window !== 'undefined' && window.getSessionGeminiKey) ? window.getSessionGeminiKey() : '';
        if (!currentKey) {
            window.showToast?.('warning', 'Gemini API Key Required', 'Please configure your session Gemini key in Settings & Profile to extract transactions.');
            if (typeof window !== 'undefined' && window.switchView) {
                window.switchView('settings');
            }
            return;
        }

        hideWorkflowSections();
        processingCard?.classList.remove('d-none');

        if (analyzeBtn) {
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Statement...';
        }

        setProcessingStatus('Uploading Statement...', 'Sending file to server...');

        try {
            // STEP 1: Upload file
            const uploadRes = await window.ApiService.statements.upload(currentSelectedFile);
            activeImportId = uploadRes.importId;

            // STEP 2: Gemini Analysis & Extraction
            setProcessingStatus('Extracting Transactions...', 'AI is reading rows, categories, and balances...');
            const customStartDate = document.getElementById('stmtCustomStartDate')?.value || null;
            const customEndDate = document.getElementById('stmtCustomEndDate')?.value || null;

            const analysisRes = await window.ApiService.statements.analyze(activeImportId, {
                customStartDate,
                customEndDate
            });

            currentExtractedData = analysisRes;

            // Render Results
            renderStatementSummary(analysisRes.statement, analysisRes.reconciliation);
            renderPreviewTable(analysisRes.transactions);
            renderConfirmationCard(analysisRes.statement, analysisRes.reconciliation, analysisRes.transactions);

            processingCard?.classList.add('d-none');
            document.getElementById('statementSummaryCard')?.classList.remove('d-none');
            document.getElementById('statementPreviewCard')?.classList.remove('d-none');
            document.getElementById('statementConfirmationCard')?.classList.remove('d-none');

            window.showToast?.('success', 'Analysis Complete', `Extracted ${analysisRes.transactions.length} items from statement.`);
        } catch (err) {
            console.error('Statement Analysis Error:', err);
            setProcessingStatus('Analysis Failed', err.message || 'Could not analyze statement.');
            window.showToast?.('error', 'Analysis Failed', err.message || 'Could not analyze statement.');
        } finally {
            if (analyzeBtn) {
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Extract & Reconcile Statement';
            }
        }
    }

    function setProcessingStatus(title, desc) {
        const titleEl = document.getElementById('statementProcessingTitle');
        const descEl = document.getElementById('statementProcessingDesc');
        if (titleEl && title) titleEl.textContent = title;
        if (descEl && desc) descEl.textContent = desc;
    }

    function updateStepperStage(stepNumber, state) {
        // Kept for backward compatibility
        const stepEl = document.querySelector(`.stmt-step[data-step="${stepNumber}"]`);
        if (!stepEl) return;
        stepEl.classList.remove('pending', 'active', 'completed', 'error');
        stepEl.classList.add(state);
    }

    // 4. Render Summary KPI & Reconciliation Cards
    function renderStatementSummary(statement = {}, reconciliation = {}) {
        const curr = window.StorageManager?.getUserCurrency() || 'INR';

        const nameEl = document.getElementById('summaryAccountName');
        const rangeEl = document.getElementById('summaryDateRange');
        const openEl = document.getElementById('summaryOpeningBalance');
        const closeEl = document.getElementById('summaryClosingBalance');
        const calcEl = document.getElementById('summaryCalculatedClosing');
        const totalCreditsEl = document.getElementById('summaryTotalCredits');
        const totalDebitsEl = document.getElementById('summaryTotalDebits');
        const creditsCountEl = document.getElementById('summaryCreditsCount');
        const debitsCountEl = document.getElementById('summaryDebitsCount');
        const diffEl = document.getElementById('summaryReconciliationDiff');
        const statusBadge = document.getElementById('summaryReconcileBadge');
        const diagBox = document.getElementById('summaryDiagnosticsBox');
        const diagList = document.getElementById('summaryDiagnosticsList');

        if (nameEl) nameEl.textContent = statement.accountName || 'Primary Account';
        if (rangeEl) {
            const s = statement.startDate ? window.StorageManager.formatDate(statement.startDate) : 'Start';
            const e = statement.endDate ? window.StorageManager.formatDate(statement.endDate) : 'End';
            rangeEl.textContent = `${s} – ${e}`;
        }

        if (openEl) openEl.textContent = window.StorageManager.formatCurrency(reconciliation.openingBalance || 0, curr);
        if (closeEl) closeEl.textContent = window.StorageManager.formatCurrency(reconciliation.closingBalance || 0, curr);
        if (calcEl) calcEl.textContent = window.StorageManager.formatCurrency(reconciliation.calculatedClosingBalance || 0, curr);
        if (totalCreditsEl) totalCreditsEl.textContent = window.StorageManager.formatCurrency(reconciliation.totalCredits || 0, curr);
        if (totalDebitsEl) totalDebitsEl.textContent = window.StorageManager.formatCurrency(reconciliation.totalDebits || 0, curr);

        if (creditsCountEl) {
            const count = reconciliation.creditsCount ?? (reconciliation.totalCredits > 0 ? 'Extracted' : 0);
            creditsCountEl.textContent = typeof count === 'number' ? `${count} credits` : count;
        }
        if (debitsCountEl) {
            const count = reconciliation.debitsCount ?? (reconciliation.totalDebits > 0 ? 'Extracted' : 0);
            debitsCountEl.textContent = typeof count === 'number' ? `${count} debits` : count;
        }

        const diff = Number(reconciliation.reconciliationDifference || 0);
        if (diffEl) {
            diffEl.textContent = window.StorageManager.formatCurrency(Math.abs(diff), curr);
            diffEl.className = diff === 0 ? 'stmt-kpi-value text-income' : 'stmt-kpi-value text-expense';
        }

        if (statusBadge) {
            if (reconciliation.isReconciled) {
                statusBadge.className = 'status-badge status-reconciled';
                statusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Reconciled';
            } else {
                statusBadge.className = 'status-badge status-discrepancy';
                statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Discrepancy (${diff > 0 ? '+' : '-'}${window.StorageManager.formatCurrency(Math.abs(diff), curr)})`;
            }
        }

        // Diagnostics Box
        if (diagBox && diagList) {
            const diags = reconciliation.diagnostics || [];
            if (diags.length > 0) {
                diagList.innerHTML = diags.map(d => `<li>${escapeHTML(d)}</li>`).join('');
                diagBox.classList.remove('d-none');
            } else {
                diagBox.classList.add('d-none');
            }
        }
    }

    // 5. Render Transaction Preview Table
    function renderPreviewTable(transactions = []) {
        const tbody = document.getElementById('statementPreviewTableBody');
        if (!tbody) return;

        if (!transactions.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted">No transactions extracted from document.</td></tr>`;
            return;
        }

        const expCats = window.StorageManager?.getCategories ? window.StorageManager.getCategories('expense') : [];
        const incCats = window.StorageManager?.getCategories ? window.StorageManager.getCategories('income') : [];
        const allCategories = [...expCats, ...incCats];

        tbody.innerHTML = transactions.map((t, idx) => {
            const isChecked = t.selectedForImport !== false;
            const dupeClass = t.duplicateStatus === 'duplicate_exact' ? 'badge-dupe-exact'
                : (t.duplicateStatus === 'duplicate_potential' ? 'badge-dupe-potential' : 'badge-dupe-new');
            const dupeText = t.duplicateStatus === 'duplicate_exact' ? 'Exact Duplicate'
                : (t.duplicateStatus === 'duplicate_potential' ? 'Potential Duplicate' : 'New');

            return `
                <tr class="preview-tx-row ${!isChecked ? 'row-skipped' : ''}" data-index="${idx}">
                    <td class="text-center">
                        <input type="checkbox" class="stmt-tx-checkbox" data-index="${idx}" ${isChecked ? 'checked' : ''} aria-label="Select transaction for import" title="Select transaction for import" />
                    </td>
                    <td>
                        <input type="date" class="form-control form-control-sm stmt-edit-date" data-index="${idx}" value="${t.date || ''}" aria-label="Transaction Date" title="Transaction Date" />
                    </td>
                    <td>
                        <input type="text" class="form-control form-control-sm stmt-edit-desc" data-index="${idx}" value="${escapeHTML(t.description || t.title)}" aria-label="Transaction Description" title="Transaction Description" />
                        ${t.duplicateReason ? `<div class="dupe-hint"><i class="fa-solid fa-circle-info"></i> ${escapeHTML(t.duplicateReason)}</div>` : ''}
                    </td>
                    <td>
                        <input type="number" step="0.01" min="0" class="form-control form-control-sm stmt-edit-amount" data-index="${idx}" value="${t.amount}" aria-label="Transaction Amount" title="Transaction Amount" />
                    </td>
                    <td>
                        <select class="form-control form-control-sm stmt-edit-type" data-index="${idx}" aria-label="Transaction Type" title="Transaction Type">
                            <option value="expense" ${t.type === 'expense' ? 'selected' : ''}>Expense</option>
                            <option value="income" ${t.type === 'income' ? 'selected' : ''}>Income</option>
                            <option value="transfer" ${t.type === 'transfer' ? 'selected' : ''}>Transfer</option>
                            <option value="refund" ${t.type === 'refund' ? 'selected' : ''}>Refund</option>
                        </select>
                    </td>
                    <td>
                        <select class="form-control form-control-sm stmt-edit-cat" data-index="${idx}" aria-label="Transaction Category" title="Transaction Category">
                            ${allCategories.map(c => `<option value="${c.name}" ${t.category === c.name ? 'selected' : ''}>${c.name}</option>`).join('')}
                        </select>
                    </td>
                    <td class="text-center">
                        <span class="status-badge ${dupeClass}">${dupeText}</span>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach live edit listeners to dynamically re-calculate reconciliation
        attachPreviewTableListeners();
        updateSelectionCounter();
    }

    function attachPreviewTableListeners() {
        const tbody = document.getElementById('statementPreviewTableBody');
        if (!tbody) return;

        // Checkbox toggles
        tbody.querySelectorAll('.stmt-tx-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = parseInt(cb.getAttribute('data-index'), 10);
                const tr = cb.closest('tr');
                if (currentExtractedData?.transactions[idx]) {
                    currentExtractedData.transactions[idx].selectedForImport = cb.checked;
                    tr.classList.toggle('row-skipped', !cb.checked);
                    triggerDynamicReconciliation();
                    updateSelectionCounter();
                }
            });
        });

        // Date edit
        tbody.querySelectorAll('.stmt-edit-date').forEach(input => {
            input.addEventListener('change', () => {
                const idx = parseInt(input.getAttribute('data-index'), 10);
                if (currentExtractedData?.transactions[idx]) {
                    currentExtractedData.transactions[idx].date = input.value;
                }
            });
        });

        // Description edit
        tbody.querySelectorAll('.stmt-edit-desc').forEach(input => {
            input.addEventListener('change', () => {
                const idx = parseInt(input.getAttribute('data-index'), 10);
                if (currentExtractedData?.transactions[idx]) {
                    currentExtractedData.transactions[idx].description = input.value.trim();
                }
            });
        });

        // Amount edit (triggers instant decimal-safe recalculation)
        tbody.querySelectorAll('.stmt-edit-amount').forEach(input => {
            input.addEventListener('input', () => {
                const idx = parseInt(input.getAttribute('data-index'), 10);
                const val = parseFloat(input.value) || 0;
                if (currentExtractedData?.transactions[idx]) {
                    currentExtractedData.transactions[idx].amount = Math.abs(val);
                    triggerDynamicReconciliation();
                }
            });
        });

        // Type edit (triggers instant recalculation)
        tbody.querySelectorAll('.stmt-edit-type').forEach(sel => {
            sel.addEventListener('change', () => {
                const idx = parseInt(sel.getAttribute('data-index'), 10);
                if (currentExtractedData?.transactions[idx]) {
                    currentExtractedData.transactions[idx].type = sel.value;
                    triggerDynamicReconciliation();
                }
            });
        });

        // Category edit
        tbody.querySelectorAll('.stmt-edit-cat').forEach(sel => {
            sel.addEventListener('change', () => {
                const idx = parseInt(sel.getAttribute('data-index'), 10);
                if (currentExtractedData?.transactions[idx]) {
                    currentExtractedData.transactions[idx].category = sel.value;
                }
            });
        });
    }

    // 6. Dynamic Live Decimal-Safe Recalculation
    function triggerDynamicReconciliation() {
        if (!currentExtractedData) return;

        const statement = currentExtractedData.statement;
        // Use all transactions for statement internal reconciliation, or active selection
        const txs = currentExtractedData.transactions;

        // Calculate in integer paise directly
        const toPaise = (amt) => Math.round(Number(amt || 0) * 100);
        const toRupees = (paise) => Number((paise / 100).toFixed(2));

        const openPaise = toPaise(statement.openingBalance);
        const statedClosePaise = toPaise(statement.closingBalance);

        let sumCreditsPaise = 0;
        let sumDebitsPaise = 0;
        let creditsCount = 0;
        let debitsCount = 0;

        txs.forEach(t => {
            const amtPaise = toPaise(t.amount);
            const type = (t.type || 'expense').toLowerCase();
            if (type === 'income' || type === 'credit' || type === 'refund') {
                sumCreditsPaise += amtPaise;
                creditsCount++;
            } else if (type === 'expense' || type === 'debit') {
                sumDebitsPaise += amtPaise;
                debitsCount++;
            }
        });

        const calcClosePaise = openPaise + sumCreditsPaise - sumDebitsPaise;
        const diffPaise = calcClosePaise - statedClosePaise;

        const updatedReconciliation = {
            ...currentExtractedData.reconciliation,
            openingBalance: toRupees(openPaise),
            closingBalance: toRupees(statedClosePaise),
            calculatedClosingBalance: toRupees(calcClosePaise),
            reconciliationDifference: toRupees(diffPaise),
            totalCredits: toRupees(sumCreditsPaise),
            totalDebits: toRupees(sumDebitsPaise),
            creditsCount,
            debitsCount,
            isReconciled: diffPaise === 0,
            status: diffPaise === 0 ? 'reconciled' : 'discrepancy'
        };

        currentExtractedData.reconciliation = updatedReconciliation;
        renderStatementSummary(statement, updatedReconciliation);
        renderConfirmationCard(statement, updatedReconciliation, txs);
    }

    function toggleAllImportCheckboxes(select) {
        if (!currentExtractedData) return;
        currentExtractedData.transactions.forEach(t => { t.selectedForImport = select; });
        document.querySelectorAll('.stmt-tx-checkbox').forEach(cb => {
            cb.checked = select;
            cb.closest('tr')?.classList.toggle('row-skipped', !select);
        });
        updateSelectionCounter();
        renderConfirmationCard(currentExtractedData.statement, currentExtractedData.reconciliation, currentExtractedData.transactions);
    }

    function skipAllDuplicates() {
        if (!currentExtractedData) return;
        currentExtractedData.transactions.forEach((t, idx) => {
            if (t.duplicateStatus === 'duplicate_exact' || t.duplicateStatus === 'duplicate_potential') {
                t.selectedForImport = false;
                const cb = document.querySelector(`.stmt-tx-checkbox[data-index="${idx}"]`);
                if (cb) {
                    cb.checked = false;
                    cb.closest('tr')?.classList.add('row-skipped');
                }
            }
        });
        updateSelectionCounter();
        renderConfirmationCard(currentExtractedData.statement, currentExtractedData.reconciliation, currentExtractedData.transactions);
    }

    function updateSelectionCounter() {
        if (!currentExtractedData) return;
        const total = currentExtractedData.transactions.length;
        const selected = currentExtractedData.transactions.filter(t => t.selectedForImport !== false).length;
        const counterEl = document.getElementById('stmtSelectedCounter');
        if (counterEl) counterEl.textContent = `${selected} of ${total} selected for import`;
    }

    function filterPreviewTable() {
        const query = (document.getElementById('stmtSearchInput')?.value || '').toLowerCase();
        const typeFilter = document.getElementById('stmtTypeFilter')?.value || 'all';
        const dupeFilter = document.getElementById('stmtDuplicateFilter')?.value || 'all';

        document.querySelectorAll('#statementPreviewTableBody tr').forEach(tr => {
            const idx = parseInt(tr.getAttribute('data-index'), 10);
            const t = currentExtractedData?.transactions[idx];
            if (!t) return;

            const matchesQuery = !query || (t.description || '').toLowerCase().includes(query) || String(t.amount).includes(query);
            const matchesType = typeFilter === 'all' || t.type === typeFilter;
            const matchesDupe = dupeFilter === 'all' || t.duplicateStatus === dupeFilter;

            tr.style.display = (matchesQuery && matchesType && matchesDupe) ? '' : 'none';
        });
    }

    // 7. Confirmation Section & Balance Synchronization
    function renderConfirmationCard(statement, reconciliation, transactions = []) {
        const total = transactions.length;
        const selected = transactions.filter(t => t.selectedForImport !== false);
        const skipped = total - selected.length;

        const totalEl = document.getElementById('confirmTotalCount');
        const selectedEl = document.getElementById('confirmSelectedCount');
        const skippedEl = document.getElementById('confirmSkippedCount');
        const impactEl = document.getElementById('confirmBalanceImpact');
        const diffNotice = document.getElementById('confirmDiscrepancyNotice');
        const confirmBtn = document.getElementById('stmtConfirmSyncBtn');
        const authCheckbox = document.getElementById('authorizeAdjustmentCheckbox');

        if (totalEl) totalEl.textContent = total;
        if (selectedEl) selectedEl.textContent = selected.length;
        if (skippedEl) skippedEl.textContent = skipped;

        // Calculate Net Impact of selected transactions
        let netImpactPaise = 0;
        selected.forEach(t => {
            const amtPaise = Math.round(Number(t.amount || 0) * 100);
            const type = (t.type || 'expense').toLowerCase();
            if (type === 'income' || type === 'refund') netImpactPaise += amtPaise;
            else if (type === 'expense') netImpactPaise -= amtPaise;
        });

        const curr = window.StorageManager?.getUserCurrency() || 'INR';
        if (impactEl) {
            const netRupees = (netImpactPaise / 100).toFixed(2);
            impactEl.textContent = `${netImpactPaise >= 0 ? '+' : ''}${window.StorageManager.formatCurrency(netRupees, curr)}`;
            impactEl.className = netImpactPaise >= 0 ? 'text-income font-bold' : 'text-expense font-bold';
        }

        const isReconciled = reconciliation?.isReconciled === true;

        if (confirmBtn) {
            confirmBtn.innerHTML = `<i class="fa-solid fa-check-double"></i> Import ${selected.length} Transactions`;
        }

        if (!isReconciled) {
            if (diffNotice) diffNotice.classList.remove('d-none');
            // If discrepancy exists, require explicit authorization check
            if (confirmBtn) {
                confirmBtn.disabled = !(authCheckbox && authCheckbox.checked && selected.length > 0);
            }
        } else {
            if (diffNotice) diffNotice.classList.add('d-none');
            if (confirmBtn) confirmBtn.disabled = selected.length === 0;
        }

        authCheckbox?.addEventListener('change', () => {
            if (confirmBtn) {
                confirmBtn.disabled = !(authCheckbox.checked && selected.length > 0);
            }
        });
    }

    // 8. Confirm & Synchronize API Call
    async function confirmAndSynchronize() {
        if (!activeImportId || !currentExtractedData) return;

        const confirmBtn = document.getElementById('stmtConfirmSyncBtn');
        const origBtnText = confirmBtn?.innerHTML;
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Synchronizing Balance...';
        }

        const authCheckbox = document.getElementById('authorizeAdjustmentCheckbox');
        const reasonInput = document.getElementById('adjustmentReasonInput');

        const payload = {
            transactions: currentExtractedData.transactions,
            authorizeBalanceAdjustment: Boolean(authCheckbox && authCheckbox.checked),
            adjustmentReason: reasonInput?.value.trim() || ''
        };

        try {
            const res = await window.ApiService.statements.confirm(activeImportId, payload);

            window.showToast?.('success', 'Import Synchronized', `Imported ${res.importedCount} transactions. Account balance updated.`);

            // Synchronize local transactions cache so overview and charts update immediately
            const txsRes = await window.ApiService.transactions.getAll();
            if (txsRes?.transactions && window.StorageManager) {
                window.StorageManager.saveTransactions(window.StorageManager.getCurrentUser()?.email, txsRes.transactions);
            }

            // Refresh live dashboard statistics and charts
            window.refreshDashboard?.();

            // Clear current workflow and switch to history
            clearSelectedFile();
            switchStatementSubTab('history');
            loadStatementHistory();
        } catch (err) {
            console.error('Confirmation Error:', err);
            window.showToast?.('error', 'Synchronization Failed', err.message || 'Could not synchronize transactions.');
        } finally {
            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = origBtnText;
            }
        }
    }

    // 9. Load Statement History & Rollback
    async function loadStatementHistory() {
        const tbody = document.getElementById('statementHistoryTableBody');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Loading import history...</td></tr>`;

        try {
            const res = await window.ApiService.statements.getHistory();
            const history = res.history || [];

            if (!history.length) {
                tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted">No statements imported yet.</td></tr>`;
                return;
            }

            const curr = window.StorageManager?.getUserCurrency() || 'INR';

            tbody.innerHTML = history.map(item => {
                const sDate = item.start_date ? window.StorageManager.formatDate(item.start_date) : '';
                const eDate = item.end_date ? window.StorageManager.formatDate(item.end_date) : '';
                const rangeStr = sDate && eDate ? `${sDate} – ${eDate}` : (sDate || eDate || 'N/A');

                const statusClass = item.status === 'confirmed' ? 'status-confirmed'
                    : (item.status === 'rolled_back' ? 'status-rolledback' : 'status-pending');
                const statusText = item.status === 'confirmed' ? 'Active'
                    : (item.status === 'rolled_back' ? 'Rolled Back' : 'Draft');

                const canRollback = item.status === 'confirmed';

                return `
                    <tr>
                        <td>
                            <strong>${escapeHTML(item.filename)}</strong>
                            <div class="text-muted text-xs">${escapeHTML(item.account_name || 'Primary')} &bull; ${item.file_type.toUpperCase()}</div>
                        </td>
                        <td>${rangeStr}</td>
                        <td>${window.StorageManager.formatCurrency(item.opening_balance, curr)}</td>
                        <td>${window.StorageManager.formatCurrency(item.closing_balance, curr)}</td>
                        <td>
                            <span class="text-income font-medium">${item.imported_count || 0}</span> / 
                            <span class="text-muted">${item.skipped_count || 0} skipped</span>
                        </td>
                        <td>
                            <span class="status-badge ${item.reconciliation_status === 'reconciled' ? 'status-reconciled' : 'status-discrepancy'}">
                                ${item.reconciliation_status === 'reconciled' ? 'Reconciled' : 'Discrepancy'}
                            </span>
                        </td>
                        <td>
                            <span class="status-badge ${statusClass}">${statusText}</span>
                        </td>
                        <td class="text-right">
                            ${canRollback ? `
                                <button type="button" class="btn btn-outline btn-sm stmt-rollback-btn" data-id="${item.id}" data-filename="${escapeHTML(item.filename)}" title="Safely reverse records created by this statement">
                                    <i class="fa-solid fa-rotate-left"></i> Rollback
                                </button>
                            ` : `<span class="text-muted text-xs">No Action</span>`}
                        </td>
                    </tr>
                `;
            }).join('');

            // Bind rollback clicks
            tbody.querySelectorAll('.stmt-rollback-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    const filename = btn.getAttribute('data-filename');
                    promptRollbackStatement(id, filename);
                });
            });
        } catch (err) {
            console.error('History Error:', err);
            tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-expense">Failed to load history: ${escapeHTML(err.message)}</td></tr>`;
        }
    }

    function promptRollbackStatement(importId, filename) {
        window.showConfirm?.(
            'Rollback Statement Import?',
            `Are you sure you want to rollback "${filename}"? Only transactions created by this statement import will be safely removed. Manual transactions and unrelated records will not be touched.`,
            async () => {
                try {
                    const res = await window.ApiService.statements.rollback(importId);
                    window.showToast?.('info', 'Rollback Complete', res.message || 'Transactions safely removed.');

                    // Refresh transactions and dashboard
                    const txsRes = await window.ApiService.transactions.getAll();
                    if (txsRes?.transactions && window.StorageManager) {
                        window.StorageManager.saveTransactions(window.StorageManager.getCurrentUser()?.email, txsRes.transactions);
                    }
                    window.refreshDashboard?.();
                    loadStatementHistory();
                } catch (err) {
                    window.showToast?.('error', 'Rollback Failed', err.message || 'Could not rollback statement.');
                }
            }
        );
    }

    function escapeHTML(str) {
        return String(str || '').replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t));
    }

    function bindHistoryEvents() {
        document.getElementById('refreshStatementHistoryBtn')?.addEventListener('click', loadStatementHistory);
    }

    // Expose init and utilities globally
    window.StatementImportController = {
        init,
        switchStatementSubTab,
        loadStatementHistory
    };

    // Auto-init on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

