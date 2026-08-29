import { parseOPBank, parseAmex, parseFinnair, parseGeneric, detectBank } from '@/lib/parsers';
import type { ColumnMapping } from '@/lib/parsers';
import { categorizeWithLearning } from '@/lib/categorizer';
import { upsertTransactions } from '@/lib/services/transaction-service';
import { invalidateDashboardCache } from '@/lib/services/aggregation-service';
import { prisma } from '@/lib/db';
import { ParsedTransaction } from '@/lib/types';

function makeDedupKey(date: string, account: string, merchant: string, cost: string): string {
  return `${date}|${account}|${merchant}|${cost}`;
}

async function runDryRun(rows: ParsedTransaction[]) {
  if (rows.length === 0) {
    return { dry_run: true, would_create: 0, would_skip: 0, total: 0, transactions: [] };
  }

  const seenCount = new Map<string, number>();
  const candidates = rows.map(row => {
    const dateStr = row.date.toISOString().slice(0, 10);
    const cost = Math.abs(row.amount).toFixed(2);
    const baseKey = makeDedupKey(dateStr, row.account, row.merchant, cost);
    const seen = seenCount.get(baseKey) ?? 0;
    seenCount.set(baseKey, seen + 1);
    const dedupKey = seen === 0 ? baseKey : `${baseKey}|${seen}`;
    return { row, dedupKey, dateStr };
  });

  const allKeys = candidates.map(c => c.dedupKey);
  const existing = await prisma.transaction.findMany({
    where: { dedupKey: { in: allKeys } },
    select: { dedupKey: true },
  });
  const existingSet = new Set(existing.map(e => e.dedupKey));

  const transactions = candidates.map(({ row, dedupKey, dateStr }) => ({
    date: dateStr,
    merchant: row.merchant,
    amount: row.amount,
    category: row.category || '',
    type: row.type,
    account: row.account,
    status: existingSet.has(dedupKey) ? 'skip' : 'create',
  }));

  return {
    dry_run: true,
    would_create: transactions.filter(t => t.status === 'create').length,
    would_skip: transactions.filter(t => t.status === 'skip').length,
    total: rows.length,
    transactions,
  };
}

export async function processUpload(
  fileContent: string,
  accountType: string,
  accountOwner: string,
  isDryRun = false,
  columnMapping?: ColumnMapping,
) {
  const detected = (accountType === 'auto' || !accountType)
    ? detectBank(fileContent)
    : accountType;

  if (!detected) {
    throw new Error('Could not detect bank type from CSV header. Please select the bank manually.');
  }

  let rows;
  switch (detected) {
    case 'op':      rows = await parseOPBank(fileContent); break;
    case 'amex':    rows = await parseAmex(fileContent); break;
    case 'finnair': rows = await parseFinnair(fileContent); break;
    case 'generic':
      if (!columnMapping) throw new Error('Column mapping required for generic parser');
      rows = await parseGeneric(fileContent, columnMapping);
      break;
    default:
      throw new Error(`Unknown bank type: ${detected}`);
  }

  if (rows.length === 0) {
    throw new Error(`No expense transactions found in ${detected.toUpperCase()} CSV. Verify the file is not empty and contains the expected columns.`);
  }

  rows = await categorizeWithLearning(rows);

  if (isDryRun) {
    return { ...(await runDryRun(rows)), detectedBank: detected };
  }

  const result = await upsertTransactions(rows, accountOwner);
  invalidateDashboardCache();
  return { ...result, detectedBank: detected };
}
