/**
 * Tier-1 expense forecasting using Exponential Moving Average (EMA).
 *
 * Fetches the last HISTORY_MONTHS calendar months of Splitwise expenses,
 * groups them by month and category, then applies EMA (α=0.3) to each
 * per-category time series to predict next-month spending.
 *
 * Results are cached for 24 h — the forecast only needs to update once a day.
 */

import { getAllExpenses, parseExpenseDetails } from '@/lib/splitwise';
import { withCache } from '@/lib/cache';

const HISTORY_MONTHS = 6;
const EMA_ALPHA = 0.3; // weight for the most-recent observation

export interface CategoryForecast {
  category: string;
  lastMonthActual: number; // actual spend in the most recent complete month
  forecast: number;        // EMA prediction for next month
  trend: 'up' | 'down' | 'stable';
}

export interface ForecastResult {
  nextMonthTotal: number;
  byCategory: CategoryForecast[];
  basedOnMonths: number; // how many months had any data
  forecastMonth: string; // YYYY-MM of the predicted month
}

/**
 * Exponential smoothing over a time-ordered array of values.
 * Returns the predicted next value (the smoothed state after the last observation).
 */
function ema(values: number[], alpha: number = EMA_ALPHA): number {
  if (values.length === 0) return 0;
  let smoothed = values[0];
  for (let i = 1; i < values.length; i++) {
    smoothed = alpha * values[i] + (1 - alpha) * smoothed;
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

  // Predicted month = next calendar month
  const forecastMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    .toISOString()
    .slice(0, 7);

  // History window: HISTORY_MONTHS complete months ending last month
  const historyStart = new Date(now.getFullYear(), now.getMonth() - HISTORY_MONTHS, 1);
  const historyEnd = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month

  const datedAfter = historyStart.toISOString().split('T')[0];
  const datedBefore = historyEnd.toISOString().split('T')[0];

  const cacheKey = `forecast:${datedAfter}:${datedBefore}`;

  return withCache(cacheKey, 24 * 3600, async (): Promise<ForecastResult> => {
    const expenses = await getAllExpenses({ datedAfter, datedBefore });

    // Build the ordered list of months in the window
    const months: string[] = [];
    for (let i = HISTORY_MONTHS - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }

    // Aggregate: month → category → total spend
    const byMonthCategory: Record<string, Record<string, number>> = {};
    for (const exp of expenses) {
      if (exp.deleted_at) continue;
      if (!(parseFloat(exp.cost) > 0)) continue; // skip income / zero-cost

      const details = parseExpenseDetails(exp.details);
      const category = details.category || exp.category?.name || '⚠ Uncategorized';
      const month = exp.date.slice(0, 7); // YYYY-MM

      if (!byMonthCategory[month]) byMonthCategory[month] = {};
      byMonthCategory[month][category] =
        (byMonthCategory[month][category] || 0) + parseFloat(exp.cost);
    }

    // Collect all categories that appeared in any month
    const allCategories = new Set<string>();
    for (const cats of Object.values(byMonthCategory)) {
      for (const cat of Object.keys(cats)) allCategories.add(cat);
    }

    // Per-category EMA forecast
    const categoryForecasts: CategoryForecast[] = [];
    for (const category of allCategories) {
      const series = months.map(m => byMonthCategory[m]?.[category] ?? 0);
      const lastActual = series[series.length - 1]; // most recent complete month
      const forecast = Math.max(0, ema(series));    // clamp to non-negative

      categoryForecasts.push({
        category,
        lastMonthActual: lastActual,
        forecast,
        trend: getTrend(forecast, lastActual),
      });
    }

    categoryForecasts.sort((a, b) => b.forecast - a.forecast);

    return {
      nextMonthTotal: categoryForecasts.reduce((s, c) => s + c.forecast, 0),
      byCategory: categoryForecasts,
      basedOnMonths: months.filter(m => byMonthCategory[m]).length,
      forecastMonth,
    };
  });
}
