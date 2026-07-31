import { NextRequest, NextResponse } from 'next/server';
import { parseOPBank, parseAmex, parseFinnair } from '@/lib/parsers';
import { categorizeWithLearning } from '@/lib/categorizer';
import { upsertTransactions } from '@/lib/services/transaction-service';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const accountType = formData.get('account_type') as string;
    const accountOwner = (formData.get('account_owner') as string) || 'tung';

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

    // Parse based on account type
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

    // Categorize transactions (using learned rules + CSV keywords)
    rows = await categorizeWithLearning(rows);

    // Filter to expenses only
    rows = rows.filter(r => r.type === 'Expense');

    // Create in Splitwise
    const result = await upsertTransactions(rows, accountOwner);

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
