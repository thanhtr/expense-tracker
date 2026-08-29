import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/services/aggregation-service';
import { dashboardQuerySchema, parseQuery } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const parsed = parseQuery(dashboardQuerySchema, new URL(request.url).searchParams);
  if ('error' in parsed) return parsed.error;
  const { date_from, date_to, category, paid_by, account, refresh } = parsed.data;

  try {
    const stats = await getDashboardStats(
      date_from ? new Date(date_from) : undefined,
      date_to ? new Date(date_to) : undefined,
      category,
      paid_by,
      account,
      refresh === '1',
    );
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 });
  }
}
