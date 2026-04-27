import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/services/transaction-service';
import { getAllExpenses, deleteExpense } from '@/lib/splitwise';
import { invalidateCache } from '@/lib/cache';

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

// Bulk delete all expenses in a date range.
// Requires both date_from and date_to to prevent accidental full wipes.
// Usage: DELETE /api/transactions?date_from=2026-04-01&date_to=2026-04-30
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

    const expenses = await getAllExpenses({ datedAfter: dateFrom, datedBefore: dateTo });
    const active = expenses.filter(e => !e.deleted_at);

    let deleted = 0;
    const failures: { id: number; description: string; error: string }[] = [];

    for (const exp of active) {
      try {
        await deleteExpense(exp.id);
        deleted++;
      } catch (err) {
        failures.push({
          id: exp.id,
          description: exp.description,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    invalidateCache('expenses:');

    return NextResponse.json({ deleted, failures, total: active.length });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk delete failed' },
      { status: 500 }
    );
  }
}
