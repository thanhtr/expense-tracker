/**
 * Mock data factories for E2E tests
 * Mocks the backend API endpoints, not Splitwise directly
 */

import type { Page } from '@playwright/test';

export interface ParsedTransaction {
  date: string;
  merchant: string;
  amount: number;
  type: 'Expense' | 'Income';
  category: string;
  account?: string;
  paidBy?: string;
  note?: string;
}

export interface TransactionWithId extends ParsedTransaction {
  id: string;
}

export interface DashboardAggregation {
  totalExpenses: number;
  totalIncome: number;
  net: number;
  byCategory: Array<{ category: string; amount: number }>;
  byDay: Array<{ day: string; [key: string]: number | string }>;
  byAccount: Record<string, number>;
  byMonth: Array<{ month: string; amount: number }>;
  topTransaction: { merchant: string; amount: number; category: string; date: string };
  allCategories: string[];
  transactionCount: number;
  uncategorizedCount: number;
}

export function mockExpense(overrides?: Partial<ParsedTransaction>): ParsedTransaction {
  const amount = overrides?.amount ?? 45.67;
  return {
    date: overrides?.date ?? '2026-04-10',
    merchant: overrides?.merchant ?? 'Test Merchant',
    amount,
    type: overrides?.type ?? 'Expense',
    category: overrides?.category ?? 'General',
    account: overrides?.account ?? 'OP',
    paidBy: overrides?.paidBy ?? 'tung',
    note: overrides?.note ?? '',
  };
}

export function mockExpenses(count: number, baseDate: Date = new Date('2026-04-10')): ParsedTransaction[] {
  const categories = ['Shopping', 'Food & Dining', 'Food & Groceries', 'Transport', 'Entertainment'];
  const merchants = ['Amazon', 'Starbucks', 'Whole Foods', 'Uber', 'Netflix', 'Spotify', 'Target', 'Trader Joe\'s', 'Restaurant', 'Gas Station'];

  const expenses: ParsedTransaction[] = [];

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + Math.floor(i / 2));

    const amount = Math.random() * 100 + 5;
    const category = categories[i % categories.length];
    const merchant = merchants[i % merchants.length];

    expenses.push(
      mockExpense({
        date: date.toISOString().split('T')[0],
        merchant,
        amount,
        category,
      })
    );
  }

  return expenses;
}

export function createDashboardAggregation(transactions: ParsedTransaction[]): DashboardAggregation {
  const expenses = transactions.filter((t) => t.type === 'Expense');
  const income = transactions.filter((t) => t.type === 'Income');

  const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);
  const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);

  // Calculate by category
  const byCategory = Array.from(
    expenses.reduce((map, t) => {
      const current = map.get(t.category) || 0;
      map.set(t.category, current + t.amount);
      return map;
    }, new Map<string, number>())
  )
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // Calculate by day
  const byDayMap = new Map<string, Record<string, number>>();
  expenses.forEach((t) => {
    const day = t.date;
    if (!byDayMap.has(day)) {
      byDayMap.set(day, {});
    }
    const dayData = byDayMap.get(day)!;
    dayData[t.category] = (dayData[t.category] || 0) + t.amount;
  });

  const byDay = Array.from(byDayMap.entries())
    .map(([day, data]) => ({ day, ...data }))
    .sort((a, b) => a.day.localeCompare(b.day));

  // Calculate by account
  const byAccount = expenses.reduce(
    (acc, t) => {
      acc[t.account || 'Unknown'] = (acc[t.account || 'Unknown'] || 0) + t.amount;
      return acc;
    },
    {} as Record<string, number>
  );

  // Calculate by month
  const byMonthMap = new Map<string, number>();
  expenses.forEach((t) => {
    const month = t.date.substring(0, 7); // YYYY-MM
    byMonthMap.set(month, (byMonthMap.get(month) || 0) + t.amount);
  });

  const byMonth = Array.from(byMonthMap.entries())
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const topTransaction = expenses.reduce(
    (max, t) => (t.amount > max.amount ? { merchant: t.merchant, amount: t.amount, category: t.category, date: t.date } : max),
    { merchant: '', amount: 0, category: '', date: '' }
  );

  const allCategories = Array.from(new Set(expenses.map((t) => t.category)));

  return {
    totalExpenses,
    totalIncome,
    net: totalIncome - totalExpenses,
    byCategory,
    byDay,
    byAccount,
    byMonth,
    topTransaction,
    allCategories,
    transactionCount: expenses.length,
    uncategorizedCount: expenses.filter((t) => !t.category || t.category === '').length,
  };
}

/**
 * Mock backend API endpoints
 * Usage: await setupSplitwise(page, mockExpenses(5))
 */
export async function setupSplitwise(page: Page, transactions?: ParsedTransaction[]) {
  const mockData = transactions || mockExpenses(5);
  const dashboard = createDashboardAggregation(mockData);

  // Mock /api/dashboard
  await page.route('**/api/dashboard*', async (route) => {
    await route.fulfill({
      json: dashboard,
    });
  });

  // Mock /api/transactions
  await page.route('**/api/transactions*', async (route) => {
    const url = new URL(route.request().url());
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const limit = parseInt(url.searchParams.get('limit') || '50');

    const paginatedTransactions = mockData
      .map((t, i) => ({ ...t, id: String(i + 1) }))
      .slice(offset, offset + limit);

    await route.fulfill({
      json: {
        transactions: paginatedTransactions,
        total: mockData.length,
        offset,
        limit,
      },
    });
  });

  // Mock /api/categories
  await page.route('**/api/categories*', async (route) => {
    const categories = Array.from(new Set(mockData.map((t) => t.category)));
    await route.fulfill({
      json: { categories: categories.sort() },
    });
  });

  // Mock /api/export
  await page.route('**/api/export*', async (route) => {
    const csv = ['date,merchant,amount,category\n', ...mockData.map((t) => `${t.date},${t.merchant},${t.amount},${t.category}`)].join('');
    await route.fulfill({
      body: csv,
      contentType: 'text/csv',
    });
  });
}
