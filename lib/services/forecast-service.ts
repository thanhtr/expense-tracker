import { prisma } from '@/lib/db';

const HISTORY_MONTHS = 6;
const EMA_ALPHA = 0.3;

export interface CategoryForecast {
  category: string;
  lastMonthActual: number;
  forecast: number;
  trend: 'up' | 'down' | 'stable';
}

export interface ForecastResult {
  nextMonthTotal: number;
  byCategory: CategoryForecast[];
  basedOnMonths: number;
  forecastMonth: string;
}

const _cache = new Map<string, { data: ForecastResult; expiry: number }>();
const CACHE_TTL_MS = 24 * 3600 * 1000;

function ema(values: number[], alpha: number = EMA_ALPHA): number {
  if (values.length === 0) return 0;
  let smoothed = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    smoothed = alpha * (values[i] ?? 0) + (1 - alpha) * smoothed;
  }
  return smoothed;
}

function getTrend(forecast: number, lastActual: number): 'up' | 'down' | 'stable' {
  if (lastActual === 0) return 'stable';
  const pct = (forecast - lastActual) / lastActual;
  if (pct > 0.05) return 'up';
  if (pct < -0.05) return 'down';
  return 'stable';
}

export async function forecastNextMonth(): Promise<ForecastResult> {
  const now = new Date();

  const forecastMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 7);

  const historyStart = new Date(now.getFullYear(), now.getMonth() - HISTORY_MONTHS, 1);
  const historyEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  const cacheKey = `forecast:${historyStart.toISOString().slice(0, 7)}`;
  const cached = _cache.get(cacheKey);
  if (cached && Date.now() < cached.expiry) return cached.data;

  // Build ordered list of complete months in the window
  const months: string[] = [];
  for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    months.push(d.toISOString().slice(0, 7));
  }

  const rows = await prisma.transaction.findMany({
    where: {
      type: 'Expense',
      date: { gte: historyStart, lte: historyEnd },
      category: { not: '' },
    },
    select: { date: true, category: true, amount: true },
  });

  // Aggregate: month → category → total spend
  const byMonthCategory: Record<string, Record<string, number>> = {};
  for (const row of rows) {
    const month = row.date.toISOString().slice(0, 7);
    const cat = row.category;
    if (!byMonthCategory[month]) byMonthCategory[month] = {};
    byMonthCategory[month][cat] = (byMonthCategory[month][cat] ?? 0) + Math.abs(row.amount);
  }

  const allCategories = new Set<string>();
  for (const cats of Object.values(byMonthCategory)) {
    for (const cat of Object.keys(cats)) allCategories.add(cat);
  }

  const categoryForecasts: CategoryForecast[] = [];
  for (const category of allCategories) {
    const series = months.map(m => byMonthCategory[m]?.[category] ?? 0);
    const lastActual = series[series.length - 1] ?? 0;
    const forecastVal = Math.max(0, ema(series));

    categoryForecasts.push({
      category,
      lastMonthActual: lastActual,
      forecast: forecastVal,
      trend: getTrend(forecastVal, lastActual),
    });
  }

  categoryForecasts.sort((a, b) => b.forecast - a.forecast);

  const result: ForecastResult = {
    nextMonthTotal: categoryForecasts.reduce((s, c) => s + c.forecast, 0),
    byCategory: categoryForecasts,
    basedOnMonths: months.filter(m => byMonthCategory[m]).length,
    forecastMonth,
  };

  _cache.set(cacheKey, { data: result, expiry: Date.now() + CACHE_TTL_MS });
  return result;
}
