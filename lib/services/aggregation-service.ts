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

  const expenseWhere = { ...where, type: 'Expense' };

  const [
    byCategoryGroups,
    byAccountGroups,
    byPersonGroups,
    byDayCatGroups,
    totalAgg,
    uncategorizedCount,
    incomeAggregate,
    topTx,
  ] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['category'],
      where: expenseWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['account'],
      where: expenseWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['paidBy'],
      where: expenseWhere,
      _sum: { amount: true },
    }),
    // Date is @db.Date so grouping by date gives one row per (day, category)
    prisma.transaction.groupBy({
      by: ['date', 'category'],
      where: expenseWhere,
      _sum: { amount: true },
      orderBy: { date: 'asc' },
    }),
    prisma.transaction.aggregate({
      where: expenseWhere,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.transaction.count({
      where: { ...expenseWhere, category: '' },
    }),
    prisma.transaction.aggregate({
      where: { ...where, type: 'Income' },
      _sum: { amount: true },
    }),
    prisma.transaction.findFirst({
      where: expenseWhere,
      select: { merchant: true, amount: true, category: true, date: true },
      orderBy: { amount: 'asc' }, // most negative = largest expense
    }),
  ]);

  const totalExpenses = Math.abs(totalAgg._sum.amount ?? 0);
  const totalIncome = incomeAggregate._sum.amount ?? 0;
  const transactionCount = totalAgg._count.id;

  const byCategoryArray = byCategoryGroups
    .map(g => ({ category: g.category || '⚠ Uncategorized', amount: Math.abs(g._sum.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount);

  const allCategories = byCategoryGroups
    .map(g => g.category)
    .filter(Boolean)
    .sort();

  const byAccount = Object.fromEntries(
    byAccountGroups.map(g => [g.account, Math.abs(g._sum.amount ?? 0)])
  );

  const byPersonArray = byPersonGroups
    .filter(g => g.paidBy)
    .map(g => ({ person: g.paidBy, amount: Math.abs(g._sum.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount);

  // Derive byMonth, byDay, byCategoryMonth from the single grouped time-series query
  const byMonthMap: Record<string, number> = {};
  const dayMap: Record<string, Record<string, number>> = {};
  const monthMap: Record<string, Record<string, number>> = {};

  for (const g of byDayCatGroups) {
    const day = g.date.toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    const cat = g.category || '⚠ Uncategorized';
    const amt = Math.abs(g._sum.amount ?? 0);

    byMonthMap[month] = (byMonthMap[month] ?? 0) + amt;

    if (!dayMap[day]) dayMap[day] = {};
    dayMap[day][cat] = (dayMap[day][cat] ?? 0) + amt;

    if (!monthMap[month]) monthMap[month] = {};
    monthMap[month][cat] = (monthMap[month][cat] ?? 0) + amt;
  }

  const byMonthArray = Object.entries(byMonthMap)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byDayArray = Object.entries(dayMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, cats]) => ({ day, ...cats }));

  const byCategoryMonthArray = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cats]) => ({ month, ...cats }));

  const topTransaction = topTx ? {
    merchant: topTx.merchant,
    amount: Math.abs(topTx.amount),
    category: topTx.category || '⚠ Uncategorized',
    date: topTx.date.toISOString().slice(0, 10),
  } : null;

  const result: DashboardAggregation = {
    totalExpenses,
    totalIncome,
    net: totalIncome - totalExpenses,
    byCategory: byCategoryArray,
    byAccount,
    byPerson: byPersonArray,
    byMonth: byMonthArray,
    byCategoryMonth: byCategoryMonthArray,
    byDay: byDayArray,
    uncategorizedCount,
    allCategories,
    topTransaction,
    transactionCount,
  };

  _cache.set(key, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}
