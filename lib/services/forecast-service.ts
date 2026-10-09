import { unstable_cache } from 'next/cache';
import { getDashboardStats } from './aggregation-service';
import { mulberry32, percentile, monthString, shiftMonth } from './stats';
import { resolveCompletedMonthsWindow } from './completed-months-window';

const MIN_HISTORY_MONTHS = 3;
const MAX_HISTORY_MONTHS = 12;
const TRIALS = 1000;
const SEED = 20261006;

export interface ForecastBand {
  p10: number;
  p50: number;
  p90: number;
}

export interface CategoryForecast extends ForecastBand {
  category: string;
  // How many of the history months this category actually had spend in — a category
  // present in few months gets a wide, low p50 band (the bootstrap draws €0 most of
  // the time), and this count is shown alongside it so the UI can flag it explicitly
  // rather than relying on the reader to infer confidence from the band width alone.
  monthsWithData: number;
}

export interface ForecastResult {
  forecastMonth: string;
  basedOnMonths: number;
  trials: number;
  total: ForecastBand;
  byCategory: CategoryForecast[];
  minHistoryMonths: number;
}

export interface InsufficientForecastData {
  insufficientData: true;
  monthsAvailable: number;
  minHistoryMonths: number;
}

// Forecasts next month's spending via a block bootstrap: resamples whole historical
// months (with replacement) rather than resampling each category independently, so
// cross-category correlation within a month (e.g. a trip month spiking both Travel and
// Dining) is preserved, and a category that's only occasionally used (e.g. Electronics)
// naturally gets a wide, low-median band instead of a falsely precise point estimate —
// most resampled months show €0 for it, a minority show the real spike.
//
// Deliberately not a parametric model (unlike fire-monte-carlo.ts's lognormal return
// draws): with only a handful of history months per category, there's nothing to fit a
// distribution to, and intermittent categories don't have a sensible "distribution"
// shape to begin with. Resampling observed months directly sidesteps that.
//
// Window is a rolling 12 months if there's at least that much history, otherwise as far
// back as the data actually goes.
// `monthKey` is unused inside the body — it exists purely so unstable_cache's argument-based
// cache key changes when the calendar month rolls over, since the function otherwise computes
// `now` internally rather than taking it as an argument (which would freeze the cached result at
// whatever month it was first computed in, with 'data' invalidation as the only way out).
async function forecastNextMonthUncached(
  trials: number,
  seed: number,
  monthKey: string,
): Promise<ForecastResult | InsufficientForecastData> {
  void monthKey;
  // Known, accepted limitation: this function is itself wrapped in unstable_cache below, and
  // Next's unstable_cache deliberately bypasses its *own* cache layer for calls made from inside
  // another unstable_cache-wrapped function — so resolveCompletedMonthsWindow/getDashboardStats
  // below always recompute fresh rather than potentially reusing a recent identical-args cache
  // hit, every time this function's own cache needs to recompute (a cold cache or after a 'data'
  // invalidation, not on every request).
  const { windowStart: historyStartDate, windowEnd: historyEndDate, months } =
    await resolveCompletedMonthsWindow(MAX_HISTORY_MONTHS, { emptyHistoryFallback: 'single-month' });
  const historyEnd = monthString(historyEndDate);

  if (months.length < MIN_HISTORY_MONTHS) {
    return { insufficientData: true, monthsAvailable: months.length, minHistoryMonths: MIN_HISTORY_MONTHS };
  }

  const stats = await getDashboardStats(historyStartDate, historyEndDate);

  const totalByMonth = new Map(stats.byMonth.map(m => [m.month, m.amount]));
  const categoryByMonth = new Map(stats.byCategoryMonth.map(row => [String(row.month), row]));

  const categories = new Set<string>();
  for (const row of stats.byCategoryMonth) {
    for (const key of Object.keys(row)) {
      if (key !== 'month') categories.add(key);
    }
  }

  const monthsWithData = new Map<string, number>();
  for (const cat of categories) {
    let count = 0;
    for (const m of months) {
      const row = categoryByMonth.get(m);
      if (row && Number(row[cat]) > 0) count++;
    }
    monthsWithData.set(cat, count);
  }

  const rng = mulberry32(seed);
  const totalDraws: number[] = [];
  const categoryDraws = new Map<string, number[]>();
  for (const cat of categories) categoryDraws.set(cat, []);

  for (let t = 0; t < trials; t++) {
    const m = months[Math.floor(rng() * months.length)]!;
    // Clamp at 0: a linked reimbursement can net a month/category negative (see
    // aggregation-service.ts's byMonth/byCategoryMonth comments), and a negative draw
    // would show as a nonsensical negative "likely spend" band.
    totalDraws.push(Math.max(0, totalByMonth.get(m) ?? 0));
    const row = categoryByMonth.get(m);
    for (const cat of categories) {
      categoryDraws.get(cat)!.push(row ? Math.max(0, Number(row[cat]) || 0) : 0);
    }
  }

  const band = (draws: number[]): ForecastBand => {
    const sorted = [...draws].sort((a, b) => a - b);
    return { p10: percentile(sorted, 0.10), p50: percentile(sorted, 0.50), p90: percentile(sorted, 0.90) };
  };

  const byCategory: CategoryForecast[] = [...categories]
    .map(cat => ({ category: cat, monthsWithData: monthsWithData.get(cat) ?? 0, ...band(categoryDraws.get(cat)!) }))
    .sort((a, b) => b.p50 - a.p50);

  return {
    forecastMonth: shiftMonth(historyEnd, 1),
    basedOnMonths: months.length,
    trials,
    total: band(totalDraws),
    byCategory,
    minHistoryMonths: MIN_HISTORY_MONTHS,
  };
}

const forecastNextMonthCached = unstable_cache(
  forecastNextMonthUncached,
  ['forecast-next-month'],
  { tags: ['data'], revalidate: false },
);

export async function forecastNextMonth(
  trials = TRIALS,
  seed = SEED,
): Promise<ForecastResult | InsufficientForecastData> {
  return forecastNextMonthCached(trials, seed, monthString(new Date()));
}
