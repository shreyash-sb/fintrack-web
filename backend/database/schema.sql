-- ==============================================================================
-- Fintrack - High-Performance Relational Schema (MySQL 8.0+)
-- Optimized for: Precision Accounting, Zero Waste, Fast Indexing, Strict Integrity
-- ==============================================================================

-- 1. Users Table (Core Identity & Session Preferences)
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    avatar_url VARCHAR(500) NULL,
    theme VARCHAR(10) NOT NULL DEFAULT 'light',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Smart Financial Statement Imports Table (Staging, History & Reconciliation Audit)
CREATE TABLE IF NOT EXISTS statement_imports (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    filename VARCHAR(255) NOT NULL,
    file_hash VARCHAR(64) NOT NULL,
    file_type VARCHAR(50) NOT NULL,
    account_name VARCHAR(100) NULL DEFAULT 'Primary Account',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    start_date DATE NULL,
    end_date DATE NULL,
    opening_balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    closing_balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    calculated_closing_balance DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    reconciliation_difference DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_credits DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_debits DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    total_extracted INT NOT NULL DEFAULT 0,
    imported_count INT NOT NULL DEFAULT 0,
    skipped_count INT NOT NULL DEFAULT 0,
    reconciliation_status ENUM('reconciled', 'discrepancy', 'requires_review') NOT NULL DEFAULT 'requires_review',
    status ENUM('uploaded', 'analyzed', 'confirmed', 'rolled_back') NOT NULL DEFAULT 'uploaded',
    extracted_data_json MEDIUMTEXT NULL,
    adjustment_applied BOOLEAN NOT NULL DEFAULT FALSE,
    adjustment_amount DECIMAL(14, 2) NULL,
    adjustment_reason VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_statements_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_statements (user_id, created_at),
    INDEX idx_user_file_hash (user_id, file_hash),
    INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Transactions Table (Core Financial Ledgers & Import Lineage)
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    import_id VARCHAR(64) NULL,
    fingerprint VARCHAR(64) NULL,
    title VARCHAR(191) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    type ENUM('income', 'expense', 'transfer', 'refund') NOT NULL DEFAULT 'expense',
    category VARCHAR(50) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'upi',
    date DATE NOT NULL,
    notes VARCHAR(500) NULL,
    receipt_url VARCHAR(500) NULL,
    receipt_public_id VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_transactions_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_transactions_import FOREIGN KEY (import_id) 
        REFERENCES statement_imports(id) ON DELETE CASCADE,
    INDEX idx_user_date (user_id, date),
    INDEX idx_user_type (user_id, type),
    INDEX idx_user_category (user_id, category),
    INDEX idx_user_fingerprint (user_id, fingerprint),
    INDEX idx_import_id (import_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Monthly Category Budgets Table
CREATE TABLE IF NOT EXISTS budgets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    category VARCHAR(50) NOT NULL,
    monthly_limit DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_budgets_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_category UNIQUE (user_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Savings Goals Table
CREATE TABLE IF NOT EXISTS savings_goals (
    id VARCHAR(64) NOT NULL PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(150) NOT NULL,
    target_amount DECIMAL(12, 2) NOT NULL,
    current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    deadline DATE NULL,
    color VARCHAR(30) DEFAULT '#6366f1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_goals_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_goals (user_id, deadline)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
