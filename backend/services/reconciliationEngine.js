const crypto = require('crypto');

/**
 * Financial Reconciliation Engine & Duplicate Transaction Detector
 * Uses decimal-safe integer paise arithmetic (no floating-point rounding errors).
 * Enforces: Opening Balance + Total Credits - Total Debits = Calculated Closing Balance
 */

function toPaise(amt) {
    if (amt === null || amt === undefined || amt === '') return 0;
    const num = Number(amt);
    return isNaN(num) ? 0 : Math.round(num * 100);
}

function toRupees(paise) {
    return Number((Number(paise || 0) / 100).toFixed(2));
}

/**
 * Reconciles an extracted statement and its transactions.
 */
function reconcileStatement(statement = {}, transactions = []) {
    const openingPaise = toPaise(statement.openingBalance);
    const statedClosingPaise = toPaise(statement.closingBalance);

    let sumCreditsPaise = 0;
    let sumDebitsPaise = 0;
    let sumTransfersPaise = 0;
    let sumRefundsPaise = 0;

    const invalidTransactions = [];

    transactions.forEach((t, idx) => {
        const amtPaise = toPaise(t.amount);
        const type = (t.type || 'expense').toLowerCase();

        if (isNaN(amtPaise) || amtPaise < 0) {
            invalidTransactions.push({ index: idx, issue: 'Invalid amount', transaction: t });
            return;
        }

        if (!t.date || isNaN(new Date(t.date).getTime())) {
            invalidTransactions.push({ index: idx, issue: 'Missing or invalid transaction date', transaction: t });
        }

        if (type === 'income' || type === 'credit') {
            sumCreditsPaise += amtPaise;
        } else if (type === 'expense' || type === 'debit') {
            sumDebitsPaise += amtPaise;
        } else if (type === 'refund' || type === 'reversal') {
            sumRefundsPaise += amtPaise;
            sumCreditsPaise += amtPaise;
        } else if (type === 'transfer') {
            sumTransfersPaise += amtPaise;
        } else {
            sumDebitsPaise += amtPaise;
        }
    });

    const calculatedClosingPaise = openingPaise + sumCreditsPaise - sumDebitsPaise;
    const diffPaise = calculatedClosingPaise - statedClosingPaise;
    const isReconciled = diffPaise === 0;

    const diagnostics = [];

    if (!isReconciled) {
        if (diffPaise > 0) {
            diagnostics.push(`Calculated closing balance exceeds statement closing balance by ₹${toRupees(diffPaise).toLocaleString()}. Missing debit(s) or overstated credit(s) detected.`);
        } else {
            diagnostics.push(`Calculated closing balance falls short of statement closing balance by ₹${toRupees(Math.abs(diffPaise)).toLocaleString()}. Missing credit(s) or overstated debit(s) detected.`);
        }
    }

    let statedCreditsPaise = statement.totalCredits !== undefined && statement.totalCredits !== null ? toPaise(statement.totalCredits) : null;
    let statedDebitsPaise = statement.totalDebits !== undefined && statement.totalDebits !== null ? toPaise(statement.totalDebits) : null;

    if (statedCreditsPaise !== null && statedCreditsPaise !== sumCreditsPaise) {
        const cDiff = toRupees(statedCreditsPaise - sumCreditsPaise);
        diagnostics.push(`Stated total credits (₹${toRupees(statedCreditsPaise)}) does not equal transaction credit sum (₹${toRupees(sumCreditsPaise)}). Difference: ₹${cDiff}.`);
    }

    if (statedDebitsPaise !== null && statedDebitsPaise !== sumDebitsPaise) {
        const dDiff = toRupees(statedDebitsPaise - sumDebitsPaise);
        diagnostics.push(`Stated total debits (₹${toRupees(statedDebitsPaise)}) does not equal transaction debit sum (₹${toRupees(sumDebitsPaise)}). Difference: ₹${dDiff}.`);
    }

    if (invalidTransactions.length > 0) {
        diagnostics.push(`${invalidTransactions.length} transaction(s) have missing dates or invalid amounts requiring review.`);
    }

    const reconciliationStatus = isReconciled && invalidTransactions.length === 0 ? 'reconciled' : 'discrepancy';

    return {
        openingBalance: toRupees(openingPaise),
        closingBalance: toRupees(statedClosingPaise),
        calculatedClosingBalance: toRupees(calculatedClosingPaise),
        reconciliationDifference: toRupees(diffPaise),
        isReconciled,
        totalCredits: toRupees(sumCreditsPaise),
        totalDebits: toRupees(sumDebitsPaise),
        totalTransfers: toRupees(sumTransfersPaise),
        totalRefunds: toRupees(sumRefundsPaise),
        reconciliationStatus,
        diagnostics,
        invalidTransactions
    };
}

/**
 * Normalizes text for comparison (lowercase, removes special chars, trims whitespace).
 */
function normalizeDescription(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Generates a deterministic SHA-256 fingerprint for a transaction.
 */
function generateTransactionFingerprint(tx) {
    const date = String(tx.date || '').slice(0, 10);
    const amountPaise = toPaise(tx.amount);
    const type = String(tx.type || 'expense').toLowerCase();
    const desc = normalizeDescription(tx.description || tx.title || '');

    const data = `${date}|${amountPaise}|${type}|${desc}`;
    return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Computes token-based string similarity (0 to 1).
 */
function computeStringSimilarity(str1, str2) {
    const s1 = normalizeDescription(str1);
    const s2 = normalizeDescription(str2);
    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1;

    const words1 = new Set(s1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(s2.split(' ').filter(w => w.length > 2));

    if (!words1.size || !words2.size) {
        return s1.includes(s2) || s2.includes(s1) ? 0.8 : 0;
    }

    let intersection = 0;
    words1.forEach(w => {
        if (words2.has(w)) intersection++;
    });

    return (2.0 * intersection) / (words1.size + words2.size);
}

/**
 * Checks extracted transactions against existing transactions for a user.
 */
function detectDuplicates(extractedTransactions = [], existingTransactions = []) {
    const existingFingerprints = new Set();
    const existingByAmount = new Map();

    existingTransactions.forEach(t => {
        const fp = t.fingerprint || generateTransactionFingerprint(t);
        existingFingerprints.add(fp);

        const amtPaise = toPaise(t.amount);
        if (!existingByAmount.has(amtPaise)) {
            existingByAmount.set(amtPaise, []);
        }
        existingByAmount.get(amtPaise).push({
            id: t.id,
            date: String(t.date || '').slice(0, 10),
            amount: t.amount,
            type: (t.type || 'expense').toLowerCase(),
            title: t.title || t.description || '',
            fingerprint: fp
        });
    });

    return extractedTransactions.map(t => {
        const fp = generateTransactionFingerprint(t);
        const amtPaise = toPaise(t.amount);
        const txDate = String(t.date || '').slice(0, 10);
        const txType = String(t.type || 'expense').toLowerCase();
        const txDesc = t.description || t.title || '';

        // 1. Check exact fingerprint match
        if (existingFingerprints.has(fp)) {
            return {
                ...t,
                fingerprint: fp,
                duplicateStatus: 'duplicate_exact',
                duplicateReason: 'Identical transaction already recorded in database.',
                matchedExistingId: existingByAmount.get(amtPaise)?.find(e => e.fingerprint === fp)?.id || null,
                selectedForImport: false
            };
        }

        // 2. Check potential match (same amount & type, date within ±2 days, similar description)
        const candidates = existingByAmount.get(amtPaise) || [];
        let bestCandidate = null;
        let maxSimilarity = 0;

        for (const cand of candidates) {
            if (cand.type !== txType) continue;

            const d1 = new Date(txDate).getTime();
            const d2 = new Date(cand.date).getTime();
            const daysDiff = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);

            if (daysDiff <= 2) {
                const sim = computeStringSimilarity(txDesc, cand.title);
                if (sim > maxSimilarity) {
                    maxSimilarity = sim;
                    bestCandidate = cand;
                }
            }
        }

        if (bestCandidate && maxSimilarity >= 0.5) {
            return {
                ...t,
                fingerprint: fp,
                duplicateStatus: 'duplicate_potential',
                duplicateReason: `Similar to existing record "${bestCandidate.title}" on ${bestCandidate.date} (Similarity: ${Math.round(maxSimilarity * 100)}%).`,
                matchedExistingId: bestCandidate.id,
                selectedForImport: false
            };
        }

        return {
            ...t,
            fingerprint: fp,
            duplicateStatus: 'new',
            duplicateReason: null,
            matchedExistingId: null,
            selectedForImport: true
        };
    });
}

module.exports = {
    toPaise,
    toRupees,
    reconcileStatement,
    normalizeDescription,
    generateTransactionFingerprint,
    computeStringSimilarity,
    detectDuplicates
};
