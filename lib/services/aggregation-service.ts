import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { DashboardAggregation } from '@/lib/types';

export async function getDashboardStats(dateFrom?: Date, dateTo?: Date, category?: string): Promise<DashboardAggregation> {
  const where: Prisma.TransactionWhereInput = {};

  if (dateFrom || dateTo) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (dateFrom) dateFilter.gte = dateFrom;
    if (dateTo) dateFilter.lte = dateTo;
    where.date = dateFilter;
  }

  const allTransactions = await prisma.transaction.findMany({ where });

  let expenseTransactions = allTransactions.filter(t => t.type === 'Expense');
  if (category) {
    expenseTransactions = expenseTransactions.filter(t => t.category === category);
  }
  const incomeTransactions = allTransactions.filter(t => t.type === 'Income');

  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

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
    new Set(
      allTransactions
        .filter(t => t.type === 'Expense')
        .map(t => t.category)
        .filter(Boolean)
    )
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

  return {
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
}
