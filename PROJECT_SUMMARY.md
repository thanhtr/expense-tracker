# Expense Tracker Web - Project Summary

**Last Updated:** April 10, 2026
**Key Tech Stack:** Next.js 16.2.2, React, TypeScript, Tailwind CSS, Recharts 3.8.1, Splitwise API

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Data Flow](#data-flow)
4. [Key Technologies](#key-technologies)
5. [Project Structure](#project-structure)
6. [Important Files](#important-files)
7. [API Routes](#api-routes)
8. [Frontend Components](#frontend-components)
9. [Dashboard Details](#dashboard-details)
10. [Common Patterns & Learnings](#common-patterns--learnings)
11. [Recent Changes](#recent-changes)
12. [How to Run](#how-to-run)

---

## Project Overview

An expense tracking application built with Next.js that fetches expense data from Splitwise, caches it locally, and provides an interactive dashboard with category filtering, date range selection, visualizations, and transaction management.

**Key Features:**
- Real-time sync with Splitwise API
- Interactive dashboard with filtering and date range selection
- Category-based expense breakdown (pie chart)
- Daily spending visualization (stacked bar chart)
- Transaction list with inline editing and deletion
- CSV export capabilities
- Keyword-based automatic categorization
- Income/expense classification

---

## Architecture

### High-Level Flow
```
Splitwise API
    ↓
[Backend Services] → In-Memory Cache (5-min TTL)
    ↓
[API Routes] → /api/dashboard, /api/transactions, /api/categories, /api/export
    ↓
[Frontend Components] ← React Client Components
    ↓
[User Interface] → Dashboard, Transactions, Upload, Keywords
```

### Key Architectural Decisions

1. **All data lives in Splitwise** - The local PostgreSQL database (Prisma schema) is not actively used at runtime. All expenses are fetched from Splitwise on-demand.

2. **In-Memory Caching** - A simple `Map`-based cache with 5-minute TTL reduces API calls. Cache key includes filters (dates, category). **Note:** Cache is per-process, so on serverless cold starts it's empty.

3. **Server Components + Client Components** - Root page is a server component, but all interactive parts (dashboard, filters, charts) are client components with `'use client'`.

4. **No Global State Management** - All state is colocated using React `useState` + `useEffect`. Filters are passed as props between components.

5. **Filtering & Sorting in Memory** - No database queries. After fetching from Splitwise, filtering, grouping, and sorting happen in JavaScript.

---

## Data Flow

### Dashboard Data Flow

```
User sets filter (category, date range)
    ↓
DashboardStats useEffect triggers
    ↓
Fetch /api/dashboard?date_from=...&date_to=...&category=...
    ↓
Backend: aggregation-service.ts
  1. Fetch from Splitwise (or cache)
  2. Parse details (extract account, category)
  3. Filter by type (Expense/Income) and optional category
  4. Compute aggregations:
     - byCategory (sorted by amount desc)
     - byAccount (sum per account)
     - byDay (grouped by YYYY-MM-DD with stacked amounts)
     - topTransaction (highest amount)
     - allCategories (unique from unfiltered expenses)
     - transactionCount
    ↓
Return DashboardAggregation JSON
    ↓
Frontend renders charts & stats:
  - Pie chart (top 4 categories + "Other")
  - Stacked daily bar chart
  - Insight cards (top category, most expensive, avg/day, count)
```

### Category Resolution
When parsing expenses from Splitwise:
1. First, check `exp.details` (custom stringified JSON) for stored `category` and `account`
2. Fall back to `exp.category?.name` (Splitwise native category)
3. Fall back to empty string (uncategorized)

The `exp.details` field is set by the app when storing custom metadata, allowing override of Splitwise's native categories.

---

## Key Technologies

| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 16.2.2 | Framework, API routes, server/client components |
| React | Latest | UI library, hooks, state management |
| TypeScript | Latest | Type safety |
| Tailwind CSS | Latest | Styling (utility-first CSS) |
| Recharts | 3.8.1 | Charts (PieChart, BarChart with stacking) |
| Prisma | (unused at runtime) | Schema definition (aspirational/legacy) |
| PostgreSQL | (unused at runtime) | Would be used with Prisma if activated |
| Splitwise API | Public REST | Primary data source |

---

## Project Structure

```
expense-tracker-web/
├── app/
│   ├── layout.tsx              # Root layout with Navigation
│   ├── page.tsx                # Dashboard page (server component)
│   ├── api/
│   │   ├── dashboard/
│   │   │   └── route.ts        # GET /api/dashboard
│   │   ├── transactions/
│   │   │   └── route.ts        # GET /api/transactions (list, filter)
│   │   │   └── [id]/
│   │   │       └── route.ts    # PATCH/DELETE /api/transactions/[id]
│   │   ├── categories/
│   │   │   └── route.ts        # GET /api/categories
│   │   ├── export/
│   │   │   └── route.ts        # GET /api/export (CSV download)
│   │   ├── upload/             # CSV import
│   │   ├── keywords/           # Merchant keyword management
│   │   └── health/             # Health check
│   ├── transactions/
│   │   └── page.tsx            # Transactions list page
│   ├── upload/
│   │   └── page.tsx            # CSV upload page
│   └── keywords/
│       └── page.tsx            # Keyword management page
├── components/
│   ├── Navigation.tsx          # Nav bar (links to Dashboard, Transactions, Upload, Keywords)
│   ├── DashboardStats.tsx      # Main dashboard component (pie chart, daily chart, stats)
│   ├── TransactionFilters.tsx  # Filter inputs (category, date, account, type, merchant)
│   ├── TransactionTable.tsx    # Paginated transaction list with edit/delete
│   └── TransactionRow.tsx      # Single transaction row
├── lib/
│   ├── services/
│   │   ├── aggregation-service.ts  # Dashboard stats computation
│   │   ├── transaction-service.ts  # Transaction list logic
│   │   └── categorizer.ts          # (possibly unused in current flow)
│   ├── splitwise.ts            # Splitwise API client & parsing
│   ├── cache.ts                # Simple in-memory cache with TTL
│   ├── constants.ts            # User IDs, category map
│   ├── types.ts                # TypeScript interfaces
│   ├── db.ts                   # Prisma client (unused at runtime)
│   └── parsers/                # CSV parsers for bank statements
├── prisma/
│   └── schema.prisma           # Prisma schema (unused at runtime)
├── scripts/
│   └── (utility scripts)
└── public/
    └── (static assets)
```

---

## Important Files

### `lib/types.ts`
Defines the core data shapes:
- `ParsedTransaction` - Single transaction with date, account, merchant, amount, type, category
- `TransactionWithId` - Parsed transaction + id, paidBy, timestamps
- `DashboardAggregation` - Dashboard stats returned by /api/dashboard

**Key Fields in DashboardAggregation:**
```typescript
{
  totalExpenses: number;
  totalIncome: number;
  net: number;
  byCategory: { category: string; amount: number }[];    // sorted by amount desc
  byDay: { day: string; [categoryName]: number }[];       // grouped by YYYY-MM-DD
  byAccount: Record<string, number>;                      // sum per account
  byMonth: { month: string; amount: number }[];          // sorted chronologically
  topTransaction: { merchant, amount, category, date };
  allCategories: string[];                               // unique categories in period
  transactionCount: number;
  uncategorizedCount: number;
}
```

### `lib/services/aggregation-service.ts`
**Function:** `getDashboardStats(dateFrom?, dateTo?, category?)`

Fetches Splitwise expenses, applies filters, and computes all dashboard statistics. Caches results for 300 seconds.

**Key Logic:**
- Calls `getAllExpenses()` to get raw Splitwise data
- Maps to internal `ParsedTransaction` format
- Filters by type (Expense/Income) and optional category
- Computes aggregations (byCategory, byDay, byAccount, byMonth)
- Returns `DashboardAggregation` object

**Important:** When a `category` filter is provided, it filters AFTER fetching all data. The cache key includes the category, so different category filters cache separately.

### `components/DashboardStats.tsx`
The main dashboard component. Responsible for:

**State:**
- `selectedCategory` - User's active category filter (empty = all)
- `dateFrom`, `dateTo` - Date range filter (defaults to current month)
- `data` - Filtered dashboard aggregation
- `unfiltered` - Unfiltered aggregation (used for category dropdown)

**Two useEffects:**
1. Fetch unfiltered data whenever date range changes (to populate category dropdown)
2. Fetch filtered data whenever category or unfiltered data changes

**Renders:**
- Filter bar (category select, date inputs)
- Summary cards (Total Expenses, Income, Net, per-account)
- Uncategorized warning (if count > 0 and no category filter)
- Insight cards (Top Category, Most Expensive, Daily Average, Tx Count)
- Pie chart (top 4 categories + "Other" slice)
- Stacked daily bar chart (one bar per day, colored by category)

### `lib/splitwise.ts`
Splitwise API client. Exports:
- `getAllExpenses(filters)` - Paginated fetch from `/get_expenses` endpoint
- `parseExpenseDetails(detailsJSON)` - Parses custom stored metadata
- Error handling and API client setup

---

## API Routes

### GET `/api/dashboard`
Returns dashboard aggregation stats.

**Query Params:**
- `date_from` (optional) - Start date (YYYY-MM-DD)
- `date_to` (optional) - End date (YYYY-MM-DD)
- `category` (optional) - Filter by category name

**Response:** `DashboardAggregation`

**Example:**
```
GET /api/dashboard?date_from=2026-04-01&date_to=2026-04-30&category=General
→ { totalExpenses: 3010, byCategory: [...], byDay: [...], ... }
```

### GET `/api/transactions`
Returns paginated filtered transactions.

**Query Params:**
- `date_from`, `date_to` - Date range
- `category`, `account`, `type`, `merchant`, `paid_by` - Filters
- `offset` (default 0) - Pagination offset
- `limit` (default 50) - Items per page
- `sort_by` (default "date") - Sort field
- `order` (default "desc") - Sort order

**Response:**
```typescript
{
  transactions: TransactionWithId[];
  total: number;
  offset: number;
  limit: number;
}
```

### PATCH `/api/transactions/[id]`
Update category for a transaction (client-side only, doesn't sync to Splitwise).

**Body:**
```json
{ "category": "New Category" }
```

**Response:** `{ success: true, category: "New Category" }`

**Note:** Changes are stored in memory only. On next page load, the category reverts to what Splitwise has.

### DELETE `/api/transactions/[id]`
Delete expense from Splitwise. Removes from Splitwise permanently, invalidates cache.

### GET `/api/categories`
Returns sorted list of category names from `CATEGORY_MAP` constant.

**Response:**
```json
{ "categories": ["Dining Out", "Food & Groceries", ...] }
```

### GET `/api/export`
Export transactions as CSV. Same filtering as `/api/transactions`, but returns all results (limit=10000).

---

## Frontend Components

### `Navigation.tsx`
Simple navbar with links to:
- Dashboard
- Transactions
- Upload
- Keywords

### `DashboardStats.tsx` (detailed above)
Main dashboard with charts and stats.

### `TransactionFilters.tsx`
Filter form with controls:
- Category dropdown (fetches from `/api/categories`)
- Date range (inputs)
- Account (hardcoded OP, Amex, Finnair Visa)
- Type (Income/Expense)
- Merchant (free text)
- Paid by (tung/thuy)

Filters are **not applied automatically** - user must click "Apply Filters" button. Calls `onFilter(filters)` prop to parent.

### `TransactionTable.tsx`
Displays paginated transaction list. Accepts `filters` prop.

**State:**
- `offset` - Current page offset
- `transactions`, `total` - Current page data
- `loading` - Fetch state

**Features:**
- Pagination with previous/next/page number buttons
- Inline category editing (click to edit, calls PATCH)
- Delete button with confirmation
- CSV export button

### `TransactionRow.tsx`
Single transaction row with:
- Display of: date, merchant, amount, category, account, paid by
- Inline edit mode for category (text input, save/cancel)
- Delete button

---

## Dashboard Details

### Pie Chart
- Shows top 4 categories separately by color
- Remaining categories grouped into "Other" slice
- Displays percentage labels
- Tooltip shows formatted currency amount

### Stacked Daily Bar Chart
- One vertical bar per day in the date range
- Each bar is stacked with all categories as colored segments
- X-axis shows date (MM-DD format, angled for readability)
- Y-axis shows total amount in euros
- Legend shows all categories
- Tooltip shows category name and amount on hover

**When a single category is selected:**
- Pie chart shows one slice (100%)
- Daily chart shows single-color bars (only that category)

### Insight Cards
- **Top Category**: Most spent category name + amount
- **Most Expensive**: Single highest transaction's merchant + category + amount
- **Daily Average**: Total expenses ÷ number of days with expenses
- **Transaction Count**: Total number of expense transactions

---

## Common Patterns & Learnings

### 1. Category Resolution
Categories come from multiple sources:
- Custom stored in `exp.details` (highest priority)
- Splitwise native `exp.category?.name`
- Empty string if uncategorized

When displaying, uncategorized items are labeled as "⚠ Uncategorized".

### 2. Filtering Happens in Memory
All data flows from Splitwise → in-memory JS → filtered/grouped → returned. Large date ranges may be slow. Consider pagination or date range limits in UI.

### 3. Cache Key Strategy
Format: `expenses:{datedAfter}:{datedBefore}:{category}`

When changing **date range**, the fetch always hits the API (or cache miss) even if already fetched before. The category-specific cache is separate.

### 4. Date Handling
- Dates in UI inputs are YYYY-MM-DD strings
- Dates in backend are converted to Date objects
- ISO format used for API communication
- Display uses Intl.DateTimeFormat for localization (fi-FI)

### 5. Amount Sign Convention
- Splitwise stores positive amounts as "cost"
- Negatives are treated as income
- Internally, expenses are stored as negative (to show -€1000 spent)
- Math uses `Math.abs()` for display

### 6. Component Fetch Pattern
```typescript
const [data, setData] = useState(null);

useEffect(() => {
  const fetch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/...');
      if (res.ok) setData(await res.json());
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  fetch();
}, [dependencies]);
```

---

## Recent Changes (April 2026)

### Dashboard Improvements
1. **Interactive Filtering**
   - Added category dropdown populated from dashboard data
   - Date range now adjustable (not hardcoded to this/last month)
   - Filters apply instantly (no "Apply" button needed)

2. **New Visualizations**
   - **Pie Chart**: Replaced single bar chart with pie showing category breakdown (top 4 + "Other")
   - **Stacked Daily Chart**: New bar chart showing spending pattern per day with category breakdown

3. **Enhanced Statistics**
   - Top spending category
   - Most expensive single transaction
   - Daily average spending
   - Total transaction count

4. **Backend Support**
   - Added `byDay` aggregation (daily breakdown)
   - Added `topTransaction` field
   - Added `transactionCount` field
   - Added `allCategories` field (unique categories in date range)

### Category Filtering
- Backend now supports optional `category` query parameter
- When category is selected, expenses are filtered before aggregation
- Dropdown shows only categories with expenses in the selected date range

---

## How to Run

### Development
```bash
npm install
npm run dev
# Open http://localhost:3000
```

### Build
```bash
npm run build
npm start
```

### Environment
Requires `.env.local` with Splitwise API credentials:
```
NEXT_PUBLIC_SPLITWISE_API_KEY=...
SPLITWISE_USER_ID=...
WIFE_ID=...
```

### Database (Unused at Runtime)
Schema is defined in `prisma/schema.prisma` but not used. To activate:
```bash
npx prisma migrate dev
npx prisma generate
```

---

## Next Steps / Future Improvements

1. **Persistence**: Activate Prisma/PostgreSQL to store transactions locally for faster queries and offline support
2. **More Parsers**: Add bank statement parsers for accounts not using Splitwise
3. **Budgeting**: Add monthly budget goals by category
4. **Trends**: Historical spending trends (year-over-year, moving averages)
5. **Receipts**: Attach and store receipt images
6. **Sharing**: Share expense reports with family members
7. **Mobile**: Add mobile-responsive optimizations or native app

---

## Troubleshooting

### "Cannot read properties of undefined (reading 'map')"
Usually means an API response is missing an expected field. Check the response structure from `/api/dashboard` matches `DashboardAggregation` type.

### Categories don't appear in dropdown
Verify:
1. Splitwise data has transactions in the selected date range
2. Transactions have non-empty `category` fields
3. Check browser console for fetch errors

### Charts don't display
Check:
1. `data.byCategory` or `data.byDay` arrays are not empty
2. Recharts components are imported correctly
3. Browser console for render errors

### Changes to categories don't persist
Expected behavior - category edits via PATCH are in-memory only. Page reload reverts to Splitwise source.

---

**For future sessions:** This document contains the full architecture and recent dashboard implementation. Refer back when making changes to understand dependencies and data flow.
