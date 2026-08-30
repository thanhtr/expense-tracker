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

  const paidBy = accountOwner || 'tung';

  // Build dedupKey for every row (suffix for intra-batch duplicates)
  const seenCount = new Map<string, number>();
  const candidates = rows.map(row => {
    const dateStr = row.date.toISOString().slice(0, 10);
    const cost = row.amount.toFixed(2);
    const baseKey = makeDedupKey(dateStr, row.account, row.merchant, cost);
    const seen = seenCount.get(baseKey) ?? 0;
    seenCount.set(baseKey, seen + 1);
    const dedupKey = seen === 0 ? baseKey : `${baseKey}|${seen}`;
    return { row, dedupKey, dateStr, cost };
  });

  const data = candidates.map(({ row, dedupKey }) => ({
    date: row.date,
    account: row.account,
    merchant: row.merchant,
    // Income stored as positive; Expense preserves sign (negative = outflow, positive = reimbursement)
    amount: row.type === 'Income' ? Math.abs(row.amount) : row.amount,
    note: row.note || '',
    type: row.type,
    category: row.category || '',
    paidBy,
    dedupKey,
  }));

  // createMany with skipDuplicates is a single atomic statement; the DB unique
  // constraint on dedupKey guarantees no partial-import races.
  const { count: created } = await prisma.transaction.createMany({ data, skipDuplicates: true });
  const skipped = rows.length - created;

  return { imported: created, duplicates: skipped, errors: 0, total: rows.length, created, skipped };
}

export async function getTransactions(filters: {
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  category?: string;
  merchant?: string;
  type?: string;
  paidBy?: string;
  amountMin?: number;
  amountMax?: number;
  tag?: string;
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
  if (filters.tag) where.tags = { has: filters.tag };
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
    tags: row.tags,
    paidBy: row.paidBy as 'tung' | 'thuy' | 'other',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return { transactions, total, limit, offset };
}
