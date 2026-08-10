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

  const incomeWhere = { ...where, type: 'Income' };

  const [
    byCategoryGroups,
    byAccountGroups,
    byPersonGroups,
    byDayCatGroups,
    totalAgg,
    uncategorizedCount,
    incomeAggregate,
    incomeSourceGroups,
    topTx,
    incomeRows,
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
      where: incomeWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['merchant'],
      where: incomeWhere,
      _sum: { amount: true },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),
    prisma.transaction.findFirst({
      where: expenseWhere,
      select: { merchant: true, amount: true, category: true, date: true },
      orderBy: { amount: 'asc' }, // most negative = largest expense
    }),
    prisma.transaction.findMany({
      where: incomeWhere,
      select: { date: true, amount: true },
      orderBy: { date: 'asc' },
      take: 10000,
    }),
  ]);

  const totalExpenses = Math.abs(totalAgg._sum.amount ?? 0);
  const totalIncome = incomeAggregate._sum.amount ?? 0;
  const transactionCount = totalAgg._count.id;

  const byIncomeSource = incomeSourceGroups.map(g => ({
    merchant: g.merchant,
    amount: g._sum.amount ?? 0,
  }));

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

  // Fetch splits for expense transactions in this period to adjust category attribution
  // Wrapped in try-catch: table may not exist during migration window
  let splitRecords: Array<{
    transactionId: number;
    category: string;
    amount: number;
    transaction: { date: Date; amount: number; category: string | null };
  }> = [];
  try {
    const raw = await prisma.transactionSplit.findMany({
      where: { transaction: expenseWhere },
      select: {
        transactionId: true,
        category: true,
        amount: true,
        transaction: { select: { date: true, amount: true, category: true } },
      },
    });
    splitRecords = raw.filter(s => s.transaction !== null) as typeof splitRecords;
  } catch {
    // table doesn't exist yet — proceed without split adjustments
  }

  // Build a map of transactionId → splits
  const splitsByTx = new Map<number, typeof splitRecords>();
  for (const s of splitRecords) {
    const arr = splitsByTx.get(s.transactionId) ?? [];
    arr.push(s);
    splitsByTx.set(s.transactionId, arr);
  }

  // Derive byMonth, byDay, byCategoryMonth from the single grouped time-series query
  const byMonthMap: Record<string, number> = {};
  const dayMap: Record<string, Record<string, number>> = {};
  const monthMap: Record<string, Record<string, number>> = {};

  // Track which (day, category) amounts need adjustment because of splits
  // We process byDayCatGroups first, then apply split adjustments
  const adjustedByCat: Record<string, number> = {};

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

    adjustedByCat[cat] = (adjustedByCat[cat] ?? 0) + amt;
  }

  // Apply split adjustments: for transactions with splits, redistribute their category amount
  if (splitRecords.length > 0) {
    const processedTxIds = new Set<number>();
    for (const s of splitRecords) {
      if (processedTxIds.has(s.transactionId)) continue;
      processedTxIds.add(s.transactionId);

      const txSplits = splitsByTx.get(s.transactionId) ?? [];
      const originalCat = s.transaction.category || '⚠ Uncategorized';
      const originalAmt = Math.abs(s.transaction.amount);
      const day = s.transaction.date.toISOString().slice(0, 10);
      const month = day.slice(0, 7);

      // Remove original transaction's contribution
      adjustedByCat[originalCat] = (adjustedByCat[originalCat] ?? 0) - originalAmt;
      byMonthMap[month] = (byMonthMap[month] ?? 0) - originalAmt;
      if (dayMap[day]) dayMap[day][originalCat] = (dayMap[day][originalCat] ?? 0) - originalAmt;
      if (monthMap[month]) monthMap[month][originalCat] = (monthMap[month][originalCat] ?? 0) - originalAmt;

      // Add each split's contribution
      for (const split of txSplits) {
        const splitCat = split.category;
        adjustedByCat[splitCat] = (adjustedByCat[splitCat] ?? 0) + split.amount;
        byMonthMap[month] = (byMonthMap[month] ?? 0) + split.amount;
        if (!dayMap[day]) dayMap[day] = {};
        dayMap[day][splitCat] = (dayMap[day][splitCat] ?? 0) + split.amount;
        if (!monthMap[month]) monthMap[month] = {};
        monthMap[month][splitCat] = (monthMap[month][splitCat] ?? 0) + split.amount;
      }
    }
  }

  const finalByCategoryArray = Object.entries(adjustedByCat)
    .filter(([, amt]) => amt > 0)
    .map(([cat, amt]) => ({ category: cat, amount: amt }))
    .sort((a, b) => b.amount - a.amount);

  const byMonthArray = Object.entries(byMonthMap)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byMonthIncomeMap: Record<string, number> = {};
  for (const row of incomeRows) {
    const month = row.date.toISOString().slice(0, 7);
    byMonthIncomeMap[month] = (byMonthIncomeMap[month] ?? 0) + (row.amount ?? 0);
  }
  const byMonthIncomeArray = Object.entries(byMonthIncomeMap)
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
    byCategory: finalByCategoryArray,
    byAccount,
    byPerson: byPersonArray,
    byMonth: byMonthArray,
    byMonthIncome: byMonthIncomeArray,
    byCategoryMonth: byCategoryMonthArray,
    byDay: byDayArray,
    uncategorizedCount,
    allCategories,
    topTransaction,
    transactionCount,
    byIncomeSource,
  };

  _cache.set(key, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}
