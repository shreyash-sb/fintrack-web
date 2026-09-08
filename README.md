# 💰 Smart Expense Manager

A modern, responsive, and feature-rich **Personal Expense Tracker & Financial Management Web Application** built with HTML5, CSS3, and JavaScript. Fintrack helps users manage their income, track daily expenses, visualize financial health with interactive charts, set monthly category budgets, and achieve savings goals.

---

## 🌟 Key Features

### 🔐 1. User Authentication & Profile
- **Secure Multi-User System**: Individual accounts with isolated local data storage.
- **Custom Currency Selection**: Choose your preferred currency upon signup (`INR`, `USD`, `EUR`, `GBP`, `JPY`, `CAD`, `AUD`, `AED`).
- **Interactive Security**: Password reveal toggle and client-side validation.

### 💳 2. Transaction Management (CRUD)
- **Add, Edit & Delete**: Full transaction lifecycle with pre-filled inline edit modal.
- **Safety Undo Action**: Toast notification with 1-click **Undo** recovery upon deleting a transaction.
- **Rich Categories with Icons & Color Badges**:
  - *Expenses*: Food & Dining 🍔, Transportation 🚗, Housing & Rent 🏠, Bills & Utilities 💡, Shopping 🛍️, Entertainment 🎬, Health & Medical 🏥, Education 🎓, Travel ✈️, Other 🏷️.
  - *Income*: Salary 💼, Freelance 💻, Investments 📈, Business 🏢, Gifts 🎁, Other 💰.
- **Payment Method Tagging**: UPI / Digital Wallet, Credit Card, Debit Card, Net Banking, Cash.
- **Date & Notes**: Date picker with timestamps and optional context notes.

### 📊 3. Visual Analytics & Real-Time KPIs
- **Financial KPI Cards**:
  - **Total Balance**: Real-time net cashflow (`Income - Expenses`) with surplus/deficit status.
  - **Total Income**: Aggregated earnings with transaction credit counter.
  - **Total Expenses**: Aggregated spending with top expense category badge.
  - **Net Savings Rate**: Percentage of income saved with financial health guidance.
- **Interactive Charts (Chart.js)**:
  - **Monthly Cash Flow**: Income vs. Expense grouped bar chart with responsive tooltips.
  - **Category Expense Breakdown**: Interactive Doughnut chart displaying percentage proportions per category.

### 🎯 4. Monthly Budgets & Savings Goals
- **Category Spending Limits**: Set monthly budgets per category with animated progress bars and color-coded alert thresholds (Green `< 70%`, Amber `70–90%`, Red `> 90%` overspent alert).
- **Savings Goals Tracker**: Define financial targets (e.g., *Emergency Fund*, *New Laptop*, *Vacation*) with target amounts, target deadlines, progress bars, and quick "+ Deposit" actions.

### 🔍 5. Search, Multi-Filter & Sorting Engine
- **Instant Search**: Real-time filtering across titles, categories, and notes.
- **Multi-criteria Filters**:
  - *Type*: All Types, Expenses Only, Income Only.
  - *Category*: Filter by specific expense/income categories.
  - *Date Range*: All Time, Today, This Week, This Month, Last Month.
- **Sorting**: Date (Newest/Oldest), Amount (Highest/Lowest), Title (A–Z).

### 📤 6. Data Portability & Reports
- **Export to CSV**: Download spreadsheet-ready CSV files for Microsoft Excel and Google Sheets.
- **JSON Backup & Restore**: Full data portability to export backups or restore previous data.
- **Print / PDF Statement**: Clean, printer-friendly formatted financial statements.

### 🌓 7. Design & Customization
- **Dark & Light Themes**: Seamless theme switching with smooth transitions and persistent preference.
- **Glassmorphic Aesthetics**: Modern frosted glass cards, subtle ambient glows, and responsive layout for mobile, tablet, and desktop.

---

## 🛠️ Tech Stack

- **Frontend**: Semantic HTML5, Vanilla JavaScript (ES6+ Modular Architecture)
- **Styling**: Modern CSS3 (Custom Properties / Design Tokens, Glassmorphism, CSS Grid, Flexbox, Micro-animations)
- **Charts**: [Chart.js](https://www.chartjs.org/) (CDN)
- **Icons & Typography**: [FontAwesome 6](https://fontawesome.com/) (CDN), Google Fonts (*Plus Jakarta Sans*, *JetBrains Mono*)
- **Storage & State**: Client-side `localStorage` with JSON serialization & user-segregated storage

---

## 📁 Project Structure

```text
Fintrack/
├── index.html        # Login Page
├── signup.html       # User Registration Page (with Currency selection)
├── dashboard.html    # Main Financial Dashboard Interface
├── css/
│   └── style.css     # Design tokens, Dark/Light themes, Glassmorphism, Responsive Grid
├── js/
│   ├── storage.js    # Data layer, CRUD operations, formatters, CSV/JSON export/import
│   ├── charts.js     # Chart.js controller for Cashflow & Category Breakdown
│   ├── auth.js       # User session management and validation
│   └── main.js       # Main dashboard orchestrator (Modals, Filters, Budgets, Goals, Toasts)
└── README.md         # Project documentation
```

---

## 🚀 Getting Started

No complex build step, npm setup, or backend server required! The application runs natively in any modern web browser.

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/Fintrack.git
   cd Fintrack
   ```

2. **Run Locally**:
   - Double-click `index.html` or open with Live Server in VS Code / Antigravity IDE.
   - If you are a new user, click **"Create Account"** (`signup.html`) to set your name, email, password, and preferred currency.
   - Start adding your real income and expenses!

---

## 👨‍💻 Developer

**Shreyash Bobalade**  
*IT Engineering Student | Full Stack Developer*
