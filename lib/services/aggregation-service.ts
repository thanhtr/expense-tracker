import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DashboardAggregation } from '@/lib/types';

const _cache = new Map<string, { data: DashboardAggregation; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// Categories that aren't real income/expense (moving money between own accounts,
// not consumption) and so are excluded from totals/charts by default. They still
// show real numbers when the user explicitly filters to one of them.
const NON_SPENDING_CATEGORIES = ['Investments', 'Internal Transfer'];

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
  forceRefresh = false,
): Promise<DashboardAggregation> {
  const key = cacheKey(dateFrom, dateTo, category, paidBy, account);
  const cached = _cache.get(key);
  if (!forceRefresh && cached && Date.now() < cached.expiry) return cached.data;

  // baseWhere: period + account + person filters, no category
  const baseWhere: Prisma.TransactionWhereInput = {};

  if (dateFrom || dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;
    baseWhere.date = dateFilter;
  }

  if (paidBy) baseWhere.paidBy = paidBy;
  if (account) baseWhere.account = account;

  const where: Prisma.TransactionWhereInput = { ...baseWhere };
  if (category) where.category = category;

  // Exclude non-spending categories (Investments, Internal Transfer, ...) from expense
  // queries so charts/totals reflect living costs only.
  // Exception: if the user explicitly filtered to one of them, pass through as-is.
  const expenseWhere: Prisma.TransactionWhereInput = {
    ...where,
    type: 'Expense',
    ...(category ? {} : { NOT: { category: { in: NON_SPENDING_CATEGORIES } } }),
  };

  // Outflows: regular expenses (negative amounts). Used for totals, time-series, topTx.
  const outflowWhere: Prisma.TransactionWhereInput = { ...expenseWhere, amount: { lt: 0 } };
  // Reimbursements: positive-amount Expenses (money back against an expense category).
  const reimbWhere: Prisma.TransactionWhereInput = { ...expenseWhere, amount: { gt: 0 } };

  // Income is never filtered by category — the income line on charts should always
  // reflect total income for the period, regardless of which expense category is selected.
  const incomeWhere: Prisma.TransactionWhereInput = { ...baseWhere, type: 'Income' };

  // Investment total always computed for the period regardless of category filter
  const investmentsWhere: Prisma.TransactionWhereInput = {
    ...baseWhere,
    type: 'Expense',
    category: 'Investments',
  };

  const [
    byCategoryGroups,
    byAccountGroups,
    byPersonGroups,
    byDayCatGroups,
    totalAgg,
    uncategorizedCount,
    incomeAggregate,
    investmentsAggregate,
    incomeSourceGroups,
    topTx,
    incomeRows,
    reimbByCategoryGroups,
    reimbAggregate,
  ] = await Promise.all([
    prisma.transaction.groupBy({
      by: ['category'],
      where: outflowWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['account'],
      where: outflowWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.groupBy({
      by: ['paidBy'],
      where: outflowWhere,
      _sum: { amount: true },
    }),
    // Date is @db.Date so grouping by date gives one row per (day, category)
    prisma.transaction.groupBy({
      by: ['date', 'category'],
      where: outflowWhere,
      _sum: { amount: true },
      orderBy: { date: 'asc' },
    }),
    prisma.transaction.aggregate({
      where: outflowWhere,
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.transaction.count({
      where: { ...outflowWhere, category: '' },
    }),
    prisma.transaction.aggregate({
      where: incomeWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: investmentsWhere,
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
      where: outflowWhere,
      select: { merchant: true, amount: true, category: true, date: true },
      orderBy: { amount: 'asc' }, // most negative = largest expense
    }),
    prisma.transaction.findMany({
      where: incomeWhere,
      select: { date: true, amount: true },
      orderBy: { date: 'asc' },
      take: 10000,
    }),
    // Reimbursements: positive-amount Expenses grouped by category for netting
    prisma.transaction.groupBy({
      by: ['category'],
      where: reimbWhere,
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: reimbWhere,
      _sum: { amount: true },
    }),
  ]);

  const totalExpenses = Math.abs(totalAgg._sum.amount ?? 0);
  const totalIncome = incomeAggregate._sum.amount ?? 0;
  const totalInvestments = Math.abs(investmentsAggregate._sum.amount ?? 0);
  const totalReimbursements = reimbAggregate._sum.amount ?? 0;
  const transactionCount = totalAgg._count.id;

  const byIncomeSource = incomeSourceGroups.map(g => ({
    merchant: g.merchant,
    amount: g._sum.amount ?? 0,
  }));

  // Re-include Investments in the category list even though it's excluded from charts,
  // so it still appears in budget/guideline category dropdowns
  // Always include Investments in the category list for dropdowns unless it's
  // already present in byCategoryGroups (which happens when category='Investments' is filtered).
  const allCategories = [
    ...byCategoryGroups.map(g => g.category).filter(Boolean),
    ...(totalInvestments > 0 && category !== 'Investments' ? ['Investments'] : []),
  ].sort();

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

  // Net reimbursements against each category's gross expense total
  for (const r of reimbByCategoryGroups) {
    const cat = r.category || '⚠ Uncategorized';
    adjustedByCat[cat] = (adjustedByCat[cat] ?? 0) - (r._sum.amount ?? 0);
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
    totalInvestments,
    totalReimbursements,
    net: totalIncome - totalExpenses + totalReimbursements,
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
