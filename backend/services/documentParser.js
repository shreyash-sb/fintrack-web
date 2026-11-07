const crypto = require('crypto');
const path = require('path');
const XLSX = require('xlsx');

const ALLOWED_MIME_TYPES = {
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-excel': 'xls',
    'text/csv': 'csv',
    'application/csv': 'csv',
    'text/plain': 'csv',
    'image/jpeg': 'image',
    'image/png': 'image',
    'image/webp': 'image'
};

const ALLOWED_EXTENSIONS = {
    '.pdf': 'pdf',
    '.xlsx': 'xlsx',
    '.xls': 'xls',
    '.csv': 'csv',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.png': 'image',
    '.webp': 'image'
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Validates uploaded file and detects statement document type.
 */
function validateAndDetectFileType(file) {
    if (!file || !file.buffer) {
        throw new Error('No statement file uploaded.');
    }

    if (file.size > MAX_FILE_SIZE) {
        throw new Error('File exceeds maximum size limit of 10 MB.');
    }

    const ext = path.extname(file.originalname || '').toLowerCase();
    const typeFromExt = ALLOWED_EXTENSIONS[ext];
    const typeFromMime = ALLOWED_MIME_TYPES[file.mimetype];

    const detectedType = typeFromExt || typeFromMime;
    if (!detectedType) {
        throw new Error(`Unsupported file format "${ext || file.mimetype}". Supported formats: PDF, Excel (.xlsx, .xls), CSV, and Images (JPG, PNG).`);
    }

    const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex');

    return {
        detectedType,
        extension: ext,
        mimeType: file.mimetype,
        fileHash,
        fileSize: file.size,
        filename: file.originalname
    };
}

/**
 * Parses tabular files (Excel or CSV) into structured text and JSON rows.
 */
function parseSpreadsheet(buffer, detectedType) {
    try {
        const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error('Workbook contains no sheets.');

        const worksheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

        if (!rows || rows.length < 2) {
            throw new Error('Spreadsheet does not contain sufficient transaction data (less than 2 rows).');
        }

        // Convert first 150 rows to clean CSV text for Gemini understanding
        const csvContent = XLSX.utils.sheet_to_csv(worksheet);

        return {
            sheetName,
            totalRows: rows.length,
            previewRows: rows.slice(0, 15),
            csvContent
        };
    } catch (err) {
        throw new Error(`Failed to parse spreadsheet file: ${err.message}`);
    }
}

module.exports = {
    ALLOWED_MIME_TYPES,
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE,
    validateAndDetectFileType,
    parseSpreadsheet
};

