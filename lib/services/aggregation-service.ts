import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DashboardAggregation } from '@/lib/types';

const _cache = new Map<string, { data: DashboardAggregation; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function cacheKey(dateFrom?: Date, dateTo?: Date, category?: string, paidBy?: string, account?: string): string {
  return [dateFrom?.toISOString() ?? '', dateTo?.toISOString() ?? '', category ?? '', paidBy ?? '', account ?? ''].join('|');
}

export function invalidateDashboardCache(): void {
  _cache.clear();
}

export async function getDashboardStats(
  dateFrom?: Date,
  dateTo?: Date,
  category?: string,
  paidBy?: string,
  account?: string,
): Promise<DashboardAggregation> {
  const key = cacheKey(dateFrom, dateTo, category, paidBy, account);
  const cached = _cache.get(key);
  if (cached && Date.now() < cached.expiry) return cached.data;

  const where: Prisma.TransactionWhereInput = {};

  if (dateFrom || dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;
    where.date = dateFilter;
  }

  if (category) where.category = category;
  if (paidBy) where.paidBy = paidBy;
  if (account) where.account = account;

  const [expenseTransactions, incomeAggregate] = await Promise.all([
    prisma.transaction.findMany({
      where: { ...where, type: 'Expense' },
      select: { date: true, category: true, account: true, amount: true, merchant: true },
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: 'Income' },
      _sum: { amount: true },
    }),
  ]);

  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalIncome = incomeAggregate._sum.amount ?? 0;

  const byCategory = expenseTransactions.reduce((acc, t) => {
    const cat = t.category || '⚠ Uncategorized';
    acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
    return acc;
  }, {} as Record<string, number>);

  const byCategoryArray = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const byAccount = expenseTransactions.reduce((acc, t) => {
    acc[t.account] = (acc[t.account] || 0) + Math.abs(t.amount);
    return acc;
  }, {} as Record<string, number>);

  const byMonth = expenseTransactions.reduce((acc, t) => {
    const month = t.date.toISOString().slice(0, 7);
    acc[month] = (acc[month] || 0) + Math.abs(t.amount);
    return acc;
  }, {} as Record<string, number>);

  const byMonthArray = Object.entries(byMonth)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const uncategorizedCount = expenseTransactions.filter(t => !t.category).length;

  const allCategories = Array.from(
    new Set(expenseTransactions.map(t => t.category).filter(Boolean))
  ).sort();

  const dayMap: Record<string, Record<string, number>> = {};
  for (const t of expenseTransactions) {
    const day = t.date.toISOString().slice(0, 10);
    if (!dayMap[day]) dayMap[day] = {};
    const cat = t.category || '⚠ Uncategorized';
    dayMap[day][cat] = (dayMap[day][cat] || 0) + Math.abs(t.amount);
  }
  const byDayArray = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cats]) => ({ day, ...cats }));

  const topTransaction = expenseTransactions.length > 0
    ? (() => {
        const max = expenseTransactions.reduce((maxT, t) =>
          Math.abs(t.amount) > Math.abs(maxT.amount) ? t : maxT
        );
        return {
          merchant: max.merchant,
          amount: Math.abs(max.amount),
          category: max.category || '⚠ Uncategorized',
          date: max.date.toISOString().slice(0, 10),
        };
      })()
    : null;

  const result: DashboardAggregation = {
    totalExpenses,
    totalIncome,
    net: totalIncome - totalExpenses,
    byCategory: byCategoryArray,
    byAccount,
    byMonth: byMonthArray,
    byDay: byDayArray,
    uncategorizedCount,
    allCategories,
    topTransaction,
    transactionCount: expenseTransactions.length,
  };

  _cache.set(key, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}
