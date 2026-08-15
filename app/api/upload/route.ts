import { NextRequest, NextResponse } from 'next/server';
import { parseOPBank, parseAmex, parseFinnair } from '@/lib/parsers';
import { categorizeWithLearning } from '@/lib/categorizer';
import { upsertTransactions } from '@/lib/services/transaction-service';
import { invalidateDashboardCache } from '@/lib/services/aggregation-service';
import { prisma } from '@/lib/db';
import { ParsedTransaction } from '@/lib/types';
import { requireToken } from '@/lib/api-auth';

function makeDedupKey(date: string, account: string, merchant: string, cost: string): string {
  return `${date}|${account}|${merchant}|${cost}`;
}

async function dryRun(rows: ParsedTransaction[], accountOwner: string) {
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

  const would_create = transactions.filter(t => t.status === 'create').length;
  const would_skip = transactions.filter(t => t.status === 'skip').length;

  return { dry_run: true, would_create, would_skip, total: rows.length, transactions };
}

export async function POST(request: NextRequest) {
  const unauthorized = requireToken(request);
  if (unauthorized) return unauthorized;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const accountType = formData.get('account_type') as string;
    const accountOwner = (formData.get('account_owner') as string) || 'tung';
    const isDryRun = formData.get('dry_run') === 'true';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum allowed size is 10 MB.' },
        { status: 413 }
      );
    }

    const fileContent = await file.text();

    let rows;
    switch (accountType) {
      case 'op':
        rows = await parseOPBank(fileContent);
        break;
      case 'amex':
        rows = await parseAmex(fileContent);
        break;
      case 'finnair':
        rows = await parseFinnair(fileContent);
        break;
      default:
        return NextResponse.json({ error: 'Invalid account type' }, { status: 400 });
    }

    rows = await categorizeWithLearning(rows);

    if (isDryRun) {
      return NextResponse.json(await dryRun(rows, accountOwner));
    }

    const result = await upsertTransactions(rows, accountOwner);
    invalidateDashboardCache();

    return NextResponse.json({
      created: result.created,
      skipped: result.skipped,
      errors: result.errors,
      total: result.total,
      message: result.total === 0
        ? 'No transactions found in file. Check format and column names.'
        : `Successfully processed ${result.total} transactions`,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to process upload';
    console.error('❌ Upload error:', error);
    return NextResponse.json(
      {
        error: errorMsg,
        debug: {
          message: 'Check server logs at /api/health for configuration issues',
        }
      },
      { status: 500 }
    );
  }
}
