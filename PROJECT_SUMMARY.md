# Expense Tracker Web - Project Summary

**Last Updated:** September 10, 2026
**Key Tech Stack:** Next.js 16.2.2, React, TypeScript, Tailwind CSS, Recharts 3.8.1, PostgreSQL (Neon)

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
- Learned rule-based automatic categorization (from user corrections and Splitwise history)
- Income/expense classification
- Keyword rules management via UI

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

6. **Sentinel Expense Pattern** - Learned rules are stored in a special Splitwise sentinel expense with gzip compression:
   - Description: `__learned_rules__` (to identify it)
   - Date: `2000-01-01` (out of normal date range)
   - Cost: `€0.01` (minimal, valid amount)
   - Details field: Gzip-compressed base64-encoded `LearnedRulesStore` JSON
     - `{ rules: Record<normalizedMerchantKey, LearnedRule>, version, updatedAt }`
     - `LearnedRule` includes `category` and `count` (how many corrections confirmed it)
   - Enables persistence across serverless cold starts without external database
   - Soft-delete aware: Bootstrap skips transactions marked with `deleted_at`

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

### Category Resolution (Three-Tier System)
When parsing expenses from Splitwise for display:
1. Check `exp.details` (custom stored) for `category` and `account`
2. Fall back to `exp.category?.name` (Splitwise native category)
3. Fall back to empty string → displayed as "⚠ Uncategorized"

**Bootstrap behavior (different):**
- Uses ONLY `exp.category?.name` (current Splitwise state user sees in UI)
- Ignores `exp.details.category` (may be stale from transaction creation)
- Skips soft-deleted transactions (`deleted_at` set)
- Majority-vote when merchant has multiple historical categories

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
│   │   ├── learned-rules-service.ts # Learned rules storage and categorization
│   │   └── categorizer.ts          # Transaction categorization using learned rules
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

### GET `/api/keywords`
Fetch all learned rules from Splitwise sentinel.

**Response:**
```typescript
Keyword[] // [{ id: number, keyword: string, category: string, priority: number }, ...]
```

### POST `/api/keywords`
Add a new learned rule manually.

**Body:**
```json
{ "keyword": "netflix", "category": "Subscriptions" }
```

**Response:** `Keyword` (newly created keyword with assigned id)

### PUT `/api/keywords/[id]`
Update a learned rule.

**Body:**
```json
{ "keyword": "hulu", "category": "Entertainment" }
```

**Response:** `Keyword` (updated keyword)

### DELETE `/api/keywords/[id]`
Delete a learned rule.

**Response:** `{ success: true }`

### POST `/api/keywords/bootstrap`
Seed learned rules from Splitwise history (March 2026 active transactions only). Uses majority vote when a merchant has multiple historical categories.

**Response:**
```json
{ "success": true, "learned": 63, "skipped": 0 }
```

### POST `/api/keywords/clear`
Delete all learned rule sentinels and reset to empty state.

**Response:**
```json
{ "success": true, "message": "Cleared N learned rules sentinels" }
```

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

### `KeywordManager.tsx`
Component for managing learned rules at `/keywords` page.

**Features:**
- View all learned rules in a table
- Add new learned rule manually with form (keyword + category inputs)
- Delete individual rules with confirmation
- Bootstrap from history button (calls `/api/keywords/bootstrap`)
- Clear all rules button (calls `/api/keywords/clear`)
- Real-time status messages for all operations

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

### Reinforced Learning for Category Matching
- **Two-tier categorization system** prioritizes: learned rules → Splitwise native category
- **Learned rules** stored in Splitwise sentinel expense with gzip compression
  - Learns from user category corrections (accumulated in PATCH `/api/transactions/[id]`)
  - Each rule tracked with `count` field (increments on repeat corrections)
  - Merchant names normalized before storage (strips legal suffixes, handles brand variants)
  - Gzip+base64 compression reduces 65KB JSON to ~5-10KB for safe storage in Splitwise details field

- **Keyword rules management UI** at `/keywords` page via `KeywordManager` component
  - Manage learned rules (add/delete/view)
  - Bootstrap from history: `/api/keywords/bootstrap` scans March 2026 active transactions only (majority vote)
  - Clear all: `/api/keywords/clear` resets learned rules

- **CSV upload integration** via `categorizeWithLearning()` in upload flow
  - New transactions auto-categorized using learned rules before pushing to Splitwise
  - **No retroactive recategorization** of existing transactions (learning is forward-looking only)

- **Implementation details:**
  - Bootstrap uses `exp.category?.name` (current Splitwise state), not `details.category` (may be stale)
  - Bootstrap skips soft-deleted transactions (`deleted_at` set)
  - Soft-delete aware: Splitwise deletes mark with `deleted_at` but still return in API

- **Files:**
  - `lib/services/learned-rules-service.ts` — Gzip storage, cache, recordCorrection, bootstrapRulesFromHistory
  - `app/api/keywords/route.ts`, `[id]/route.ts`, `bootstrap/route.ts`, `clear/route.ts` — All keyword/bootstrap API endpoints
  - `app/keywords/page.tsx` — Keywords management page
  - `components/KeywordManager.tsx` — Keyword UI component
  - Test coverage: `__tests__/unit/learned-rules-service.test.ts`, `__tests__/unit/api/keywords.test.ts`, `__tests__/e2e/keywords.spec.ts`

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

### Database
PostgreSQL (Neon) is active. Schema: `Transaction`, `LearnedRule`, `Budget` models.
```bash
npx prisma migrate dev
npx prisma generate
```

---

## Recent Changes (August 2026)

### Quick wins (branch: `fix/quick-wins`)
- **A1**: Finnair parser now uses `parseFinnishAmount` instead of `parseFloat` — handles comma-decimal Finnish amounts correctly
- **A2**: Removed non-functional ↑/↓ priority buttons from KeywordManager — categorizer uses longest-match, not priority order; added explanatory note
- **A3**: `LearnedRule.count` now exposed in `/api/keywords` GET response and shown as "Matches" column (dim for count < 5 = low confidence)
- **C3**: TransactionTable shows an empty-state message when no transactions match filters

### UX improvements (branch: `feat/live-filters`)
- **A4**: TransactionFilters fires `onFilter` on every input change — selects/dates/checkboxes immediately, merchant/amount after 300 ms debounce. "Apply Filters" button removed.
- **A5**: Reset button shows active filter count badge e.g. "Reset (3)"
- **C4**: KeywordManager has a client-side search input that filters keyword table by keyword or category; shows "N of M" count

### Per-person spending (branch: `feat/per-person-spending`)
- **B3**: Added `byPerson` aggregation to `DashboardAggregation` (keyed by `paidBy`). Dashboard Insights card shows Tung / Thuy / Other spending row.

### Category trend chart (branch: `feat/category-trends`)
- **B1**: Added `byCategoryMonth` to `DashboardAggregation`. New "Category trend" stacked bar chart on dashboard (visible when period spans > 1 month).

### Budget tracking (branch: `feat/budget-tracking`)
- **B2**: New `Budget` DB model (category unique, monthlyLimit). API: `GET/POST /api/budgets`, `DELETE /api/budgets/[id]`. `BudgetCard` component on dashboard shows progress bars (green/amber/red at 0–70%/70–100%/>100%). Click any limit value to edit in-place. "+ Add budget" adds categories not yet budgeted.

---

## Recent Changes (September 2026)

### FIRE calculation audit and tax-model fix (branch: `claude/fire-feature-calculation-review-bbiz0e`)
The gross-up formula for portfolio withdrawals conflated the hankintameno-olettama
**deemed acquisition cost** percentage (20%, statutory) with the **capital income tax
rate** itself, and applied it as a single flat divisor. Fixed to model Finnish tax
law correctly and conservatively:
- `capitalGainsTaxRate` config field renamed to **`deemedCostPct`** (default
  unchanged, 0.20 — the worst-case rate that applies to any holding period; the
  more generous 40% requires 10+ years and is never assumed, since no per-lot cost
  basis is tracked). Migration: `20260910000000_rename_capital_gains_tax_rate`.
- New `grossUpAnnual()` in `lib/services/fire-service.ts` applies Finland's actual
  progressive capital-income tax to the taxable gain (after the deemed-cost
  reduction): 30% up to €30,000/year of taxable gain, 34% above — instead of a flat
  20% divisor. Because Phase 1A/1B annual withdrawals comfortably exceed the €30k
  threshold, most of the gain in those phases is taxed at 34%, not 30%.
- Net effect: the default Pure FIRE target rose from ~€903k (bug) to ~€965k
  (correct), i.e. the tool was previously understating the required portfolio by
  ~7%. `FireDashboard`'s "How this model works" panel and config tooltips updated
  to explain the corrected formula and fix a reversed claim (the tooltip previously
  said 20% deemed cost applies for holdings *over* 10 years — it's the opposite:
  20% applies to *any* holding period, 40% requires 10+ years).
- Assumes a single taxpayer for the €30k threshold (no benefit from splitting
  withdrawals across a spouse's separate allowance) — flagged as a known
  simplification in the model explainer, not fixed, since it would require
  assuming a specific ownership/withdrawal split with no data to back it.
- **Not fixed, flagged only** (bigger, more subjective changes — see model explainer
  and conversation for detail): the model uses a constant deterministic annual
  return with no sequence-of-returns risk / volatility modeling, and the FIRE
  target is solved to reach exactly €0 at life expectancy with no residual buffer.
  Both are real limitations worth a follow-up if a Monte Carlo or buffer-margin
  feature is wanted.

### FIRE model review for Finland / household (branch: `fix/fire-finland-review`)
A second audit checked the model against Finnish rules and the actual household situation (two spouses born ~1990, both stopping work together, regular securities accounts, a rental property). It found and fixed these issues:
- **Pension age**: default 65 → **68**. For people born 1965+, the lowest retirement age is tied to cohort life expectancy, and ETK estimates **67 y 9 m** for the 1990 cohort. The tooltip previously said "65 for most".
- **Pension input was misused**: `pensionNetMonthly` was entered from the pension-company statement (the combined pension *accrued so far*, gross), but the model used it as the net pension at retirement. It was renamed to **`pensionAccruedMonthly`**, and the pension is now projected by `computePension()`:
  - accrued so far, plus 1.5% × `annualGrossEarnings` (gross, per tyoelake.fi) per year until `retirementAge` (nothing after)
  - × `lifeExpectancyCoef` (default 0.90, an estimate; the 1964 cohort's confirmed value is 0.946)
  - × (1 − `pensionTaxRate`, default 20%)
  - `annualGrossEarnings` defaults to 0 (accrued-only, conservative), and the UI warns until it is set.
- **Deemed cost 20% → 40% default**. FIFO is mandatory within a securities account (vero.fi), so retirement sales come from the oldest lots, held 10+ years whenever retirement is 10+ years away. Taxable = sale − max(actual cost, 40%), so at most 60% of a sale is taxed. The previous "20% = worst case" reasoning was wrong, not conservative. If retirement is < 10 years away, `withHoldingPeriodRule()` caps it at 20% for the target, phases and projection, and a warning explains why.
- **Per-spouse threshold**: new `taxpayers` (default 2). `grossUpAnnual()` splits the need across taxpayers, each with their own €30k 30%-bracket threshold.
- **Rental income**: new `rentalNetMonthly` (net of costs, before tax). It offsets withdrawals in every phase, is taxed as capital income and uses up the threshold; `grossUpAnnual(..., { otherCapitalIncome })` solves this in closed form.
- **Years to FIRE was inconsistent**: it compared the portfolio against the target for the *configured* retirement age, so reaching it earlier looked feasible even though retiring earlier needs more. The new `computeEarliestFire()` binary-searches the first month where portfolio(age) ≥ target(retire at that age), up to pension age: it scans year by year and then refines by month, so it doesn't rely on the result only improving with age, and ages under 10 years away use at most 20% deemed cost. It replaces `computeYearsToFire` and also drives the chart what-if.
- Migration `20260925000000_fire_pension_and_tax_model` renames the pension column, adds the new fields, and changes only the *defaults* for `pensionAge` / `deemedCostPct`. Saved values are untouched and have to be updated in the config panel.

**Sources:** every Finnish-rule statement in the FIRE explainer and tooltips links to a page that was read and confirmed (the `SOURCES` registry in `components/FireDashboard.tsx`: vero.fi, tyoelake.fi, ETK, STM). Claims without a source are worded as the model's own assumptions (default returns, the 0.90 life-expectancy coefficient, the pension tax %). Keep it that way when editing.

**Flagged, not changed:**
- 6% real accumulation return is optimistic (5% costs ~0.6 yr).
- The €30k threshold is nominal and not indexed, so it shrinks in real terms.
- The wage-coefficient uplift of accrued pension is ignored (conservative).
- Cash above the buffer is counted as if invested.
- Mandatum (partly employer-funded) is taxed like a regular investment.
- Only one pension age is modelled for both spouses.
- Pension accrual stops at the target retirement (FIRE) age. Barista income earns no pension (in reality part-time pay accrues 1.5% of gross), so the Barista scenarios slightly understate the pension. Kept deliberately (user decision, 2026-09-24).
- Future earnings are held at today's derived gross salary in real terms. Real wage growth before FIRE is ignored (conservative).
- Surplus rent/pension beyond spending is not reinvested.
- No sequence-of-returns risk and no plan-end buffer (see September 2026 audit above).

### FIRE inputs derived from data (branch: `feat/fire-derived-inputs`)
Three FIRE inputs were settings but are facts that can be read off the data, so they are now derived and no longer editable:
- **Deemed acquisition cost** — `deemedCostPct(config)` in `fire-service.ts`: 40% when the retirement age is 10+ years away, otherwise 20% (vero.fi: 20% under 10 years, 40% for 10+; FIFO). It applies to every candidate age in the earliest-FIRE search, which replaced the earlier `withHoldingPeriodRule`.
- **Combined gross earnings** — `lib/services/fire-inputs-service.ts`: average monthly net salary (Income, category `Salary`, last 12 months, over the months that have pay) × 12 ÷ (1 − 30% − 7.3% − 0.89%).
  - 7.3% employee pension contribution (tyoelake.fi) and 0.89% unemployment insurance (Työllisyysrahasto) are the 2026 rates.
  - The 30% income tax is the user's own flat estimate.
- **Rental** — rules in `FIRE_RENTAL` (`lib/constants.ts`):
  - Rent: Income transactions matching IncomeRules whose label starts with "Rental income" (Kela + tenant).
  - Rent matching uses `matchesAnyIncomeRule`, so each rule's merchant pattern *and* category must match.
  - Deductible fees:
    - As Oy Säästötupa (fully rented flat): 100%, paid out of the rent (reduces cash).
    - As Oy Matela (own home with one Airbnb room): 15%, the user's estimate. It is tax-only: it lowers taxable rent but not cash, because it's an own-home cost.
  - Taxable rent is floored at 0; a rental loss offsetting sale gains isn't modelled.
  - Rental loan: payments to FI73 5723 8183 6277 67, at 6-month Euribor + 0.6%. Euribor comes live from the ECB Data Portal (cached a day, falling back to the August 2026 value).
  - The loan's balance is derived as an annuity from its payment and its end (`mortgageEndAge`). The derived inputs carry the payment and the rate. `rentalLoanInterestInRetirement()` in `fire-service` computes the exact average interest between retirement and loan end for each retirement age tested (including in the earliest-FIRE search). The ECB fetch times out after 3 s and falls back to the cached rate.
  - Rent cash (rent − fees) offsets withdrawals in all phases. Loan interest only lowers *taxable* rent, and only in Phase 1A, since repayments are already part of Phase 1A spending.
  - `grossUpAnnual` takes `otherCapitalIncomeTaxable` separately from the cash.
  - Airbnb income is deliberately excluded.
- Types: `StoredFireConfig` (saved settings) and `DerivedFireInputs`. `FireConfig` is both combined. `/api/fire` returns the combined `config`, plus `derived` (breakdowns) and `deemedCostPct`. The config panel shows a "Derived from your data" block with sources.
- The DB columns `deemedCostPct`, `annualGrossEarnings` and `rentalNetMonthly` were kept (unused) for the #156 deploy to avoid downtime, then dropped in a follow-up migration (`20260926000000_drop_derived_fire_columns`). Pattern for future renames and drops: stop reading the column first, deploy, then drop it.
- Effect on the saved config: earnings accrual lifts the projected pension to ~€3,000/mo net combined, and the target to retire at 52 falls to ~€709k.

### Amex refund/credit rows silently corrupted with NaN amount (branch: `fix/amex-unicode-minus-nan-amount`, PR #158)
A Paytrail refund and a card-payment-received line weren't showing up anywhere on the
dashboard (not in expenses, income, or reimbursement netting) and were dragging the
Spending Guidelines panel's "this month" figures wrong.
- **Root cause**: Amex's Finnish CSV export writes credit/refund amounts with **U+2212
  MINUS SIGN** (`−339,90`), not an ASCII hyphen. `parseFinnishAmount` (`lib/parsers/utils.ts`)
  only replaced comma→dot, so `parseFloat` returned `NaN` for these rows. `amex.ts` had no
  guard (unlike `generic.ts`, which already skips unparseable amounts), so the `NaN` was
  written straight into Postgres as a literal float `NaN` — which fails every `<`/`>`/`=`
  comparison, so the row became invisible to every aggregation query instead of erroring
  loudly. Two production rows were corrupted this way before it was caught.
- **Fix**: `parseFinnishAmount` now normalizes unicode dash/minus variants to `-` before
  parsing; `amex.ts` now skips (with a console warning) any row that still fails to parse,
  matching `generic.ts`'s existing guard.
- **Debugging note for future sessions**: when inspecting `Transaction.amount` via Prisma
  and it prints as `null`, check `amount <> amount` (SQL NaN test) before assuming it's a
  real SQL `NULL` — `JSON.stringify(NaN)` silently renders as `null`, which is exactly what
  masked this for a while.
- The two corrupted rows were fixed directly against the DB, not via migration: one deleted
  and re-imported from its original statement CSV (now that the parser handles it), one
  amount-corrected in place after the user confirmed it was a genuine €0 transaction.

### Reimbursements netted into byMonth/byDay/byCategoryMonth, linked-only (branch: `fix/net-reimbursements-in-trend-charts`, PR #159)
`byCategory`/`net` already netted reimbursements (both unlinked/"blanket" positive-amount
Expense rows and explicitly `TransactionLink`-linked ones) against a category's gross
total, but the trend series — `byMonth`, `byDay`, `byCategoryMonth` — were built purely
from raw negative outflows and never got refunds subtracted, so any period containing a
refund showed an inflated total in the trend charts even though `byCategory`/`net` were
already correct.
- **Linked reimbursements** (a `TransactionLink` row pointing at a specific expense) are
  now netted into `byMonth`/`byDay`/`byCategoryMonth` too, keyed to that expense's own
  date — safe, since the expense is guaranteed to already have a positive entry in those
  maps (it's a real transaction inside the current filtered view).
- **Unlinked/"blanket" reimbursements** (a category-level refund with no specific
  originating expense) are deliberately **not** netted into the date-keyed breakdowns — an
  earlier version of this fix tried attributing them to their own posting date, but that
  can create a brand-new negative-only entry when that day/month/category had no matching
  spend at all, which renders as a negative-height segment in the daily/monthly trend
  charts. They're still netted into `byCategory` (a period-total aggregate, where "which
  day" doesn't matter) as before.
- Caught in code review before merge — a useful pattern: a "net this into every
  time-bucketed view" fix needs to ask whether the thing being netted actually has a known
  time it belongs to, or only a period-total total.

### Multi-select category filter + transactions sum (branch: `feat/multi-select-category-filter`, PR #160)
The single-category `<select>` filter on both the dashboard and the transactions page is
now a multi-select, following the same shape already used for `accounts` end-to-end:
comma-joined query param → route splits into an array → service takes `categories?: string[]`
→ Prisma `{ in: categories }`. New shared `components/MultiSelectDropdown.tsx` (a
dropdown-with-checkboxes control) backs both pages — categories are a long, dynamic list, so
the toggle-button pattern `ACCOUNT_NAMES` uses doesn't fit.
- `lib/validation.ts`'s new `categoryParam` mirrors `accountParam` but doesn't validate
  against a fixed list (categories are free-form): comma-split, trim, dedupe, cap at 30.
- The transactions page's "Uncategorized only" checkbox is now a proper `uncategorizedOnly`
  filter field end-to-end (query param `uncategorized=1`), replacing a `'__uncategorized__'`
  sentinel that used to be smuggled through the `category` field.
- `aggregation-service.ts`'s non-spending-category income exclusion escape hatch
  (`categoryFilterIsNonSpending`) generalizes to: true only when every selected category is
  non-spending — a mixed or all-spending selection keeps the default exclusion.
- Transactions page also gained a signed net sum of the filtered result set (`· Net €X`, next
  to "Showing X to Y of Z"), computed via one `prisma.transaction.aggregate({ where, _sum })`
  alongside the existing count/findMany — not summed client-side, since pagination means the
  client only ever holds one page of rows.
- A code-review pass before merge found the CSV export silently ignoring "Uncategorized
  only" (`exportQuerySchema` was missing the `uncategorized` field zod would otherwise
  strip) and a stale e2e test still targeting the old native `<select>` — both fixed; the
  duplicated `category.split(',').filter(Boolean)` pattern across all three route files was
  also extracted into a shared `splitCommaParam()` helper in `lib/validation.ts`.

### Spending Guidelines surplus no longer guesses income-vs-savings funding (branch: `fix/guideline-surplus-stability`)
The guideline panel (`components/GuidelinePanel.tsx`) used to cap "Investments" spend at
`max(0, totalIncome - totalExpenses)` before folding it into the Savings bucket — a guess at
whether investments were funded by that period's income or by drawing on existing savings.
The guess recomputed on every render, making "surplus" feel unstable (per user feedback,
2026-09-28: "it shouldn't be so dynamic... the surplus is not reflective of the real
situation, as well as inconsistent").
- `components/DashboardStats.tsx`'s `investmentsInjection` now injects the real, full
  `data.totalInvestments` amount, not a capped/guessed one.
- `GuidelinePanel.tsx`'s `surplus` is no longer clamped to 0 — it can go negative when bucket
  spend (most often Investments) exceeds income for the period, rendered as a red "Overspent
  (from savings)" row instead of a grey "Surplus" one (same `data-testid="guideline-surplus"`,
  differs only in sign/label).
- Trade-off accepted deliberately: bucket totals (and thus the panel) can now legitimately
  exceed 100% of income in a month where you invested from savings, instead of always
  reconciling to ~100% via an unverifiable assumption.
- `__tests__/e2e/dashboard.spec.ts`'s "transfer-funded investments are excluded from savings
  guideline" test (which asserted the old capping behavior) was replaced with "investments
  beyond the income surplus show as overspent, not silently excluded".

### InfoTip ("?" popover) overflowing off-screen on mobile (branch: `fix/infotip-mobile-overflow`)
Audited every tooltip-like pattern in the app (custom components, native `title` attrs,
Recharts chart tooltips) for mobile overflow. Recharts tooltips already clamp correctly
(verified on a 390px viewport). The one real bug: `InfoTip` in `components/FireDashboard.tsx`
(the "?" info popover, FIRE page only) positioned itself with static Tailwind classes
(`left-0`/`right-0`, chosen per call site via a manual `align` prop) with no actual
viewport measurement — on a 390px screen, 2 of 3 call sites ran off the right edge with
text cut off mid-sentence.
- `InfoTip` now measures itself via `getBoundingClientRect()` on the trigger button and its
  own popup (in `useLayoutEffect`, so there's no visible flash of the wrong position), and
  renders as `position: fixed` with `left` clamped to an 8px margin from both screen edges,
  flipping to render below the trigger instead of above it if there isn't enough vertical
  room. This replaced the `align` prop entirely — removed from all call sites.
- Verified empirically (Playwright, not a unit test — jsdom's `getBoundingClientRect` always
  returns zeros, so this class of layout bug can only be caught with a real browser/viewport)
  at 320px, 390px, and 1280px: all 16 `InfoTip` instances across the FIRE page (3 always-visible
  + 13 inside the expandable Configuration panel) stay within the viewport at every width.
- No dedicated e2e spec exists for `/fire` (it needs a nontrivial `/api/fire` mock), so no
  automated regression test was added for this specific fix — a known gap, flagged rather
  than silently skipped.

### Theme now actually follows "System" live, ThemeToggle gained a way back to it (branch: `fix/theme-follow-system`)
The app's dark/light theme (both plain web and installed PWA) didn't track the OS's live
"System" setting, per user report (2026-09-28) — installed PWAs especially, since they can
stay resident for hours without a full reload.
- **Root cause**: the flash-prevention bootstrap script in `app/layout.tsx` eagerly added a
  static `.dark` class whenever it detected the system was in dark mode *at that page load*,
  even with no explicit user preference saved. `globals.css` already had a correct
  `@media (prefers-color-scheme: dark) { :root:not(.light) {...} }` fallback that would
  track OS changes live with zero JS — the eager class-add defeated it by freezing the
  snapshot from cold-launch.
- **Fix**: the script now only adds a class when there's an *explicit* saved `'dark'` or
  `'light'` choice; with no saved preference ("System"), it does nothing and lets the CSS
  media query (and the already-correct media-conditioned `<meta name="theme-color">` tags
  from the `viewport` export) drive live updates.
- **Related gap, also fixed**: `ThemeToggle.tsx` was a plain light/dark toggle with no way
  back to "System" once clicked — any user who ever tried it got permanently stuck
  overriding their OS setting. It's now a 3-way System → Light → Dark → System cycle
  (monitor/sun/moon icons), reading/writing the same `localStorage.theme` key the bootstrap
  script uses (`removeItem` for "System").
- Verified with Playwright: with no explicit preference, switching the emulated OS color
  scheme from dark to light *without reloading* updates the rendered background live; an
  explicit preference correctly stays pinned even when the OS also changes to match it
  later; the full 3-click toggle cycle (including back to System) works with the correct
  `localStorage` state and aria-label at each step.

---

## Next Steps / Future Improvements

1. **More Parsers**: Add bank statement parsers for more accounts
2. **Receipts**: Attach and store receipt images
3. **Sharing**: Share expense reports with family members
4. ~~**Trends**: Year-over-year comparison, moving averages~~ — done, see "Year-over-year
   comparison on Trends" above
5. **Forecast seasonality**: once there's a full year of history (pre-2026 data was deleted),
   revisit blending same-month-last-year into the forecast (see "Spending forecast redesigned"
   above)
6. ~~**Drop the Avios purchase/bonus ledger (`PointsPurchase`) for now**~~ — done, see "Avios
   purchase/bonus ledger dropped" below. One follow-up remains: drop the now-unread
   `PointsPurchase` table itself in a migration after this deploys (`prisma db execute` +
   `migrate resolve --applied`, never `migrate dev`/`reset`, per this DB's established pattern).

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

## Recent Changes (October 2026)

### Spending forecast removed (branch: `chore/remove-spending-forecast`)
The next-month spending forecast (`lib/services/forecast-service.ts`, dashboard `ForecastCard`) was a
single EMA number per category with no confidence interval, no minimum-history guard, and missing
months counted as literal €0 spend — judged too vague and unreliable to keep. Removed entirely
(service, `/api/forecast` route, UI card, test mocks). No replacement yet; revisit only with a model
that can express uncertainty and handle sparse/irregular categories correctly.

### Refunds shown as their own chart series (branch: `feat/refund-series`)
Unlinked ("blanket") reimbursements were netted into `byCategory` (a period-total aggregate) but
deliberately never into the date-keyed `byDay`/`byMonth`/`byCategoryMonth` breakdowns, since a
refund posted on a day/month with no matching spend would otherwise create a misleading
negative-only bar segment (see the September 2026 netting fix above). That left them invisible in
the daily/monthly/trend charts even though they're real money. New `refundsByDay`/`refundsByMonth`
fields on `DashboardAggregation` (`aggregation-service.ts`) total them by their own real posting
date — still never merged into the gross spend series. Dashboard's daily chart and `/trends`'
monthly chart now render them as a distinct "Refunds" bar stacked below zero (negative value, same
`stackId`, muted color), with its own tooltip label and legend entry. Only applies to
unlinked/blanket reimbursements — linked ones (`TransactionLink`) were already netted correctly
into the date-keyed breakdowns via their originating expense's date, and are unaffected.

**Fixed in code review** (two independent review passes converged on the same bugs):
- The frontend merge was one-directional — `DailyChart` (`components/DashboardStats.tsx`) and
  `/trends`' chart data (`app/trends/page.tsx`) mapped refunds onto *existing* `byDay`/
  `byCategoryMonth` rows only, so a refund posted on a day/month with **zero** matching expenses
  (exactly the case the backend was designed to handle) was silently dropped from the chart
  instead of rendered. Fixed by merging on the union of days/months from both series. Added an
  e2e regression test (`__tests__/e2e/dashboard.spec.ts`, "shows a refund on a day with no matching
  expenses") — verified it fails without the fix and passes with it.
- An unrelated change had crept into the rounded-corner logic for the topmost stacked bar segment
  (`i === categories.length - 1 && !hasRefunds`), unnecessarily squaring it off whenever any refund
  existed in the period, even though the Refunds bar is a separate segment below zero that doesn't
  touch the top of the positive stack. Reverted to the original unconditional rounding.
- The new `reimbRows` query (`aggregation-service.ts`) had no `take` limit, unlike the structurally
  identical `incomeRows` query a few lines above it (`take: 10000`). Added the same cap.

### FIRE end-of-plan buffer (branch: `feat/fire-end-buffer`)
The FIRE target used to be solved to reach exactly €0 at life expectancy, with no margin for living
longer, a worse-than-assumed market, or unplanned costs. New `endBufferYears` config field (default
2, this model's own assumption) changes `computeFireTarget`'s binary-search condition from
`endValue > 0` to `endValue > endBufferYears * 12 * phase2NetMonthly`. Set to 0 to reproduce the old
behavior exactly. `computeEarliestFire` picks this up automatically since it calls
`computeFireTarget` internally. UI: new "End-of-plan buffer" field in the Cash buffer config group,
and the model explainer's "Known limitation" section and binary-search pseudocode were reworded.

**Found and worked around, not fixed:** the production Neon database has 5 tables
(`BankConnection`, `CsvImport`, `HouseholdMember`, `IncomeRule`, `RecurringExclusion`) with no
corresponding migration file anywhere in git history — they were applied directly (likely via
`prisma db push`) at some point without a migration ever being committed. This makes
`prisma migrate dev` report schema drift and offer to **reset the database** (`migrate reset`,
which would drop everything) as its fix — never do this against this database. `prisma migrate
status` and `prisma migrate deploy` are unaffected and work fine; only `migrate dev`'s drift
detection trips on it. Worked around for this change by applying the new `endBufferYears` column
directly with `prisma db execute` and recording it with `prisma migrate resolve --applied`, bypassing
`migrate dev` entirely. The underlying gap (no migration file for those 5 tables) is still
unresolved — attempting to reconstruct and backfill a baseline migration for them failed because
Prisma checksums the original migration file content, and a reconstructed file (even with identical
SQL) doesn't match the already-recorded checksum, triggering the same reset prompt. Needs a
dedicated session with lower time pressure, ideally with access to whatever checksum or original
migration file might still exist, or a deliberate decision to force-overwrite the checksum record.

**Also found:** `simulateProjection`'s drawdown loop and `computeFireTarget`'s internal
`simulateDrawdown` compute each month's age slightly differently (end-of-month vs start-of-month),
so a withdrawal right at a phase boundary (mortgageEndAge, pensionAge) can use the wrong phase's
gross amount in one of the two functions but not the other. Over decades of compounding this is
enough to make the *displayed* projection chart's ending balance disagree with the FIRE target's
own internal math by low-four-figures of euros on a ~€100k buffer — not large relative to a ~€900k
target, but a real, pre-existing inconsistency between what's shown and what's solved for. Not
fixed here (same reasoning as above: real fix needs care to avoid breaking the other projection
users — barista variants, the extra-investment what-if chart).

### FIRE Monte Carlo survival estimate (branch: `feat/fire-monte-carlo`)
The FIRE model had no way to show sequence-of-returns risk: every year was assumed to return
exactly the configured rate, with no ups and downs. New `lib/services/fire-monte-carlo.ts`
(`runMonteCarlo`) adds a **descriptive, non-target-driving** check: 1,000 random annual-return
paths (lognormal, moment-matched to the configured accumulation/drawdown return and a new
`returnVolatility` config field, default 15% — this model's own assumption, not sourced), reusing
the same contributions and withdrawal schedule (`computePhaseGrossWithdrawals`) the deterministic
model uses. Reports a success probability (share of paths that never ran out through life
expectancy) and a 10th/50th/90th percentile band per age. A fixed seed (`20261005` default) keeps
results stable across reloads for the same config. Deliberately does **not** change `computeFireTarget`
or `computeEarliestFire` — the FIRE number stays the single deterministic value it always was; this
only evaluates it.
- `/api/fire` GET now returns a `monteCarlo` key; UI shows a success-probability badge and a shaded
  10–90% band on the Portfolio Projection chart, plus a new explainer section and a `returnVolatility`
  config field (Investment assumptions group).
- New `computeWarnings` check: flags when `drawdownReturn > accumulationReturn`, since that can
  break the monotonicity `computeEarliestFire`'s year-then-month search assumes.
- `monthlyRate` and `computePhaseGrossWithdrawals` were exported from `fire-service.ts` (previously
  private) so the Monte Carlo module could reuse them without duplicating logic.
- Migration `20261005000001_fire_return_volatility` adds the column, applied the same way as the
  buffer migration above (`prisma db execute` + `migrate resolve --applied`, bypassing `migrate dev`
  because of the still-unresolved pre-existing drift).
- Monte Carlo's own month-stepping (in `simulateTrial`) uses yet another age-discretization
  convention than both `simulateProjection` and `simulateDrawdown` — tests for it avoid comparing
  across functions (see the `migrate dev` note above for why aligning all three isn't a quick fix)
  and instead use configs with `retirementAge` pinned to the current age, removing the accumulation
  phase so funding-level assertions aren't swamped by decades of contributions.

**Fixed in code review:**
- `runMonteCarlo` started every trial at `Math.floor(currentAge)` instead of the exact fractional
  age, treating the already-elapsed partial year as if it were still future accumulation — up to
  ~12 phantom months of extra contributions/growth, systematically overstating the success
  probability and percentile bands the closer `currentAge` sits to its next whole year. Rewrote
  `simulateTrial` to step by total elapsed months from the exact `currentAge`
  (`(lifeExpectancy - currentAge) * 12`, matching the deterministic model's own month count) instead
  of iterating whole calendar years from a floored start. Added a regression test that checks the
  portfolio value at the first checkpoint against the exact closed-form compound-growth formula for
  the correct elapsed-month count.
- The Monte Carlo badge/band only ever evaluates the **Pure FIRE** plan (`runMonteCarlo` is called
  with no `activeIncomeMonthly`), but was shown generically alongside all three plan lines
  (Pure FIRE, Barista 33%, Barista 50%) with no indication of which one it describes — misleading
  next to a Barista line, whose real survival odds (helped by ongoing income) are materially higher.
  Running it three times (once per variant) would triple the simulation cost for a purely
  descriptive check, so fixed by labeling the badge, tooltip, and explainer text as Pure-FIRE-specific
  instead.
- The first Monte Carlo band point used to be keyed by a whole age, so it never lined up with the
  deterministic projections' own first point (the exact fractional `currentAge`) — the shaded band
  silently started one data point late on the chart. Fixed as a side effect of the elapsed-months
  rewrite: the trial path's first point is now the exact fractional `currentAge`, matching
  `simulateProjection`'s own convention.
- `currentAge` is wall-clock-dependent (`Date.now()`), and the rewrite above started using it as a
  map key for the first path point — two `runMonteCarlo` calls close in time could previously
  produce a very slightly different float and silently fail to merge (surfaced as a flaky
  determinism test when the 1,000-trial compute between two calls was enough to tick the clock by
  a millisecond). Rounded to ~32-second precision before using it as a key.
- `simulateTrial` took an unused `activeIncomeMonthly` parameter (withdrawal amounts are precomputed
  outside and passed in) — misleading, since it looked like per-trial active income might vary.
  Removed.

### Test coverage gaps closed (branch: `test/coverage-gaps`, stacked on `feat/fire-monte-carlo`)
Several features had zero automated test coverage. Added, without changing any production code:
- `__tests__/unit/income-rules-service.test.ts` — `matchesAnyIncomeRule` (merchant/category match logic,
  case-insensitivity, both-fields-required, missing-category handling) and `seedDefaultIncomeRules`
  (seeds when empty, skips when rules already exist).
- `__tests__/unit/upload-service.test.ts` — `processUpload`: throws on empty parse / undetected bank /
  missing generic column mapping; reclassifies an unmatched Income row to Expense (reimbursement);
  keeps a matched Income row as Income; a dry run never calls `upsertTransactions` or invalidates the
  dashboard cache and correctly marks existing dedup keys as "skip"; a real upload does both.
- `__tests__/e2e/trends.spec.ts` — chart and per-category table render, a category pill toggle hides
  its table row, and the "not enough data" fallback shows with under 2 months of `byCategoryMonth`.
- `__tests__/e2e/income-rules.spec.ts` — list, add (POST), delete (DELETE), seed defaults (POST
  `/seed`), following the `settings.spec.ts` pattern (`setupSplitwise` + categories mock).
- `__tests__/e2e/fire.spec.ts` — the one page with **no** e2e coverage at all before this, flagged
  explicitly in the August 2026 InfoTip fix as a known gap since `/api/fire` needs a nontrivial mock.
  Covers: headline KPIs render; the Monte Carlo success badge renders; saving a changed config field
  sends the right PUT body; and — the actual regression target for the InfoTip fix — every InfoTip
  popover on the Configuration panel stays within the viewport at 390px width (checked via
  `boundingBox()`, matching the manual Playwright verification the original fix used, since jsdom
  can't measure real layout). Needed `{ force: true }` on the popup-closing click: the popup (z-20)
  visually sits on top of the full-screen "Close" overlay (z-10) wherever they overlap, which can
  otherwise intercept the click.
- Depends on PR #167/#168's `endBufferYears`/`returnVolatility`/`monteCarlo` fields for the `fire.spec.ts`
  mock response shape.
### Year-over-year comparison on Trends (branch: `feat/trends-yoy`, stacked on `feat/refund-series`)
The dashboard already had a YoY compare mode; `/trends` had none — an open item from
PROJECT_SUMMARY's "Next Steps" list. `app/trends/page.tsx` now also fetches the 12 months
immediately preceding the displayed window and adds:
- A **"vs last year"** table column per category: % change of that category's 12-month total vs
  the prior 12-month total, using the same up-is-bad/down-is-good red/green convention as the
  dashboard's `Delta` component (reimplemented locally as `YoyDelta` rather than importing a
  component private to `DashboardStats.tsx`).
- A toggleable **"Last year"** dashed overlay line on the chart — last year's monthly total
  (`byMonth`, not filtered by category selection, so the line reflects overall spending
  regardless of which categories are currently shown), disabled when no prior-year data exists.
- A toggleable **"3-mo avg"** line — a trailing 3-month moving average of the current window's
  monthly total, also independent of category selection.
- Both toggles default off; checking them just adds a `Line` to the existing stacked `BarChart`
  and a legend entry.
- Verified against real production data via a throwaway Playwright script (not committed): the
  checkbox enables correctly, toggling adds the legend entries, and a real category showed a
  correct `▲ +35%` vs-last-year delta.

**Fixed in code review** (two independent review passes, both converging on the same index bug):
- The original version zipped `data.byCategoryMonth[i]` with `prevYearTotals[i]`/`movingAvg3[i]`
  purely by array index, assuming both windows have exactly 12 entries in lockstep. But `byMonth`/
  `byCategoryMonth` are sparse — `aggregation-service.ts` only emits a row for a month that actually
  had a qualifying transaction, so a single quiet month in either window (new account, a gap in
  uploads) silently shifts every later index, pairing the wrong calendar months with no error.
  Fixed by looking up the prior year's value by the actual computed calendar-month string (current
  month's month-number minus 12) instead of by array position, and by computing `movingAvg3` from
  a month-keyed map rather than a positional array.
- `Promise.all([fetch(current), fetch(prevYear)])` had no per-promise isolation: a transient
  failure of the new prior-year fetch alone would reject the whole chain and hide valid
  current-year data behind the "not enough data" fallback — a resilience regression introduced
  specifically by adding the second fetch. Fixed by catching the prior-year fetch independently
  so its failure only disables the YoY feature, not the page.
- `YoyDelta`'s "flat" threshold (0.5%) had already drifted from the dashboard's `Delta` component
  it was modeled on (0.05%). Aligned to the same threshold.
- `__tests__/e2e/trends.spec.ts`'s mock relied on a call-counter to tell the current-window and
  prior-year fetches apart, which races against `Promise.all`'s concurrent requests — nothing
  guarantees which one the mock server receives first. Fixed to route by the request's actual
  `date_from` value instead.
- The partial-current-month-vs-full-prior-month comparison (the trailing 12-month window's last
  month only has the elapsed days of the current month) is a real, pre-existing caveat of any
  trailing-window chart, not introduced by this PR — flagged, not changed, since "fixing" it means
  deciding whether to exclude the partial month from the comparison entirely, a product call left
  for later.

### Spending forecast redesigned as a block bootstrap (branch: `feat/forecast-bootstrap`)
Revives the forecast removed earlier in October 2026 (its EMA approach had no confidence
interval, no minimum-history guard, and blended months a category didn't occur in as if they
were real €0 data points). Before redesigning, checked the actual data: real history spans
21 months (Jan 2025–Sep 2026), but **2025 is excluded** — it was imported as-is from Splitwise
with legacy categorization and isn't reliable (user decision, 2026-10-06; see
`FORECAST_RELIABLE_HISTORY_START` in `lib/constants.ts`). Within the remaining 9 months
(2026 only), category coverage is very uneven: 9 of 19 categories appear in all 9 months,
several in 7–8, and a real tail is genuinely occasional (Insurance 3/9, Electronics 1/9).

- **Method: block bootstrap, not a parametric model.** `lib/services/forecast-service.ts`
  resamples *whole historical months* with replacement (1,000 trials, seeded) rather than
  fitting a distribution (like `fire-monte-carlo.ts`'s lognormal returns) or resampling each
  category independently. This was a deliberate choice over both simpler and fancier
  alternatives: with only 9 data points per category, there's nothing sensible to fit a
  distribution to, and whole-month resampling preserves real cross-category correlation
  (a trip month plausibly spikes Travel and Dining together) for free. It also naturally
  produces a correctly wide, low-confidence band for occasional categories — most resampled
  months show €0 for Electronics, a minority show the one real spike — which *is* the honest
  confidence interval the old version lacked, with no separate "is this category reliable"
  branch needed.
- Reuses `getDashboardStats` (`lib/services/aggregation-service.ts`) for the month×category
  data instead of new queries — this means the existing `NON_SPENDING_CATEGORIES` exclusion
  and reimbursement netting apply for free.
- `mulberry32` (seeded PRNG) and `percentile` were extracted from `fire-monte-carlo.ts`
  (previously private) into a new shared `lib/services/stats.ts`, since both modules now need
  them — pure refactor, verified behavior-unchanged against `fire-monte-carlo.test.ts`.
- Minimum-history guard: fewer than 3 reliable months → `{ insufficientData: true }`, the UI
  shows a "not enough reliable history" message instead of a number.
- `/api/forecast` GET returns `{ forecastMonth, basedOnMonths, trials, total: {p10,p50,p90},
  byCategory: [{category, p10, p50, p90, monthsWithData}] }`. UI shows the total as a range
  ("€X–€Y, likely ≈ €Z") rather than one number, and tags any category with under 3 months of
  data as "rare" in the per-category table.
- **Found and fixed while implementing:** the obvious `monthString(d) { return
  d.toISOString().slice(0,7) }` helper (used for calendar-month arithmetic) is a real bug in
  any positive-UTC-offset timezone (this dev environment is EEST, UTC+3) — converting a local
  midnight to UTC rolls back to the previous day, and for the 1st of a month, to the *previous
  month*, which made month-range iteration loop forever. Fixed by reading local
  `getFullYear()`/`getMonth()` components directly instead of round-tripping through UTC —
  the same safe pattern `/trends`' `shiftMonth` already uses. Passing whole `Date` objects
  (not strings) to `getDashboardStats` is unaffected and matches existing precedent
  (`app/api/fire/route.ts`'s `twelveMonthsAgo`/`today`).
- No seasonality (YoY) blending for v1 — deliberately deferred: with 2025 excluded, there's no
  reliable same-month-last-year data yet to blend in. Revisit once 2026 has a full year behind
  it, or if 2025 is ever recategorized.

### Avios goal tracking + fact-check of an external strategy doc (branch: `feat/avios-goal`)
User brought an externally-drafted "Finnair Avios master strategy" doc and asked for (1) a way to
track its target inside the app and (2) its logic re-checked against collectable facts, not
assumptions. Two goal levels (set by the user, not in the exported doc): **minimum** = one-way
Business upgrade for 2 people = 80,000 Avios/yr; **extended** = return upgrade for 2 = 160,000/yr.

**Fact-check findings** (DB queries + official finnair.com / americanexpress.com/fi-fi pages read
6 Oct 2026 — full table and reasoning were reported to the user, not reproduced here):
- The plan's card-spend baseline (€25,367/yr) undercounts real spend by annualizing 7 months of
  data over 8.5 months; actual March–September 2026 run rate is **≈€32.1k/yr**.
- The plan's "abandon Silver status" step has the economics backwards: the Finnair Visa gives 500
  tier points in any €1,500+ month (no Avios cost), and Silver earns *more* Avios (1.2/€ on the
  card, 7/€ on flights vs Basic's 1.0/€ and 6/€) — keeping status costs nothing and raises the
  earn rate; the plan's own numbers don't support dropping it.
- The Amex fee (€65/mo until 1 Nov 2026, then €75) and the MR→Avios math (75,000 MR isn't a
  multiple of 17, the required transfer unit) were both slightly off; the real Amex offer is a
  100k-point bonus split 50k/50k at months 7 and 13, not the plan's single 75k.
- The "effective seat cost ≈€526" figure doesn't reconcile with the plan's own cited inputs (works
  out to ≈€779, or ≈€1,140 using the real 2026 Japan fare the user confirmed, €1,668 for 2 return).
- Confirmed as official fact: 40,000 Avios per person per direction for Economy→Business on
  Japan/Singapore/most-of-Asia routes, the 18-month Avios expiry (keeps a multi-year rollover plan
  viable as long as the card keeps getting used), the 200k Avios/yr purchase cap, and the official
  48k-Avios subscription price (€628.80/yr, €0.0131/Avios). The 30%/40% bulk-sale discount tiers in
  the plan are blog-sourced only (loyaltylobby.com), not confirmed on an official page.

**Feature (phase 1, manual readings only — not computed from transactions):** earning rules for
which card purchases count toward Avios aren't confirmed precisely enough to encode in the
categorizer yet, so this follows the existing Asset/AssetSnapshot pattern instead of trying to
derive Avios from `Transaction` rows.
- New models `PointsGoal` (name, unit, period), `PointsGoalLevel` (named thresholds — the
  minimum/extended split is just two rows, not a hardcoded concept) and `PointsBalance` (dated
  manual readings), migration `20261006000000_points_goal` (applied via `prisma db execute` +
  `migrate resolve --applied`, per the established workaround for the pre-existing migration drift
  — never `migrate dev`/`reset` against this database).
- `lib/services/points-goal-service.ts`: pure function, no DB access. Computes per-level % reached,
  remaining, and Avios/month needed, plus a shared observed pace and end-of-period projection from
  readings taken *inside* the goal's own period (a reading from outside the period still sets the
  displayed current balance, but doesn't feed the pace calculation — a stale or prior-goal reading
  shouldn't imply this period's earn rate). No earn-rate assumption is made anywhere in phase 1.
- `app/api/points-goals/route.ts` + `[id]/route.ts` + `[id]/balances/route.ts`,
  `components/PointsGoalCard.tsx`, new `/goals` page linked in `Navigation.tsx`.
- Deferred to a later phase, once the Finnair Visa's exact earn exclusions (transfers, fees, etc.)
  can be confirmed from an official source and mapped onto existing categories: computing Avios
  automatically from `Finnair Visa` transactions, and tracking tier points toward Silver
  requalification.
- Also removed **Aktia** from `UploadForm.tsx`'s tracked-accounts list — it's only the bank that
  issues the Finnair Visa card, not a separate account; the card's own spend is already tracked
  under "Finnair Visa". `TRACKED_ACCOUNTS` now just reuses `ACCOUNT_NAMES` from `lib/constants.ts`.

### Avios goal rebuilt around tracked flights, with a sourced strategy and a real cash plan (branch: `feat/avios-flights`)
The period/levels model above didn't match what the goal actually is — having enough Avios for
*specific* flights — and broke on redemptions: spending Avios on an upgrade dropped the next
balance reading, which made progress fall back and the earn pace read as negative. Replaced with a
flight-based model, on explicit user direction (2026-10-07) to track real flights rather than a
period, and to factor in real household cash flow for at least 1 (ideally 2) long-haul upgrades a
year on top of the Avios balance itself.
- **New `PointsFlight` model** (label, Avios `points`, optional `economyFareEur`, `neededBy` date,
  `status` planned/redeemed, `redeemedAt`). `PointsGoal.periodStart/periodEnd` are now nullable and
  unread; `PointsGoalLevel` is unused. Both are kept, not dropped, per the established "stop
  reading, deploy, then drop" pattern for this DB's pre-existing migration drift — a follow-up PR
  drops them. Migration `20261007000000_points_flights`, applied via `prisma db execute` +
  `migrate resolve --applied` as always.
- **`lib/services/points-goal-service.ts`** (rewritten, still pure/no DB): `accruedPoints` = latest
  balance + flights redeemed on/before that reading (already reflected in it); `availableBalance` =
  latest balance − flights redeemed *after* it (real-world spend the next reading hasn't caught up
  to yet) — this is what stops a redemption from reading as regression. Pace uses an
  accrued-equivalent series over the trailing 12 months, so a redemption is never counted as
  negative earning. Planned flights are allocated the available balance in `neededBy` order
  (coverage %, cumulative shortfall, Avios/month needed, on-track projection per flight).
- **`lib/avios-facts.ts`**: every verified rate (upgrade cost, subscription €/Avios, purchase cap,
  Amex MR transfer ratio, Visa/flight earn rates by tier, expiry, Silver requalification), each
  with the exact finnair.com/americanexpress.com page that confirms it, read 2026-10-07. The one
  unverified number (flash-sale price, blog-only) is flagged as such and never used in a
  calculation — only the subscription rate is used as the dependable € baseline everywhere.
- **`lib/services/avios-strategy.ts`**: converts a flight's Avios shortfall into €, Amex MR
  (rounded up to a multiple of 17), and Finnair Visa/Amex card spend needed — facts-only, no
  transaction data, flags a gap over the 200k/yr purchase cap.
- **`lib/services/cash-plan-service.ts`**: the real-money check, separate from the Avios-rate
  math. Rolling-12-month net income (`getDashboardStats`, same call `/api/fire` already makes) ÷
  12, minus each active `SavingsGoal`'s required monthly contribution, leaves a discretionary
  monthly amount checked against each flight's real economy fare plus its Avios gap (priced at the
  subscription rate) by its `neededBy` date.
- **`lib/services/points-goal-enrichment.ts`**: the DB-backed glue — attaches `strategy`/`cashPlan`
  to Avios-unit goals only, fetching the household context (net income, savings goals) once per
  request rather than per goal.
- API: new `app/api/points-goals/[id]/flights/route.ts` (POST) and `[flightId]/route.ts`
  (PATCH/DELETE, goal-scoped via `updateMany`/`deleteMany` count checks, same pattern as balances).
  Goal create/update schemas dropped to name/unit/note now that levels/period are gone.
- UI: `PointsGoalCard.tsx` shows the flight list (coverage, on-track, mark-redeemed, delete), the
  Avios-gap strategy and the cash plan (each Avios-sourced number links to its source), and a new
  collapsible `AviosExplainer.tsx` ("How Avios work here") covering upgrade cost, € cost, Amex MR,
  why Silver status pays for itself, how the cash plan works, and specific corrections to the
  original household strategy doc (Amex earns 2 MR/€ not 1; the bonus is 100k split 50/50 at months
  7 and 13, not a single 75k; the fee rises to €75/mo from 1 Nov 2026; keeping Silver status is
  strictly better, not worse). `SourceLinks` was extracted from `FireDashboard.tsx` into a shared
  `components/SourceLinks.tsx` for both explainers to use.

### Avios cash plan: derived from real data instead of the retired SavingsGoal feature (branch: `feat/goal-money-capacity`)
A post-merge review of the whole goal-tracking area found three real bugs in the "Can I afford
it?" cash plan: (1) it netted out `SavingsGoal` rows — a feature with no UI at all since PR #98's
removal of `GoalsCard`/`BudgetCard` ("GuidelinePanel is sufficient; investments are the primary
savings vehicle") — and did so using the *stale* `currentAmount` column, while `GET /api/goals`
computes a live linked-category total it never writes back; (2) every Avios-unit `PointsGoal` got
its own cash plan computed independently, each assuming it alone owned the full monthly surplus,
so two goals could both show "on track" while jointly over-committed; (3) it only ever accrued
monthly flow from zero, never counting cash already sitting in a bank `Asset`.
- **Money capacity is now 100% derived from transactions/assets, never a manual goal record** —
  the user's explicit decision: money goals stay retired, and "money" in goal tracking means
  exactly "can the planned flights on this page actually be paid for."
  `lib/services/money-capacity-service.ts`'s `deriveMoneyCapacity()`: `monthlyDiscretionary` =
  rolling-12-month net income minus the same window's actual Investments-category outflow (the
  household's *observed* ongoing investing, not a configured target) — this can be negative, and
  for this household's real data (aggressive FIRE investing) it currently is, correctly flagged as
  `overcommitted`. `liquidBufferAvailable` = bank `Asset` total minus the emergency-fund buffer —
  reusing FIRE's own buffer formula, extracted from `app/api/fire/route.ts` into
  `lib/services/buffer-service.ts`'s `computeInvestableCash()` so both pages agree on what counts
  as spare cash.
- `lib/services/cash-plan-service.ts` takes `monthlyDiscretionary` + `liquidBufferAvailable`
  directly now (no more `savingsGoals` input) and spends the liquid buffer once, on the earliest
  flights first, on top of the accruing monthly flow — a near-term flight can be covered by
  existing bank cash even when monthly flow alone wouldn't reach it in time.
- `lib/services/points-goal-enrichment.ts` now merges every Avios-unit goal's planned flights
  into one list (ordered by `neededBy` across goals) before calling `computeCashPlan` once, then
  splits the results back out per goal — so multiple Avios goals correctly compete for the same
  pool instead of each claiming it in full.
- `SavingsGoal` is no longer read anywhere in the Avios path; the model/API/`GoalsCard.tsx` files
  themselves are untouched and still dormant.
- This was the first of three planned phases (correctness → quick UI wins for editing an existing
  flight/goal/reading → new Avios-specific tracking: purchase-vs-earn ledger, tier points toward
  Silver requalification, expiry staleness warnings) from a broader goal-tracking-improvement
  session; the other two are tracked for follow-up, not done in this change.

### Goal tracking Phase 2: edit flight/goal/reading, un-redeem (branch: `feat/goal-edit-ui`)
Phase 2 of the same goal-tracking improvement plan. The flight PATCH route already supported
editing every field and un-redeeming, and the goal PATCH route already supported editing
name/unit/note — none of it had a UI. Added:
- Inline edit on a flight (label/points/economy fare/needed-by/note), reusing a new shared
  `FlightEditForm` for both "+ Add flight" and editing an existing one.
- "Revert to planned" on an upcoming-redeemed flight, clearing `redeemedAt` back to `null`.
- Inline edit on the goal header (name/unit/note).
- A new `PATCH /api/points-goals/[id]/balances?balanceId=` route (didn't exist before — only
  add/delete did) + inline edit on a balance reading, same scoped-`updateMany` pattern as the
  other edit/delete routes.
- `PointsFlightInput`/`PointsFlightProgress` (`points-goal-service.ts`) gained a `note` field —
  the schema/API always accepted it, but `computePointsGoalProgress` silently dropped it, so it
  was unreadable anywhere. Now shown on both the planned-flight and upcoming-redeemed rows.
- This is Phase 2 of 3; Phase 3 (purchase-vs-earn ledger, tier points, expiry warnings) is still
  a follow-up, not done here.
- (Process note: the original PR #179 for this phase was auto-closed by GitHub when its stacked
  base branch, `feat/goal-money-capacity`, was deleted after Phase 1 merged — GitHub doesn't
  always retarget a stacked PR to the repo default branch in that case. Recreated via
  `git cherry-pick` onto a fresh branch off `main` as PR #180. Lesson for future stacked-PR work:
  either merge each phase before starting the next, or retarget with `gh pr edit --base main`
  *before* the base branch is deleted, not after.)

### Goal tracking Phase 3: purchase/bonus ledger, tier points, expiry staleness warning (branch: `feat/goal-avios-tracking-v2`)
Final phase of the goal-tracking improvement plan — new Avios-specific tracking, on top of the
Phase 1/2 correctness and UI work.
- **New `PointsPurchase` model** (points, costEur, purchasedAt, `kind`: 'purchased' | 'bonus',
  note) — a real transaction record, deliberately separate from `PointsBalance` (a point-in-time
  snapshot, not a transaction). Migration `20261007010000_points_purchase_drop_legacy` also drops
  the long-unused `PointsGoal.periodStart/periodEnd` columns and the `PointsGoalLevel` table
  (flagged as a deferred follow-up since PR #177; confirmed nothing has read them since), applied
  via the established `prisma db execute` + `migrate resolve --applied` workaround.
- **Organic-only pace**: `computePointsGoalProgress` now subtracts cumulative purchased/bonus
  points (dated on-or-before each reading) from the accrued series before computing
  `observedPointsPerMonth`, so a one-off bulk buy or welcome bonus no longer inflates the
  projected future pace. `availableBalance`/`accruedPoints` (flight coverage) are unaffected — a
  purchased Avios is exactly as spendable as an earned one, only the *projection* needed the
  earned/bought distinction.
- **Real purchase-cap check**: `avios-strategy.ts`'s `overCap` now compares a flight's shortfall
  (plus `purchasedThisCalendarYearPoints`, tallied from real `PointsPurchase` rows) against the
  200k/yr cap when the flight is due this calendar year, instead of inferring it from the
  shortfall alone. A flight due in a later year isn't stacked against this year's purchases,
  since there's another January's cap to use by then.
- **Tier points — no new mechanism**: the existing generic `PointsGoal`/`PointsFlight` model
  already works for any `unit`. A `unit: 'Tier points'` goal gets its own 15,000-point flight
  prefill (mirroring the Avios upgrade prefill) and an explainer mention; everything else (cash
  plan, strategy conversions use Avios-specific rates and are skipped for non-Avios goals, so a
  Tier points goal only shows flight progress — exactly what it needs).
- **Staleness warning**: new `daysSinceLastActivity` in `PointsGoalProgress` (days since the most
  recent balance reading, redemption, or purchase/bonus — whichever is latest). `AVIOS_EXPIRY_MONTHS`
  (18, sourced) added to `lib/avios-facts.ts`; `PointsGoalCard.tsx` shows an amber banner at 15
  months of inactivity and a red one past 18, each linking to the expiry source.
- UI: new "Show purchases/bonuses" ledger section (add/delete, same pattern as balance readings),
  an `observed organic pace` label update to make the earn/bought distinction visible, and
  `AviosExplainer.tsx`'s "How the cash plan works" section corrected (it still described the
  retired `SavingsGoal`-netting from before Phase 1) plus a new section covering purchases/
  bonuses/tier points.
- This closes out the 3-phase goal-tracking improvement plan from this session.

### Pre-2026 data deleted; forecast window now dynamic (migration `20261007020000_delete_pre_2026_transactions`)
The Avios cash plan's rolling-12-month `getDashboardStats` call was quietly reaching back into
2025 data that was already known-unreliable (see `FORECAST_RELIABLE_HISTORY_START`'s original
reasoning under "Spending forecast redesigned" above) — not a bug, just an unintended consequence
of using a plain 12-month lookback everywhere. Rather than adding another code-level date clamp
(the pattern that had already accumulated in two places), **the unreliable rows were deleted
outright** (user decision, 2026-10-07): all 138 `Transaction` rows dated before 2026-01-01 removed
from production via a proper migration (not an ad-hoc script — cascades to `TransactionSplit`; no
`TransactionLink` rows referenced any of them, verified first). `points-goal-enrichment.ts`'s
rolling-12-month window needed no code change after this — there's simply nothing before 2026 left
to reach back into.
- **`FORECAST_RELIABLE_HISTORY_START` removed from `lib/constants.ts`** — with the unreliable data
  gone, hardcoding a floor date became dead weight. `forecast-service.ts`'s window is now fully
  dynamic: a rolling 12 months if that much history exists, otherwise as far back as the earliest
  transaction actually goes (`getEarliestTransactionDate()`, a new cheap standalone
  `aggregation-service.ts` query — `prisma.transaction.aggregate({ _min: { date: true } })` — kept
  separate from the main `getDashboardStats` call precisely so the minimum-history check can
  early-exit without paying for the full aggregation when there isn't enough history).
- This generalizes the service beyond this one dataset: it no longer has any assumption baked in
  about *when* reliable data starts, so it keeps working correctly as more months accumulate or if
  this is ever reused against a different history length.

### Avios purchase/bonus ledger dropped (branch: `chore/drop-points-purchase`)
User decision (2026-10-07): balance readings become the single source of truth for every
`PointsGoal`, superseding Phase 3's manual purchase/bonus ledger (PR #182). A reading may
silently include purchased/bonus Avios — an accepted ambiguity — until purchase/pace
aggregation can be derived from transactions instead of manual entry.
- `lib/services/points-goal-service.ts`: removed `PointsPurchaseKind`/`PointsPurchaseInput`/
  `PointsPurchaseProgress`, `purchases` from `PointsGoalInput`/`POINTS_GOAL_INCLUDE`, and
  `purchases`/`purchasedThisCalendarYearPoints` from `PointsGoalProgress`. The pace series is
  back to `balance + redeemedByThen` (no purchase subtraction); `daysSinceLastActivity` now
  counts readings and redemptions only.
- `lib/services/avios-strategy.ts`: `overCap` is back to a flat `shortfallPoints >
  PURCHASE_CAP_PER_YEAR` check (no this-calendar-year purchase stacking).
- Deleted `app/api/points-goals/[id]/purchases/` (both routes) and the purchase schemas in
  `lib/validation.ts`.
- `components/PointsGoalCard.tsx`: removed the "Show purchases/bonuses" ledger UI, its
  state/handlers; pace label back to "observed pace … (trailing 12mo)".
  `components/AviosExplainer.tsx`: the "Purchases, bonuses, and tier points" section is now a
  short "Tier points" note explaining a reading may silently include a purchased/bonus top-up.
- Tests: dropped the purchase fixtures/describe blocks and purchase-cap stacking tests across
  `points-goal-service`, `avios-strategy`, `api/points-goals`, `points-goal-enrichment` unit
  tests, and the "records a purchase/bonus" e2e test in `goals.spec.ts`.
- **`PointsPurchase` table and Prisma model were kept in this PR** — deployed code still reads
  them until this deploys. Dropping the table is a follow-up migration (tracked in "Next Steps"
  above), applied via `prisma db execute` + `migrate resolve --applied` per this DB's established
  pattern, never `migrate dev`/`reset`. No data is lost either way: purchased/bonus Avios are
  already reflected in the next balance reading.
- A PROJECT_SUMMARY.md mixup: this exact plan (written the same day as Phase 3) was mistakenly
  struck out as "stale, superseded by Phase 3" in a later session, when it was in fact the real
  next step the user still wanted done — restored and executed here.

### Goal readings visible by default, Amex MR tracked per reading (branch: `feat/goal-readings-amex-mr`)
Two small `/goals` UX gaps, raised alongside a broader ask to improve how the Goal feature is used
(see "Investigation" note below — a second PR, `fix/goal-cash-plan-surplus`, addresses the "can I
afford it?" half separately):
- **Readings were hidden by default.** `historyOpen` now starts `true`; the "Show/Hide readings"
  toggle became a `Readings (N)` heading with "+ Add reading" next to it, rows moved from the
  faint `--fg-3`/11px to `--fg-2`/12px, and the list caps at the latest 5 with a "Show all (N)"
  link beyond that.
- **No way to record Amex MR.** Untransferred Membership Rewards points are effectively Avios you
  already hold (17 MR → 10 Avios, official rate, `lib/avios-facts.ts`). Per user decision
  (2026-10-08), an optional "Amex MR" field on each reading now **counts toward available Avios**,
  not just display:
  - `PointsBalance.amexMr Int @default(0)`, migration `20261008000000_points_balance_amex_mr`
    (`prisma db execute` + `migrate resolve --applied`, per this DB's established drift
    workaround).
  - New `mrToAvios(mr)` in `lib/avios-facts.ts` — inverse of the existing `aviosToMrPoints`,
    rounding **down** to whole 17-MR transfer units (a partial unit isn't spendable yet).
  - `points-goal-service.ts`'s `computePointsGoalProgress` folds the latest reading's MR-as-Avios
    into both `accruedPoints` and `availableBalance`, and into the trailing-12-month pace series
    per-reading — so transferring MR into Avios between two readings doesn't read as a pace spike.
    New `latestAmexMr`/`amexMrAviosEquivalent` on `PointsGoalProgress`. Strategy and cash plan
    inherit this for free since both read `progress`.
  - UI (Avios-unit goals only): an "Amex MR" input in the add/edit reading forms; the balance
    summary reads `6,000 Avios + 20,000 MR (≈ 11,760 Avios) = 17,760 available`; reading rows show
    `· 20,000 MR` when non-zero. `AviosExplainer.tsx` gets one line on the 17:10 rate.
- **Investigation (not built in this PR):** checked production data for higher-value next steps —
  deriving expected MR/Avios earn from existing Amex/Finnair-Visa transaction categories (to
  reconcile against the observed pace), deriving tier points from Visa spend automatically (no
  manual reading needed), and a "last reading N days ago" nudge. Also surfaced, while checking the
  cash-plan math for the Amex MR change, that `deriveMoneyCapacity`'s "can I afford it?" always
  reads deeply negative for this household (treats every investment — including one-off lumps
  funded from existing savings — as a recurring monthly cost, and divides by 12 even with under 10
  months of post-cleanup history) — tracked as a follow-up fix (branch
  `fix/goal-cash-plan-surplus`, not yet done).

---

**For future sessions:** This document contains the full architecture and recent dashboard implementation. Refer back when making changes to understand dependencies and data flow.
