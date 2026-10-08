import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/parsers', () => ({
  parseOPBank: vi.fn(),
  parseAmex: vi.fn(),
  parseFinnair: vi.fn(),
  parseGeneric: vi.fn(),
  detectBank: vi.fn(),
}));
vi.mock('@/lib/categorizer', () => ({
  categorizeWithLearning: vi.fn(async (rows: unknown[]) => rows),
}));
vi.mock('@/lib/services/transaction-service', () => ({
  upsertTransactions: vi.fn(),
}));
vi.mock('@/lib/services/income-rules-service', () => ({
  getIncomeRules: vi.fn(async () => []),
  matchesAnyIncomeRule: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    transaction: {
      findMany: vi.fn(async () => []),
    },
  },
}));

import { processUpload } from '@/lib/services/upload-service';
import { parseOPBank, detectBank } from '@/lib/parsers';
import { categorizeWithLearning } from '@/lib/categorizer';
import { upsertTransactions } from '@/lib/services/transaction-service';
import { revalidateTag } from 'next/cache';
import { getIncomeRules, matchesAnyIncomeRule } from '@/lib/services/income-rules-service';
import { prisma } from '@/lib/db';
import type { ParsedTransaction } from '@/lib/types';

function makeRow(overrides: Partial<ParsedTransaction> = {}): ParsedTransaction {
  return {
    date: new Date('2026-04-10'),
    account: 'OP',
    merchant: 'Test Merchant',
    amount: -45.67,
    note: '',
    type: 'Expense',
    category: 'Shopping',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(categorizeWithLearning).mockImplementation(async (rows) => rows);
  vi.mocked(getIncomeRules).mockResolvedValue([]);
  vi.mocked(matchesAnyIncomeRule).mockReturnValue(false);
});

describe('processUpload', () => {
  it('throws when no rows are parsed from the CSV', async () => {
    vi.mocked(parseOPBank).mockResolvedValueOnce([]);
    await expect(processUpload('csv', 'op', 'tung')).rejects.toThrow(/No expense transactions found/);
  });

  it('throws when the bank type cannot be detected', async () => {
    vi.mocked(detectBank).mockReturnValueOnce(null);
    await expect(processUpload('csv', 'auto', 'tung')).rejects.toThrow(/Could not detect bank type/);
  });

  it('reclassifies an Income row that matches no income rule as a reimbursement Expense', async () => {
    const incomeRow = makeRow({ type: 'Income', amount: 30, merchant: 'Friend Mobilepay' });
    vi.mocked(parseOPBank).mockResolvedValueOnce([incomeRow]);
    vi.mocked(matchesAnyIncomeRule).mockReturnValue(false);
    vi.mocked(upsertTransactions).mockResolvedValueOnce({ imported: 1, duplicates: 0, errors: 0, total: 1, created: 1, skipped: 0 } as never);

    await processUpload('csv', 'op', 'tung');

    const passedRows = vi.mocked(upsertTransactions).mock.calls[0]![0];
    expect(passedRows[0]!.type).toBe('Expense');
  });

  it('keeps an Income row that matches an income rule as Income', async () => {
    const incomeRow = makeRow({ type: 'Income', amount: 3000, merchant: 'Employer Palkka' });
    vi.mocked(parseOPBank).mockResolvedValueOnce([incomeRow]);
    vi.mocked(matchesAnyIncomeRule).mockReturnValue(true);
    vi.mocked(upsertTransactions).mockResolvedValueOnce({ imported: 1, duplicates: 0, errors: 0, total: 1, created: 1, skipped: 0 } as never);

    await processUpload('csv', 'op', 'tung');

    const passedRows = vi.mocked(upsertTransactions).mock.calls[0]![0];
    expect(passedRows[0]!.type).toBe('Income');
  });

  it('a dry run never calls upsertTransactions or invalidates the cache', async () => {
    vi.mocked(parseOPBank).mockResolvedValueOnce([makeRow()]);

    const result = await processUpload('csv', 'op', 'tung', true) as { dry_run: boolean; would_create: number };

    expect(result.dry_run).toBe(true);
    expect(result.would_create).toBe(1);
    expect(upsertTransactions).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('a dry run marks a row as skip when its dedup key already exists', async () => {
    vi.mocked(parseOPBank).mockResolvedValueOnce([makeRow({ date: new Date('2026-04-10'), account: 'OP', merchant: 'Test Merchant', amount: -45.67 })]);
    vi.mocked(prisma.transaction.findMany).mockResolvedValueOnce([{ dedupKey: '2026-04-10|OP|Test Merchant|-45.67' }] as never);

    const result = await processUpload('csv', 'op', 'tung', true) as { would_create: number; would_skip: number };

    expect(result.would_create).toBe(0);
    expect(result.would_skip).toBe(1);
  });

  it('a non-dry-run upload calls upsertTransactions and invalidates the dashboard cache', async () => {
    vi.mocked(parseOPBank).mockResolvedValueOnce([makeRow()]);
    vi.mocked(upsertTransactions).mockResolvedValueOnce({ imported: 1, duplicates: 0, errors: 0, total: 1, created: 1, skipped: 0 } as never);

    const result = await processUpload('csv', 'op', 'tung', false) as { detectedBank: string; created: number };

    expect(upsertTransactions).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith('data', { expire: 0 });
    expect(result.detectedBank).toBe('op');
    expect(result.created).toBe(1);
  });

  it('throws for the generic parser when no column mapping is provided', async () => {
    await expect(processUpload('csv', 'generic', 'tung')).rejects.toThrow(/Column mapping required/);
  });
});
