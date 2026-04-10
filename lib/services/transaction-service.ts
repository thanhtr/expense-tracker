import { getAllExpenses, buildExistingKeys, makeDedupKey, parseExpenseDetails, createExpense } from '@/lib/splitwise';
import { CATEGORY_MAP, DEFAULT_CATEGORY_ID, USER_ID, WIFE_ID, GROUP_ID } from '@/lib/constants';
import { ParsedTransaction, TransactionWithId } from '@/lib/types';
import { withCache } from '@/lib/cache';

interface CreateExpenseRequest {
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
  const existingKeys = buildExistingKeys(existing);

  // Determine who paid based on accountOwner
  const paidByUserId = accountOwner === 'thuy' ? WIFE_ID : USER_ID;

  // Create expenses
  const createdKeys = new Set<string>();
  for (const row of rows) {
    // Skip income transactions
    if (row.type === 'Income') {
      skipped++;
      continue;
    }

    const dateStr = row.date.toISOString().split('T')[0];
    const cost = Math.abs(row.amount).toFixed(2);
    const dedupKey = makeDedupKey(dateStr, row.merchant, cost);

    // Check for duplicates in Splitwise or within current batch
    if (existingKeys.has(dedupKey)) {
      skipped++;
      continue;
    }
    if (createdKeys.has(dedupKey)) {
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
        group_id: GROUP_ID,
        // Paid by account owner, split equally
        'users__0__user_id': paidByUserId,
        'users__0__paid_share': cost,
        'users__0__owed_share': (parseFloat(cost) / 2).toFixed(2),
        'users__1__user_id': paidByUserId === USER_ID ? WIFE_ID : USER_ID,
        'users__1__paid_share': '0',
        'users__1__owed_share': (parseFloat(cost) / 2).toFixed(2),
        details,
      };

      await createExpense(body);
      createdKeys.add(dedupKey);
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
      const paidByUser = exp.users.find(u => parseFloat(u.paid_share) > 0);
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

  // Sort
  const sortBy: keyof TransactionWithId = (filters.sortBy as keyof TransactionWithId) || 'date';
  const order = filters.order || 'desc';
  transactions.sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((aVal as any) < (bVal as any)) return order === 'asc' ? -1 : 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((aVal as any) > (bVal as any)) return order === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginate
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;
  const total = transactions.length;
  const paginated = transactions.slice(offset, offset + limit);

  return {
    transactions: paginated,
    total,
    limit,
    offset,
  };
}
