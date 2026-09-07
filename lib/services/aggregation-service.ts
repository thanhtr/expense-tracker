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
  // Excludes transactions explicitly linked to an expense (TransactionLink) — those are
  // netted precisely against their own expense's category below instead, so a linked
  // reimbursement is never counted by both mechanisms at once.
  const reimbWhere: Prisma.TransactionWhereInput = { ...expenseWhere, amount: { gt: 0 }, reimbursementLink: null };

  // Income is not filtered by the active spending-category selector, but non-spending
  // categories (e.g. savings→checking credits tagged "Internal Transfer") must be excluded
  // so they don't inflate totalIncome. Exception: if the user explicitly filters to one of
  // those categories, let the income rows through so they can inspect the real data.
  // NOTE: uses NON_SPENDING_CATEGORIES.includes() rather than `category ?` — incomeWhere
  // starts from baseWhere (unscoped), so `category ?` would drop the exclusion whenever any
  // spending category is active, letting capital-movement income credits slip back in.
  // categoryFilterIsNonSpending is also reused by matchesIncomeWhere() below, which
  // re-checks these same conditions against a single row — keep the two in sync.
  const categoryFilterIsNonSpending = NON_SPENDING_CATEGORIES.includes(category ?? '');
  const incomeWhere: Prisma.TransactionWhereInput = {
    ...baseWhere,
    type: 'Income',
    ...(categoryFilterIsNonSpending
      ? {}
      : { NOT: { category: { in: NON_SPENDING_CATEGORIES } } }),
  };

  // Capital movement totals always computed for the period regardless of category filter.
  // These are excluded from income/expense charts but shown in a separate Capital Movements section.
  const investmentsWhere: Prisma.TransactionWhereInput = {
    ...baseWhere,
    type: 'Expense',
    category: 'Investments',
  };
  const internalTransferWhere: Prisma.TransactionWhereInput = {
    ...baseWhere,
    category: 'Internal Transfer',
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
    internalTransferAggregate,
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
    prisma.transaction.aggregate({
      where: internalTransferWhere,
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
  // When both legs are recorded (credit + debit) they cancel in the SUM → 0, which is correct
  // (net capital movement is zero). When only one leg is tracked (the typical case), Math.abs
  // gives the magnitude of that single leg.
  const totalInternalTransfers = Math.abs(internalTransferAggregate._sum.amount ?? 0);
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
    ...(totalInternalTransfers > 0 && category !== 'Internal Transfer' ? ['Internal Transfer'] : []),
  ].sort();

  const byAccount = Object.fromEntries(
    byAccountGroups.map(g => [g.account, Math.abs(g._sum.amount ?? 0)])
  );

  const byPersonArray = byPersonGroups
    .filter(g => g.paidBy)
    .map(g => ({ person: g.paidBy, amount: Math.abs(g._sum.amount ?? 0) }))
    .sort((a, b) => b.amount - a.amount);

  // Fetch splits and reimbursement links for expense transactions in this period.
  // Each is wrapped in its own try-catch (table may not exist during migration window)
  // and run concurrently since they're independent queries.
  type SplitRecord = {
    transactionId: number;
    category: string;
    amount: number;
    transaction: { date: Date; amount: number; category: string | null };
  };
  type LinkRecord = {
    expenseTransaction: { category: string | null };
    reimbursementTransaction: {
      type: string;
      amount: number;
      category: string | null;
      date: Date;
      account: string;
      paidBy: string;
    };
  };

  const [splitRecords, linkRecords] = await Promise.all([
    (async (): Promise<SplitRecord[]> => {
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
        return raw.filter(s => s.transaction !== null) as SplitRecord[];
      } catch {
        // table doesn't exist yet — proceed without split adjustments
        return [];
      }
    })(),
    (async (): Promise<LinkRecord[]> => {
      try {
        const raw = await prisma.transactionLink.findMany({
          where: { expenseTransaction: expenseWhere },
          select: {
            expenseTransaction: { select: { category: true } },
            reimbursementTransaction: {
              select: { type: true, amount: true, category: true, date: true, account: true, paidBy: true },
            },
          },
        });
        return raw.filter(r => r.expenseTransaction !== null) as LinkRecord[];
      } catch {
        // table doesn't exist yet — proceed without link adjustments
        return [];
      }
    })(),
  ]);

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

  // Net reimbursements against each category's gross expense total. reimbWhere already
  // excludes explicitly-linked reimbursements (see its definition above), so this can't
  // double-count against the precise per-expense netting below.
  for (const r of reimbByCategoryGroups) {
    const cat = r.category || '⚠ Uncategorized';
    adjustedByCat[cat] = (adjustedByCat[cat] ?? 0) - (r._sum.amount ?? 0);
  }

  // Net each explicitly linked reimbursement against its own expense's category — this
  // is what lets a fronted expense's true net cost show correctly even when the
  // repayment has a different category or merchant than the expense itself. A linked
  // Income-type reimbursement (the common case: a friend's Mobilepay credit) also moves
  // out of totalIncome and into totalReimbursements — net is unaffected since both terms
  // shift by the same amount — but only when the reimbursement's own row would actually
  // have been counted in totalIncome for this view (matching the same period/account/
  // paidBy/non-spending-category rules as incomeWhere above); otherwise its own date
  // falls outside the current view and was never in totalIncome to begin with.
  const matchesIncomeWhere = (r: { date: Date; account: string; paidBy: string; category: string | null }) => {
    if (dateFrom && r.date < dateFrom) return false;
    if (dateTo && r.date > dateTo) return false;
    if (paidBy && r.paidBy !== paidBy) return false;
    if (account && r.account !== account) return false;
    const isNonSpending = NON_SPENDING_CATEGORIES.includes(r.category ?? '');
    if (isNonSpending && !categoryFilterIsNonSpending) return false;
    return true;
  };

  // linkedReimbursementTotal tracks every linked reimbursement (Income or positive-amount
  // Expense) so totalReimbursements/net stay consistent with the per-category netting above —
  // reimbWhere excludes linked rows entirely, so without this a linked Expense-type
  // reimbursement would reduce a category's total but never reach totalReimbursements/net.
  let linkedIncomeAdjustment = 0;
  let linkedReimbursementTotal = 0;
  for (const link of linkRecords) {
    const { type, amount } = link.reimbursementTransaction;
    const expenseCat = link.expenseTransaction.category || '⚠ Uncategorized';

    linkedReimbursementTotal += amount;
    if (type === 'Income' && matchesIncomeWhere(link.reimbursementTransaction)) {
      linkedIncomeAdjustment += amount;
    }

    adjustedByCat[expenseCat] = (adjustedByCat[expenseCat] ?? 0) - amount;
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

  // Linked Income-type reimbursements move from totalIncome into totalReimbursements
  // (see the linkRecords loop above) — net is unaffected since both terms shift equally.
  // Linked Expense-type reimbursements were never part of any prior total (reimbWhere
  // excludes them), so they're added to totalReimbursements outright.
  const adjustedTotalIncome = totalIncome - linkedIncomeAdjustment;
  const adjustedTotalReimbursements = totalReimbursements + linkedReimbursementTotal;

  const result: DashboardAggregation = {
    totalExpenses,
    totalIncome: adjustedTotalIncome,
    totalInvestments,
    totalInternalTransfers,
    totalReimbursements: adjustedTotalReimbursements,
    net: adjustedTotalIncome - totalExpenses + adjustedTotalReimbursements,
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
