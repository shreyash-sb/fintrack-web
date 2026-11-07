const { GoogleGenAI } = require('@google/genai');

const DEFAULT_CATEGORIES = {
    income: [
        'Salary',
        'Freelance & Side Gig',
        'Investments & Dividends',
        'Business Income',
        'Gifts & Rewards',
        'Other Income'
    ],
    expense: [
        'Food & Dining',
        'Transportation',
        'Housing & Rent',
        'Bills & Utilities',
        'Shopping',
        'Entertainment',
        'Health & Medical',
        'Education',
        'Travel & Trips',
        'Other Expense'
    ]
};

function getGeminiClient(userApiKey) {
    const apiKey = (userApiKey || '').trim();
    if (!apiKey) {
        const err = new Error('A personal Google Gemini API key is required for AI features. Please enter your key in Settings or AI Advisor.');
        err.requiresApiKey = true;
        throw err;
    }
    return new GoogleGenAI({ apiKey });
}

function getActiveModel() {
    return 'gemini-3.5-flash-lite';
}

const EXTRACTION_SYSTEM_INSTRUCTION = `
You are an expert financial auditor and banking statement parser.
Your task is to analyze financial statements, bank balance sheets, or transaction exports (PDF, CSV, Excel, or Image) and extract structured financial data with strict precision.

CRITICAL RULES:
1. Extract the exact opening balance, closing balance, total credits (money received), and total debits (money spent).
2. For each transaction, extract:
   - "date": Date in "YYYY-MM-DD" format. If day or year is missing, infer logically from statement header, else null.
   - "description": Complete clean merchant / payee / description string.
   - "amount": Positive numeric value (no currency symbols or commas).
   - "type": "income" (money received/credited), "expense" (money spent/debited), "transfer" (own-account transfer / self-transfer / credit card payment), or "refund" (merchant refund / reversal).
   - "category": Best matching category from standard categories:
     Income: Salary, Freelance & Side Gig, Investments & Dividends, Business Income, Gifts & Rewards, Other Income.
     Expense: Food & Dining, Transportation, Housing & Rent, Bills & Utilities, Shopping, Entertainment, Health & Medical, Education, Travel & Trips, Other Expense.
   - "confidence": Float between 0.0 and 1.0 indicating extraction and categorization confidence.
   - "referenceNumber": Cheque no., UTR, transaction reference ID if visible, else null.
3. NEVER invent or hallucinate missing transactions, amounts, or balances. If a value is genuinely not present in the document, return null.
4. If the statement covers an arbitrary custom date range (e.g., 5 Oct to 20 Oct), identify the exact startDate and endDate from the transactions or statement period.
5. All amounts must be non-negative numbers. Debits and credits are distinguished by the "type" property.
6. Return purely valid JSON adhering to the target schema.
`;

/**
 * Extracts statement and transactions from multimodal document (PDF or Image).
 */
async function extractFromMultimodal(fileBuffer, mimeType, userDates = {}, userCurrency = 'INR', userApiKey = null, userModel = null) {
    const client = getGeminiClient(userApiKey);
    const model = getActiveModel(userModel);

    const base64Data = fileBuffer.toString('base64');

    const prompt = `
Analyze the attached financial statement document.
User preferred currency: ${userCurrency}.
${userDates.startDate ? `User specified Start Date: ${userDates.startDate}.` : ''}
${userDates.endDate ? `User specified End Date: ${userDates.endDate}.` : ''}

Extract the financial statement summary and every individual transaction item.
Return a JSON object in this exact structure:
{
  "statement": {
    "accountName": "string or null",
    "currency": "${userCurrency}",
    "startDate": "YYYY-MM-DD or null",
    "endDate": "YYYY-MM-DD or null",
    "openingBalance": 0.00,
    "closingBalance": 0.00,
    "totalCredits": 0.00,
    "totalDebits": 0.00
  },
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": 0.00,
      "type": "income" | "expense" | "transfer" | "refund",
      "category": "string",
      "confidence": 0.95,
      "referenceNumber": "string or null"
    }
  ]
}
`;

    try {
        const response = await client.models.generateContent({
            model,
            contents: [
                {
                    parts: [
                        { text: EXTRACTION_SYSTEM_INSTRUCTION },
                        {
                            inlineData: {
                                mimeType: mimeType === 'application/pdf' ? 'application/pdf' : mimeType,
                                data: base64Data
                            }
                        },
                        { text: prompt }
                    ]
                }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });

        const rawText = response.text;
        return validateAndCleanExtractionResult(rawText, userDates, userCurrency);
    } catch (err) {
        throw new Error(`Gemini Multimodal extraction failed: ${err.message}`);
    }
}

/**
 * Extracts statement and transactions from parsed spreadsheet text (CSV / Excel).
 */
async function extractFromSpreadsheetText(csvContent, userDates = {}, userCurrency = 'INR', userApiKey = null, userModel = null) {
    const client = getGeminiClient(userApiKey);
    const model = getActiveModel(userModel);

    const prompt = `
Analyze the following tabular financial statement / CSV export:

"""
${csvContent.slice(0, 15000)}
"""

User preferred currency: ${userCurrency}.
${userDates.startDate ? `User specified Start Date: ${userDates.startDate}.` : ''}
${userDates.endDate ? `User specified End Date: ${userDates.endDate}.` : ''}

Extract the statement header details (opening balance, closing balance, start date, end date, total credits, total debits) and all transactions in the sheet.
Return a JSON object in this exact structure:
{
  "statement": {
    "accountName": "string or null",
    "currency": "${userCurrency}",
    "startDate": "YYYY-MM-DD or null",
    "endDate": "YYYY-MM-DD or null",
    "openingBalance": 0.00,
    "closingBalance": 0.00,
    "totalCredits": 0.00,
    "totalDebits": 0.00
  },
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "string",
      "amount": 0.00,
      "type": "income" | "expense" | "transfer" | "refund",
      "category": "string",
      "confidence": 0.95,
      "referenceNumber": "string or null"
    }
  ]
}
`;

    try {
        const response = await client.models.generateContent({
            model,
            contents: [
                {
                    parts: [
                        { text: EXTRACTION_SYSTEM_INSTRUCTION },
                        { text: prompt }
                    ]
                }
            ],
            config: {
                responseMimeType: 'application/json'
            }
        });

        const rawText = response.text;
        return validateAndCleanExtractionResult(rawText, userDates, userCurrency);
    } catch (err) {
        throw new Error(`Gemini Spreadsheet analysis failed: ${err.message}`);
    }
}

/**
 * Validates, cleans, and standardizes Gemini's JSON output.
 */
function validateAndCleanExtractionResult(rawText, userDates = {}, userCurrency = 'INR') {
    if (!rawText) throw new Error('Empty response received from Gemini API.');

    let parsed;
    try {
        // Strip markdown code fences if any
        const cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*$/gi, '').trim();
        parsed = JSON.parse(cleaned);
    } catch (err) {
        throw new Error(`Invalid JSON format returned by Gemini: ${err.message}`);
    }

    if (!parsed || typeof parsed !== 'object') {
        throw new Error('Extracted result is not a valid JSON object.');
    }

    const statement = parsed.statement || {};
    const rawTxs = Array.isArray(parsed.transactions) ? parsed.transactions : [];

    // Clean statement summary
    const cleanStatement = {
        accountName: statement.accountName ? String(statement.accountName).trim() : 'Primary Account',
        currency: statement.currency ? String(statement.currency).toUpperCase() : userCurrency,
        startDate: userDates.startDate || statement.startDate || null,
        endDate: userDates.endDate || statement.endDate || null,
        openingBalance: statement.openingBalance !== undefined && statement.openingBalance !== null ? Number(statement.openingBalance) : 0,
        closingBalance: statement.closingBalance !== undefined && statement.closingBalance !== null ? Number(statement.closingBalance) : 0,
        totalCredits: statement.totalCredits !== undefined && statement.totalCredits !== null ? Number(statement.totalCredits) : null,
        totalDebits: statement.totalDebits !== undefined && statement.totalDebits !== null ? Number(statement.totalDebits) : null
    };

    // Clean individual transactions
    const cleanTransactions = rawTxs.map((t, idx) => {
        const rawDate = t.date ? String(t.date).slice(0, 10) : null;
        const validDate = rawDate && !isNaN(new Date(rawDate).getTime()) ? rawDate : null;
        const rawAmount = Math.abs(Number(t.amount || 0));

        let type = String(t.type || 'expense').toLowerCase();
        if (!['income', 'expense', 'transfer', 'refund'].includes(type)) {
            type = 'expense';
        }

        return {
            id: `temp_tx_${idx}_${Date.now()}`,
            date: validDate,
            description: String(t.description || 'Untitled Transaction').trim(),
            amount: Number(rawAmount.toFixed(2)),
            type,
            category: mapCategory(t.category, type),
            confidence: typeof t.confidence === 'number' ? Math.max(0, Math.min(1, t.confidence)) : 0.9,
            referenceNumber: t.referenceNumber ? String(t.referenceNumber).trim() : null
        };
    });

    // Auto-detect startDate and endDate from transactions if not present
    if (!cleanStatement.startDate || !cleanStatement.endDate) {
        const dates = cleanTransactions.map(t => t.date).filter(Boolean).sort();
        if (dates.length > 0) {
            if (!cleanStatement.startDate) cleanStatement.startDate = dates[0];
            if (!cleanStatement.endDate) cleanStatement.endDate = dates[dates.length - 1];
        }
    }

    return {
        statement: cleanStatement,
        transactions: cleanTransactions
    };
}

/**
 * Standardizes category string to application's recognized categories.
 */
function mapCategory(cat, type) {
    if (!cat) return type === 'income' ? 'Other Income' : 'Other Expense';
    const c = String(cat).toLowerCase();

    if (type === 'income') {
        if (c.includes('salary') || c.includes('payroll') || c.includes('wages')) return 'Salary';
        if (c.includes('freelance') || c.includes('upwork') || c.includes('contract')) return 'Freelance & Side Gig';
        if (c.includes('dividend') || c.includes('invest') || c.includes('interest') || c.includes('stock')) return 'Investments & Dividends';
        if (c.includes('business') || c.includes('client') || c.includes('invoice')) return 'Business Income';
        if (c.includes('gift') || c.includes('reward') || c.includes('cashback')) return 'Gifts & Rewards';
        return 'Other Income';
    } else {
        if (c.includes('food') || c.includes('dining') || c.includes('restaurant') || c.includes('cafe') || c.includes('swiggy') || c.includes('zomato')) return 'Food & Dining';
        if (c.includes('transport') || c.includes('uber') || c.includes('ola') || c.includes('fuel') || c.includes('petrol') || c.includes('metro')) return 'Transportation';
        if (c.includes('housing') || c.includes('rent') || c.includes('society') || c.includes('maintenance')) return 'Housing & Rent';
        if (c.includes('bill') || c.includes('utility') || c.includes('electric') || c.includes('water') || c.includes('wifi') || c.includes('recharge')) return 'Bills & Utilities';
        if (c.includes('shop') || c.includes('amazon') || c.includes('flipkart') || c.includes('store') || c.includes('clothing')) return 'Shopping';
        if (c.includes('entertain') || c.includes('netflix') || c.includes('movie') || c.includes('cinema') || c.includes('game') || c.includes('prime')) return 'Entertainment';
        if (c.includes('health') || c.includes('medical') || c.includes('pharma') || c.includes('doctor') || c.includes('hospital')) return 'Health & Medical';
        if (c.includes('edu') || c.includes('course') || c.includes('college') || c.includes('school') || c.includes('book')) return 'Education';
        if (c.includes('travel') || c.includes('flight') || c.includes('hotel') || c.includes('trip') || c.includes('train')) return 'Travel & Trips';
        return 'Other Expense';
    }
}

module.exports = {
    DEFAULT_CATEGORIES,
    extractFromMultimodal,
    extractFromSpreadsheetText,
    validateAndCleanExtractionResult,
    mapCategory
};

