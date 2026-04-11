import { NextRequest, NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/services/aggregation-service';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const dateFrom = searchParams.get('date_from')
      ? new Date(searchParams.get('date_from')!)
      : undefined;
    const dateTo = searchParams.get('date_to')
      ? new Date(searchParams.get('date_to')!)
      : undefined;
    const category = searchParams.get('category') ?? undefined;

    const stats = await getDashboardStats(dateFrom, dateTo, category);

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
