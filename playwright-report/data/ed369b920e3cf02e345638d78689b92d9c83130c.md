# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: transactions.spec.ts >> Transactions Page >> should allow transaction deletion with confirmation
- Location: __tests__/e2e/transactions.spec.ts:157:7

# Error details

```
TypeError: transactions.filter is not a function
```

# Test source

```ts
  1   | /**
  2   |  * Mock data factories for E2E tests
  3   |  * Mocks the backend API endpoints, not Splitwise directly
  4   |  */
  5   | 
  6   | import type { Page } from '@playwright/test';
  7   | 
  8   | export interface ParsedTransaction {
  9   |   date: string;
  10  |   merchant: string;
  11  |   amount: number;
  12  |   type: 'Expense' | 'Income';
  13  |   category: string;
  14  |   account?: string;
  15  |   paidBy?: string;
  16  |   note?: string;
  17  | }
  18  | 
  19  | export interface TransactionWithId extends ParsedTransaction {
  20  |   id: string;
  21  | }
  22  | 
  23  | export interface DashboardAggregation {
  24  |   totalExpenses: number;
  25  |   totalIncome: number;
  26  |   net: number;
  27  |   byCategory: Array<{ category: string; amount: number }>;
  28  |   byDay: Array<{ day: string; [key: string]: number | string }>;
  29  |   byAccount: Record<string, number>;
  30  |   byMonth: Array<{ month: string; amount: number }>;
  31  |   topTransaction: { merchant: string; amount: number; category: string; date: string };
  32  |   allCategories: string[];
  33  |   transactionCount: number;
  34  |   uncategorizedCount: number;
  35  | }
  36  | 
  37  | export function mockExpense(overrides?: Partial<ParsedTransaction>): ParsedTransaction {
  38  |   const amount = overrides?.amount ?? 45.67;
  39  |   return {
  40  |     date: overrides?.date ?? '2026-04-10',
  41  |     merchant: overrides?.merchant ?? 'Test Merchant',
  42  |     amount,
  43  |     type: overrides?.type ?? 'Expense',
  44  |     category: overrides?.category ?? 'General',
  45  |     account: overrides?.account ?? 'OP',
  46  |     paidBy: overrides?.paidBy ?? 'tung',
  47  |     note: overrides?.note ?? '',
  48  |   };
  49  | }
  50  | 
  51  | export function mockExpenses(count: number, baseDate: Date = new Date('2026-04-10')): ParsedTransaction[] {
  52  |   const categories = ['Shopping', 'Food & Dining', 'Food & Groceries', 'Transport', 'Entertainment'];
  53  |   const merchants = ['Amazon', 'Starbucks', 'Whole Foods', 'Uber', 'Netflix', 'Spotify', 'Target', 'Trader Joe\'s', 'Restaurant', 'Gas Station'];
  54  | 
  55  |   const expenses: ParsedTransaction[] = [];
  56  | 
  57  |   for (let i = 0; i < count; i++) {
  58  |     const date = new Date(baseDate);
  59  |     date.setDate(date.getDate() + Math.floor(i / 2));
  60  | 
  61  |     const amount = Math.random() * 100 + 5;
  62  |     const category = categories[i % categories.length];
  63  |     const merchant = merchants[i % merchants.length];
  64  | 
  65  |     expenses.push(
  66  |       mockExpense({
  67  |         date: date.toISOString().split('T')[0],
  68  |         merchant,
  69  |         amount,
  70  |         category,
  71  |       })
  72  |     );
  73  |   }
  74  | 
  75  |   return expenses;
  76  | }
  77  | 
  78  | export function createDashboardAggregation(transactions: ParsedTransaction[]): DashboardAggregation {
> 79  |   const expenses = transactions.filter((t) => t.type === 'Expense');
      |                                 ^ TypeError: transactions.filter is not a function
  80  |   const income = transactions.filter((t) => t.type === 'Income');
  81  | 
  82  |   const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  83  |   const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
  84  | 
  85  |   // Calculate by category
  86  |   const byCategory = Array.from(
  87  |     expenses.reduce((map, t) => {
  88  |       const current = map.get(t.category) || 0;
  89  |       map.set(t.category, current + t.amount);
  90  |       return map;
  91  |     }, new Map<string, number>())
  92  |   )
  93  |     .map(([category, amount]) => ({ category, amount }))
  94  |     .sort((a, b) => b.amount - a.amount);
  95  | 
  96  |   // Calculate by day
  97  |   const byDayMap = new Map<string, Record<string, number>>();
  98  |   expenses.forEach((t) => {
  99  |     const day = t.date;
  100 |     if (!byDayMap.has(day)) {
  101 |       byDayMap.set(day, {});
  102 |     }
  103 |     const dayData = byDayMap.get(day)!;
  104 |     dayData[t.category] = (dayData[t.category] || 0) + t.amount;
  105 |   });
  106 | 
  107 |   const byDay = Array.from(byDayMap.entries())
  108 |     .map(([day, data]) => ({ day, ...data }))
  109 |     .sort((a, b) => a.day.localeCompare(b.day));
  110 | 
  111 |   // Calculate by account
  112 |   const byAccount = expenses.reduce(
  113 |     (acc, t) => {
  114 |       acc[t.account || 'Unknown'] = (acc[t.account || 'Unknown'] || 0) + t.amount;
  115 |       return acc;
  116 |     },
  117 |     {} as Record<string, number>
  118 |   );
  119 | 
  120 |   // Calculate by month
  121 |   const byMonthMap = new Map<string, number>();
  122 |   expenses.forEach((t) => {
  123 |     const month = t.date.substring(0, 7); // YYYY-MM
  124 |     byMonthMap.set(month, (byMonthMap.get(month) || 0) + t.amount);
  125 |   });
  126 | 
  127 |   const byMonth = Array.from(byMonthMap.entries())
  128 |     .map(([month, amount]) => ({ month, amount }))
  129 |     .sort((a, b) => a.month.localeCompare(b.month));
  130 | 
  131 |   const topTransaction = expenses.reduce(
  132 |     (max, t) => (t.amount > max.amount ? { merchant: t.merchant, amount: t.amount, category: t.category, date: t.date } : max),
  133 |     { merchant: '', amount: 0, category: '', date: '' }
  134 |   );
  135 | 
  136 |   const allCategories = Array.from(new Set(expenses.map((t) => t.category)));
  137 | 
  138 |   return {
  139 |     totalExpenses,
  140 |     totalIncome,
  141 |     net: totalIncome - totalExpenses,
  142 |     byCategory,
  143 |     byDay,
  144 |     byAccount,
  145 |     byMonth,
  146 |     topTransaction,
  147 |     allCategories,
  148 |     transactionCount: expenses.length,
  149 |     uncategorizedCount: expenses.filter((t) => !t.category || t.category === '').length,
  150 |   };
  151 | }
  152 | 
  153 | /**
  154 |  * Mock backend API endpoints
  155 |  * Usage: await setupSplitwise(page, mockExpenses(5))
  156 |  */
  157 | export async function setupSplitwise(page: Page, transactions?: ParsedTransaction[]) {
  158 |   const mockData = transactions || mockExpenses(5);
  159 |   const dashboard = createDashboardAggregation(mockData);
  160 | 
  161 |   // Mock /api/dashboard
  162 |   await page.route('**/api/dashboard*', async (route) => {
  163 |     await route.fulfill({
  164 |       json: dashboard,
  165 |     });
  166 |   });
  167 | 
  168 |   // Mock /api/transactions
  169 |   await page.route('**/api/transactions*', async (route) => {
  170 |     const url = new URL(route.request().url());
  171 |     const offset = parseInt(url.searchParams.get('offset') || '0');
  172 |     const limit = parseInt(url.searchParams.get('limit') || '50');
  173 | 
  174 |     const paginatedTransactions = mockData
  175 |       .map((t, i) => ({ ...t, id: String(i + 1) }))
  176 |       .slice(offset, offset + limit);
  177 | 
  178 |     await route.fulfill({
  179 |       json: {
```