import { getAllExpenses, parseExpenseDetails } from '@/lib/splitwise';
import { DashboardAggregation } from '@/lib/types';
import { withCache } from '@/lib/cache';

export async function getDashboardStats(dateFrom?: Date, dateTo?: Date, category?: string): Promise<DashboardAggregation> {
  const datedAfter = dateFrom ? dateFrom.toISOString().split('T')[0] : undefined;
  const datedBefore = dateTo ? dateTo.toISOString().split('T')[0] : undefined;

  const cacheKey = `expenses:${datedAfter ?? 'all'}:${datedBefore ?? 'all'}`;
  const expenses = await withCache(cacheKey, 300, () =>
    getAllExpenses({ datedAfter, datedBefore })
  );

  // Convert to transaction format and filter
  const allTransactions = expenses
    .filter(exp => !exp.deleted_at && !exp.payment)
    .map(exp => {
      const details = parseExpenseDetails(exp.details);
      const categoryName = details.category || exp.category?.name || '';
      const isExpense = parseFloat(exp.cost) > 0;

      return {
        date: new Date(exp.date),
        account: details.account || 'Splitwise',
        merchant: exp.description,
        amount: isExpense ? -parseFloat(exp.cost) : parseFloat(exp.cost),
        type: isExpense ? 'Expense' : 'Income',
        category: categoryName,
      };
    });

  let expenseTransactions = allTransactions.filter(t => t.type === 'Expense');
  if (category) {
    expenseTransactions = expenseTransactions.filter(t => t.category === category);
  }
  const incomeTransactions = allTransactions.filter(t => t.type === 'Income');

  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

  // By category
  const byCategory = expenseTransactions.reduce((acc, t) => {
    const cat = t.category || '⚠ Uncategorized';
    acc[cat] = (acc[cat] || 0) + Math.abs(t.amount);
    return acc;
  }, {} as Record<string, number>);

  const byCategoryArray = Object.entries(byCategory)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  // By account
  const byAccount = expenseTransactions.reduce((acc, t) => {
    acc[t.account] = (acc[t.account] || 0) + Math.abs(t.amount);
    return acc;
  }, {} as Record<string, number>);

  // By month
  const byMonth = expenseTransactions.reduce((acc, t) => {
    const month = t.date.toISOString().slice(0, 7); // YYYY-MM
    acc[month] = (acc[month] || 0) + Math.abs(t.amount);
    return acc;
  }, {} as Record<string, number>);

  const byMonthArray = Object.entries(byMonth)
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const uncategorizedCount = expenseTransactions.filter(t => !t.category).length;

  // Extract all unique categories from unfiltered expenses
  const allExpensesUnfiltered = allTransactions.filter(t => t.type === 'Expense');
  const allCategories = Array.from(
    new Set(
      allExpensesUnfiltered
        .map(t => t.category)
        .filter(cat => cat) // exclude empty strings
    )
  ).sort();

  // By day - group expenses by YYYY-MM-DD with category breakdown
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

  // Top transaction - single highest amount expense
  const topTransaction = expenseTransactions.length > 0
    ? (() => {
        const max = expenseTransactions.reduce((maxT, t) =>
          Math.abs(t.amount) > Math.abs(maxT.amount) ? t : maxT
        );
        return {
          merchant: max.merchant,
          amount: Math.abs(max.amount),
          category: max.category || '⚠ Uncategorized',
          date: max.date.toISOString().slice(0, 10)
        };
      })()
    : null;

  const transactionCount = expenseTransactions.length;

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
    transactionCount
  };
}
