import { prisma } from '@/lib/db';
import { ParsedTransaction, TransactionWithId } from '@/lib/types';
import { Prisma } from '@prisma/client';

function makeDedupKey(date: string, account: string, merchant: string, cost: string): string {
  return `${date}|${account}|${merchant}|${cost}`;
}

export async function upsertTransactions(rows: ParsedTransaction[], accountOwner: string = 'tung') {
  if (rows.length === 0) {
    return { imported: 0, duplicates: 0, errors: 0, total: 0, created: 0, skipped: 0 };
  }

  const paidBy = accountOwner === 'thuy' ? 'thuy' : 'tung';

  // Separate income (always skipped) from expense candidates
  const expenseRows = rows.filter(r => r.type !== 'Income');
  const incomeSkipped = rows.length - expenseRows.length;

  // Build dedupKey for every expense row (suffix for intra-batch duplicates)
  const seenCount = new Map<string, number>();
  const candidates = expenseRows.map(row => {
    const dateStr = row.date.toISOString().split('T')[0];
    const cost = Math.abs(row.amount).toFixed(2);
    const baseKey = makeDedupKey(dateStr, row.account, row.merchant, cost);
    const seen = seenCount.get(baseKey) ?? 0;
    seenCount.set(baseKey, seen + 1);
    const dedupKey = seen === 0 ? baseKey : `${baseKey}|${seen}`;
    return { row, dedupKey, dateStr, cost };
  });

  // Single query to find all already-existing dedupKeys
  const existingRows = await prisma.transaction.findMany({
    where: { dedupKey: { in: candidates.map(c => c.dedupKey) } },
    select: { dedupKey: true },
  });
  const existingKeys = new Set(
    existingRows.map(r => r.dedupKey).filter((k): k is string => k !== null)
  );

  let created = 0;
  let skipped = incomeSkipped;
  let errors = 0;

  for (const { row, dedupKey, dateStr, cost } of candidates) {
    if (existingKeys.has(dedupKey)) {
      skipped++;
      continue;
    }
    try {
      await prisma.transaction.create({
        data: {
          date: row.date,
          account: row.account,
          merchant: row.merchant,
          amount: -Math.abs(row.amount),
          note: row.note || '',
          type: 'Expense',
          category: row.category || '',
          paidBy,
          dedupKey,
        },
      });
      created++;
    } catch (err) {
      errors++;
      console.error(`Failed to create transaction "${row.merchant}" ${dateStr} €${cost}:`, err);
    }
  }

  return { imported: created, duplicates: skipped, errors, total: rows.length, created, skipped };
}

export async function getTransactions(filters: {
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  category?: string;
  merchant?: string;
  type?: string;
  paidBy?: 'tung' | 'thuy' | 'other';
  amountMin?: number;
  amountMax?: number;
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
  const where: Prisma.TransactionWhereInput = {};

  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) (where.date as Prisma.DateTimeFilter).gte = new Date(filters.dateFrom);
    if (filters.dateTo) (where.date as Prisma.DateTimeFilter).lte = new Date(filters.dateTo);
  }
  if (filters.account) where.account = filters.account;
  if (filters.category === '__uncategorized__') {
    where.category = '';
  } else if (filters.category) {
    where.category = filters.category;
  }
  if (filters.type) where.type = filters.type;
  if (filters.paidBy) where.paidBy = filters.paidBy;
  if (filters.merchant) where.merchant = { contains: filters.merchant, mode: 'insensitive' };
  if (filters.amountMin !== undefined || filters.amountMax !== undefined) {
    const amountFilter: Prisma.FloatFilter = {};
    // Expenses are stored as negative numbers; amountMin/Max are absolute values
    if (filters.amountMin !== undefined) amountFilter.lte = -filters.amountMin;
    if (filters.amountMax !== undefined) amountFilter.gte = -filters.amountMax;
    where.amount = amountFilter;
  }

  const ALLOWED_SORT_FIELDS = ['date', 'amount', 'merchant', 'category'] as const;
  type AllowedSortField = typeof ALLOWED_SORT_FIELDS[number];
  const sortBy: AllowedSortField =
    ALLOWED_SORT_FIELDS.includes(filters.sortBy as AllowedSortField)
      ? (filters.sortBy as AllowedSortField)
      : 'date';
  const order = filters.order === 'asc' ? 'asc' : 'desc';

  const limit = Math.max(1, Math.min(filters.limit ?? 50, 10_000));
  const offset = Math.max(0, filters.offset ?? 0);

  const [total, rows] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: { [sortBy]: order },
      skip: offset,
      take: limit,
    }),
  ]);

  const transactions: TransactionWithId[] = rows.map((row) => ({
    id: row.id,
    date: row.date,
    account: row.account,
    merchant: row.merchant,
    amount: row.amount,
    note: row.note,
    type: row.type as 'Income' | 'Expense',
    category: row.category,
    paidBy: row.paidBy as 'tung' | 'thuy' | 'other',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return { transactions, total, limit, offset };
}
