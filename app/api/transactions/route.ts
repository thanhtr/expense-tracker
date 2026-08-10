import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/services/transaction-service';
import { prisma } from '@/lib/db';
import { transactionQuerySchema, bulkDeleteQuerySchema, parseQuery } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const parsed = parseQuery(transactionQuerySchema, new URL(request.url).searchParams);
  if ('error' in parsed) return parsed.error;
  const { date_from, date_to, account, category, merchant, type, paid_by,
    amount_min, amount_max, tag, sort_by, order, limit, offset } = parsed.data;

  try {
    const result = await getTransactions({
      dateFrom: date_from,
      dateTo: date_to,
      account,
      category,
      merchant,
      type,
      paidBy: paid_by,
      amountMin: amount_min,
      amountMax: amount_max,
      tag,
      sortBy: sort_by,
      order,
      limit,
      offset,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Transactions fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}

// Bulk delete all transactions in a date range.
// Requires both date_from and date_to to prevent accidental full wipes.
export async function DELETE(request: NextRequest) {
  try {
    const parsed = parseQuery(bulkDeleteQuerySchema, new URL(request.url).searchParams);
    if ('error' in parsed) return parsed.error;
    const { date_from, date_to } = parsed.data;

    const result = await prisma.transaction.deleteMany({
      where: {
        date: {
          gte: new Date(date_from),
          lte: new Date(date_to),
        },
      },
    });

    return NextResponse.json({ deleted: result.count, total: result.count, failures: [] });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk delete failed' },
      { status: 500 }
    );
  }
}
