import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/cache-tags';
import { getDashboardStats } from '@/lib/services/aggregation-service';
import { dashboardQuerySchema, parseQuery, splitCommaParam } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const parsed = parseQuery(dashboardQuerySchema, new URL(request.url).searchParams);
  if ('error' in parsed) return parsed.error;
  const { date_from, date_to, category, paid_by, account, refresh } = parsed.data;
  const accounts = splitCommaParam(account);
  const categories = splitCommaParam(category);

  try {
    // `revalidateTag` is only callable from a plain route-handler/action context, never from
    // inside an `unstable_cache`-wrapped function (Next throws if it is) — handled here, at the
    // top-level route, rather than threaded into `getDashboardStats` itself, since several other
    // call sites now call `getDashboardStats` from within their own `unstable_cache` wrapper
    // (fetchMoneyCapacity, fetchPortfolioData, forecastNextMonth) and would crash if a
    // force-refresh flag were ever threaded through one of those composed paths instead.
    if (refresh === '1') revalidateTag('data');
    const stats = await getDashboardStats(
      date_from ? new Date(date_from) : undefined,
      date_to ? new Date(date_to) : undefined,
      categories,
      paid_by,
      accounts,
    );
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 });
  }
}
