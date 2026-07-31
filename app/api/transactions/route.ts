import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/services/transaction-service';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const paidByParam = searchParams.get('paid_by');
    const paidBy = paidByParam ? (paidByParam as 'tung' | 'thuy' | 'other') : undefined;

    const amountMinRaw = searchParams.get('amount_min');
    const amountMaxRaw = searchParams.get('amount_max');

    const result = await getTransactions({
      dateFrom: searchParams.get('date_from') || undefined,
      dateTo: searchParams.get('date_to') || undefined,
      account: searchParams.get('account') || undefined,
      category: searchParams.get('category') || undefined,
      merchant: searchParams.get('merchant') || undefined,
      type: searchParams.get('type') || undefined,
      paidBy,
      amountMin: amountMinRaw ? parseFloat(amountMinRaw) : undefined,
      amountMax: amountMaxRaw ? parseFloat(amountMaxRaw) : undefined,
      sortBy: searchParams.get('sort_by') || 'date',
      order: searchParams.get('order') || 'desc',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0,
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
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Both date_from and date_to are required' },
        { status: 400 }
      );
    }

    const result = await prisma.transaction.deleteMany({
      where: {
        date: {
          gte: new Date(dateFrom),
          lte: new Date(dateTo),
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
