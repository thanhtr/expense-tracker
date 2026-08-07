import { NextRequest, NextResponse } from 'next/server';
import { getTransactions } from '@/lib/services/transaction-service';
import { exportQuerySchema, parseQuery } from '@/lib/validation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';
  const first = data[0];
  if (!first) return '';
  const headers = Object.keys(first);
  const rows = data.map(obj =>
    headers.map(header => {
      const value = obj[header];
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export async function GET(request: NextRequest) {
  const parsed = parseQuery(exportQuerySchema, new URL(request.url).searchParams);
  if ('error' in parsed) return parsed.error;
  const { date_from, date_to, account, category, merchant, type, paid_by } = parsed.data;

  try {
    const result = await getTransactions({
      dateFrom: date_from,
      dateTo: date_to,
      account,
      category,
      merchant,
      type,
      paidBy: paid_by,
      limit: 10000,
      offset: 0,
    });

    const csv = convertToCSV(result.transactions.map(t => ({
      date: t.date.toISOString().slice(0, 10),
      account: t.account,
      merchant: t.merchant,
      amount: t.amount.toString(),
      type: t.type,
      category: t.category,
      paidBy: t.paidBy === 'tung' ? 'Tung' : t.paidBy === 'thuy' ? 'Thuy' : 'Other',
      note: t.note,
    })));

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="transactions.csv"',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Failed to export transactions' }, { status: 500 });
  }
}
