import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/services/transaction-service';

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(obj =>
    headers.map(header => {
      const value = obj[header];
      // Escape CSV values
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

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
      limit: 10000, // Get all matching records
      offset: 0
    });

    const csv = convertToCSV(result.transactions.map(t => ({
      date: t.date.toISOString().split('T')[0],
      account: t.account,
      merchant: t.merchant,
      amount: t.amount.toString(),
      type: t.type,
      category: t.category,
      paidBy: t.paidBy === 'tung' ? 'Tung' : t.paidBy === 'thuy' ? 'Thuy' : 'Other',
      note: t.note
    })));

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="transactions.csv"'
      }
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export transactions' },
      { status: 500 }
    );
  }
}
