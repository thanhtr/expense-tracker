import { getAllExpenses, buildExistingKeys, makeDedupKey, parseExpenseDetails, createExpense } from '@/lib/splitwise';
import { CATEGORY_MAP, DEFAULT_CATEGORY_ID, USER_ID, WIFE_ID, GROUP_ID } from '@/lib/constants';
import { ParsedTransaction, TransactionWithId } from '@/lib/types';
import { withCache } from '@/lib/cache';

interface CreateExpenseRequest extends Record<string, string | number> {
  cost: string;
  description: string;
  currency_code: string;
  date: string;
  category_id: number;
  group_id: string;
  'users__0__user_id': string;
  'users__0__paid_share': string;
  'users__0__owed_share': string;
  'users__1__user_id': string;
  'users__1__paid_share': string;
  'users__1__owed_share': string;
  details: string;
}

/**
 * Create Splitwise expenses from parsed transactions
 * Returns count of created vs skipped (duplicates)
 * accountOwner: 'tung' or 'thuy' — determines who paid
 */
export async function upsertTransactions(rows: ParsedTransaction[], accountOwner: string = 'tung') {
  let created = 0;
  let skipped = 0;

  // Determine date range
  if (rows.length === 0) {
    return { imported: 0, duplicates: 0, total: 0, created: 0, skipped: 0 };
  }

  const dates = rows.map(r => r.date);
  const dateFrom = new Date(Math.min(...dates.map(d => d.getTime()))).toISOString().split('T')[0];
  const dateTo = new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split('T')[0];

  // Fetch existing expenses
  const existing = await getAllExpenses({ datedAfter: dateFrom, datedBefore: dateTo });
  const existingCounts = buildExistingKeys(existing);

  // Determine who paid based on accountOwner
  const paidByUserId = accountOwner === 'thuy' ? WIFE_ID : USER_ID;

  // Create expenses
  // seenCount tracks how many times each dedup key has been processed in this
  // batch. A transaction is a duplicate only when seenCount < existingCount,
  // so two real purchases with the same merchant/amount/date on the same day
  // are each handled correctly regardless of what is already in Splitwise.
  const seenCount = new Map<string, number>();
  for (const row of rows) {
    // Skip income transactions
    if (row.type === 'Income') {
      skipped++;
      continue;
    }

    const dateStr = row.date.toISOString().split('T')[0];
    const cost = Math.abs(row.amount).toFixed(2);
    const dedupKey = makeDedupKey(dateStr, row.merchant, cost);

    const seen = seenCount.get(dedupKey) ?? 0;
    seenCount.set(dedupKey, seen + 1);

    // Skip if this occurrence is already covered by an existing Splitwise entry
    if (seen < (existingCounts.get(dedupKey) ?? 0)) {
      skipped++;
      continue;
    }

    try {
      const categoryId = CATEGORY_MAP[row.category || ''] || DEFAULT_CATEGORY_ID;

      const details = JSON.stringify({
        account: row.account,
        category: row.category || '',
      });

      const body: CreateExpenseRequest = {
        cost,
        description: row.merchant,
        currency_code: 'EUR',
        date: `${dateStr}T12:00:00Z`,
        category_id: categoryId,
        group_id: String(GROUP_ID),
        // Paid by account owner, split equally
        'users__0__user_id': String(paidByUserId),
        'users__0__paid_share': cost,
        'users__0__owed_share': (parseFloat(cost) / 2).toFixed(2),
        'users__1__user_id': String(paidByUserId === USER_ID ? WIFE_ID : USER_ID),
        'users__1__paid_share': '0',
        'users__1__owed_share': (parseFloat(cost) / 2).toFixed(2),
        details,
      };

      await createExpense(body);
      created++;
    } catch {
      skipped++;
    }
  }

  return { imported: created, duplicates: skipped, total: rows.length, created, skipped };
}

/**
 * Fetch and filter transactions from Splitwise
 */
export async function getTransactions(filters: {
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  category?: string;
  merchant?: string;
  type?: string;
  paidBy?: 'tung' | 'thuy' | 'other';
  sortBy?: string;
  order?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  transactions: TransactionWithId[];
  total: number;
  limit: number;
  offset: number;
}> {
  // Fetch all expenses from Splitwise (with cache)
  const cacheKey = `expenses:${filters.dateFrom ?? 'all'}:${filters.dateTo ?? 'all'}`;
  const expenses = await withCache(cacheKey, 300, () =>
    getAllExpenses({
      datedAfter: filters.dateFrom,
      datedBefore: filters.dateTo,
    })
  );

  // Convert Splitwise expenses to our transaction format
  let transactions: TransactionWithId[] = expenses
    .filter(exp => !exp.deleted_at)
    .map((exp) => {
      const details = parseExpenseDetails(exp.details);
      const categoryName = details.category || exp.category?.name || '';

      // Determine the payer user
      const paidByUser = exp.users.find(u => parseFloat(String(u.paid_share)) > 0);
      const paidByUserId = paidByUser?.user_id;
      const isExpense = parseFloat(exp.cost) > 0;

      // Map user ID to payer name
      const paidBy: 'tung' | 'thuy' | 'other' =
        paidByUserId === USER_ID ? 'tung'
        : paidByUserId === WIFE_ID ? 'thuy'
        : 'other';

      return {
        id: exp.id,
        date: new Date(exp.date),
        account: details.account || 'Splitwise',
        merchant: exp.description,
        amount: isExpense ? -parseFloat(exp.cost) : parseFloat(exp.cost),
        note: '',
        type: isExpense ? 'Expense' : 'Income',
        category: categoryName,
        paidBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    });

  // Apply in-memory filters
  if (filters.account) {
    transactions = transactions.filter(t => t.account === filters.account);
  }
  if (filters.category) {
    transactions = transactions.filter(t => t.category === filters.category);
  }
  if (filters.merchant) {
    const searchLower = filters.merchant.toLowerCase();
    transactions = transactions.filter(t =>
      t.merchant.toLowerCase().includes(searchLower)
    );
  }
  if (filters.type) {
    transactions = transactions.filter(t => t.type === filters.type);
  }
  if (filters.paidBy) {
    transactions = transactions.filter(t => t.paidBy === filters.paidBy);
  }

  // Sort — only allow known, safe fields to prevent runtime errors on arbitrary input
  const ALLOWED_SORT_FIELDS = ['date', 'amount', 'merchant', 'category'] as const;
  type AllowedSortField = typeof ALLOWED_SORT_FIELDS[number];
  const sortBy: AllowedSortField =
    ALLOWED_SORT_FIELDS.includes(filters.sortBy as AllowedSortField)
      ? (filters.sortBy as AllowedSortField)
      : 'date';
  const order = filters.order === 'asc' ? 'asc' : 'desc';
  transactions.sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    // Type-aware comparison: Dates, numbers, and strings each need their own path
    if (aVal instanceof Date && bVal instanceof Date) {
      return order === 'asc' ? aVal.getTime() - bVal.getTime() : bVal.getTime() - aVal.getTime();
    }
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return order === 'asc' ? aVal - bVal : bVal - aVal;
    }
    const aStr = String(aVal ?? '');
    const bStr = String(bVal ?? '');
    const cmp = aStr.localeCompare(bStr);
    return order === 'asc' ? cmp : -cmp;
  });

  // Paginate — clamp to safe bounds to prevent negative slices or huge result sets
  const limit = Math.max(1, Math.min(filters.limit || 50, 10_000));
  const offset = Math.max(0, filters.offset || 0);
  const total = transactions.length;
  const paginated = transactions.slice(offset, offset + limit);

  return {
    transactions: paginated,
    total,
    limit,
    offset,
  };
}
