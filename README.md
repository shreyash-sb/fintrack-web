# 💰 Fintrack

> Personal Expense Tracker & AI Financial Intelligence Platform.  
> Built with **Node.js, Express, MySQL, Vanilla JavaScript, and Google Gemini 3.5 Flash**.

---

## ⚡ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file in the root folder:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD="your_mysql_password"
DB_NAME=fintrack_db
JWT_SECRET=your_jwt_secret_key
```

### 3. Initialize Database & Run

```bash
# Set up MySQL tables
npm run db:init

# Start development server
npm run dev
```

Open **`http://localhost:3000`** in your browser.

---

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js, JWT, Helmet
- **Database:** MySQL (`mysql2` pool)
- **AI Engine:** Google Gen AI SDK (`gemini-3.5-flash-lite`)
- **Frontend:** Vanilla HTML5, CSS3, ES6+ JavaScript, Chart.js

---

## ✨ Core Features

- **Smart Statement Import:** Ingest bank statements (PDF, Excel, CSV, Images) with automatic balance reconciliation and duplicate prevention.
- **Gemini 3.5 Flash Advisor:** Real-time financial insights grounded in your actual income, expenses, and savings goals (session keys kept in RAM only).
- **Cumulative Balance Rollover:** All-time cash-on-hand is retained continuously across months, with per-month budget resets.
- **Budgets & Savings Goals:** Set category limits and track goal milestones with visual progress indicators.
- **Backup & Portability:** Export to CSV/JSON and restore data with 1 click from the sidebar.

---

## 📡 API Overview

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/auth/register` | POST | Register new user account |
| `/api/auth/login` | POST | Sign in and receive JWT token |
| `/api/transactions` | GET, POST, PUT, DELETE | Manage financial transactions |
| `/api/budgets` | GET, POST, DELETE | Manage category budget targets |
| `/api/goals` | GET, POST, DELETE | Manage savings goals and deposits |
| `/api/statements/upload` | POST | Upload and reconcile bank statements |
| `/api/ai/chat` | POST | Query Gemini 3.5 Flash financial advisor |
