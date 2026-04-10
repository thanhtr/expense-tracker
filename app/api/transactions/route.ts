import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/services/transaction-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const paidByParam = searchParams.get('paid_by');
    const paidBy = paidByParam ? (paidByParam as 'tung' | 'thuy' | 'other') : undefined;

    const result = await getTransactions({
      dateFrom: searchParams.get('date_from') || undefined,
      dateTo: searchParams.get('date_to') || undefined,
      account: searchParams.get('account') || undefined,
      category: searchParams.get('category') || undefined,
      merchant: searchParams.get('merchant') || undefined,
      type: searchParams.get('type') || undefined,
      paidBy,
      sortBy: searchParams.get('sort_by') || 'date',
      order: searchParams.get('order') || 'desc',
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Transactions fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}
