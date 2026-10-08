// Attaches Avios-only, DB-backed extras (the sourced-rate strategy and the real-cash
// affordability plan) to goals already enriched with `progress`. Kept separate from
// points-goal-service.ts so that file can stay a pure function with no DB dependency.

import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { getDashboardStats, getEarliestTransactionDate } from './aggregation-service';
import { FIRE_DEFAULTS } from './fire-service';
import { deriveMoneyCapacity, type MoneyCapacity } from './money-capacity-service';
import { monthString, monthRange } from './stats';
import { LIQUID_ASSET_TYPES } from '@/lib/constants';
import { SUBSCRIPTION_EUR_PER_AVIOS, type FinnairTier } from '@/lib/avios-facts';
import { withProgress, POINTS_GOAL_INCLUDE, type PointsGoalInput, type PointsGoalProgress } from './points-goal-service';
import { computeAviosStrategy, type AviosStrategyResult } from './avios-strategy';
import { computeCashPlan, type CashPlanFlightInput, type CashPlanResult } from './cash-plan-service';
import {
  computeAviosEarnReconciliation,
  type AviosEarnReconciliation,
  type CardEarnRuleInput,
  type CardTransactionInput,
} from './avios-earn-service';

const CAPACITY_WINDOW_MONTHS = 12;
const CARD_ACCOUNTS = ['Amex', 'Finnair Visa'] as const;

type GoalWithProgress<T> = T & { progress: PointsGoalProgress };
type EnrichedGoal<T> = GoalWithProgress<T> & {
  strategy?: AviosStrategyResult;
  cashPlan?: CashPlanResult;
  earnReconciliation?: AviosEarnReconciliation;
  tierPointsReconciliation?: Pick<
    AviosEarnReconciliation,
    'qualifyingTierPointMonths' | 'monthsInWindow' | 'expectedTierPoints'
  >;
};

interface CompletedMonthsWindow {
  windowStart: Date;
  windowEnd: Date;
  months: string[];
}

/** Resolves a rolling N-completed-calendar-months window (never a partial current month),
 * clamped to the earliest transaction actually in the DB — same guard fetchMoneyCapacity needs
 * for a fresh/empty database (see the code-review fix in PROJECT_SUMMARY.md, "Can I afford it?
 * rebuilt..."): null's fallback month would otherwise equal windowEndMonth, always later than
 * rollingStart, which would pass a null Date into a Prisma `gte` filter. */
async function resolveCompletedMonthsWindow(windowMonths: number): Promise<CompletedMonthsWindow> {
  const now = new Date();
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999); // last day of previous month
  const windowEndMonth = monthString(windowEnd);

  const rollingStart = new Date(windowEnd.getFullYear(), windowEnd.getMonth(), 1);
  rollingStart.setMonth(rollingStart.getMonth() - (windowMonths - 1));

  const earliestDataDate = await getEarliestTransactionDate();
  const earliestDataMonth = earliestDataDate ? monthString(earliestDataDate) : null;
  const dataStartsLater = earliestDataMonth !== null && earliestDataMonth > monthString(rollingStart);
  const windowStart = dataStartsLater ? earliestDataDate! : rollingStart;

  const months = monthRange(dataStartsLater ? earliestDataMonth! : monthString(rollingStart), windowEndMonth);

  return { windowStart, windowEnd, months };
}

// One Investments-category total per month in `months` (zero-filled), used so
// money-capacity-service.ts can take the *median* rather than the window total — a one-off lump
// funded from existing savings shouldn't skew the "regular investing" baseline.
async function fetchMonthlyInvestments(start: Date, end: Date, months: string[]): Promise<number[]> {
  const rows = await prisma.transaction.findMany({
    where: { type: 'Expense', category: 'Investments', date: { gte: start, lte: end } },
    select: { date: true, amount: true },
  });
  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const m = monthString(row.date);
    byMonth.set(m, (byMonth.get(m) ?? 0) + Math.abs(row.amount));
  }
  return months.map((m) => byMonth.get(m) ?? 0);
}

// Entirely derived from real data — never from a manually-maintained goal. SavingsGoal/GoalsCard
// were retired (PR #98) and are not read here.
//
// Window is completed calendar months only (never a partial current month), a rolling 12 if that
// much history exists, otherwise as far back as the data actually goes — same pattern
// forecast-service.ts uses, for the same reason (pre-2026 data was deleted; dividing by a fixed
// 12 would understate the real monthly average).
// Known, accepted limitation: this function is itself wrapped in unstable_cache below, and
// Next's unstable_cache deliberately bypasses its *own* cache layer for calls made from inside
// another unstable_cache-wrapped function — so this getDashboardStats call always recomputes
// fresh rather than potentially reusing a recent identical-args cache hit, every time this
// function's own cache needs to recompute (i.e. only on a cold cache or after a 'data'/
// 'readings'/'config' invalidation, not on every request). Not worth restructuring to avoid
// (would mean pre-fetching dashboard stats outside this cache boundary and threading the result
// through as a plain argument) given how infrequently this path actually recomputes.
async function fetchMoneyCapacityUncached(window: CompletedMonthsWindow): Promise<MoneyCapacity> {
  const { windowStart, windowEnd, months } = window;

  const [stats, monthlyInvestments, bankAssets, liquidAssets, fireConfig] = await Promise.all([
    getDashboardStats(windowStart, windowEnd),
    fetchMonthlyInvestments(windowStart, windowEnd, months),
    prisma.asset.findMany({ where: { type: 'bank' } }),
    prisma.asset.findMany({ where: { type: { in: Array.from(LIQUID_ASSET_TYPES) } } }),
    prisma.fireConfig.findUnique({ where: { id: 1 } }),
  ]);

  const bankTotal = bankAssets.reduce((sum, a) => sum + a.balance, 0);
  const liquidAssetTotal = liquidAssets.reduce((sum, a) => sum + a.balance, 0);
  const avgMonthlyIncome = stats.totalIncome / Math.max(1, months.length);
  const emergencyFundMonths = fireConfig?.emergencyFundMonths ?? FIRE_DEFAULTS.emergencyFundMonths;

  return deriveMoneyCapacity({
    netOverWindow: stats.net,
    monthCount: months.length,
    monthlyInvestments,
    bankTotal,
    liquidAssetTotal,
    avgMonthlyIncome,
    emergencyFundMonths,
  });
}

// 'data' (transactions, via getDashboardStats/fetchMonthlyInvestments), 'readings' (Asset rows),
// 'config' (FireConfig.emergencyFundMonths).
const fetchMoneyCapacity = unstable_cache(
  fetchMoneyCapacityUncached,
  ['points-goal-money-capacity'],
  { tags: ['data', 'readings', 'config'], revalidate: false },
);

// Raw Amex + Finnair Visa outflow rows in the window, classified by avios-earn-service.ts's pure
// classifyTransaction against the user-maintained CardEarnRule rules. `take` capped the same way
// as the structurally identical incomeRows/reimbRows queries in aggregation-service.ts.
async function fetchCardTransactionsUncached(start: Date, end: Date): Promise<CardTransactionInput[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      account: { in: Array.from(CARD_ACCOUNTS) },
      type: 'Expense',
      amount: { lt: 0 },
      date: { gte: start, lte: end },
    },
    select: { account: true, merchant: true, amount: true, date: true },
    take: 10_000,
  });
  return rows;
}

const fetchCardTransactions = unstable_cache(
  fetchCardTransactionsUncached,
  ['points-goal-card-transactions'],
  { tags: ['data'], revalidate: false },
);

async function fetchCardEarnRulesUncached(): Promise<CardEarnRuleInput[]> {
  const rows = await prisma.cardEarnRule.findMany({ orderBy: { id: 'asc' } });
  return rows as CardEarnRuleInput[];
}

const fetchCardEarnRules = unstable_cache(
  fetchCardEarnRulesUncached,
  ['points-goal-card-earn-rules'],
  { tags: ['config'], revalidate: false },
);

async function fetchFinnairPlusTierUncached(): Promise<FinnairTier> {
  const row = await prisma.finnairPlusTier.findUnique({ where: { id: 1 } });
  return (row?.tier as FinnairTier | undefined) ?? 'basic';
}

const fetchFinnairPlusTier = unstable_cache(
  fetchFinnairPlusTierUncached,
  ['points-goal-finnair-tier'],
  { tags: ['config'], revalidate: false },
);

/** Builds one shared cash plan across every Avios-unit goal's planned flights (merged and sorted
 * by neededBy, so they all compete for the same discretionary pool/buffer instead of each goal
 * assuming it alone owns the full capacity), then splits the per-flight results back out by id. */
function buildSharedCashPlan(
  aviosGoals: GoalWithProgress<PointsGoalInput>[],
  capacity: MoneyCapacity,
): Map<number, CashPlanResult['flights'][number]> {
  // f.shortfallAtDate/remainingCumulative are cumulative across every earlier (by neededBy)
  // flight *within that flight's own goal* (points-goal-service.ts computes each goal's progress
  // independently, with no knowledge of other goals). So the diff into each flight's own
  // incremental share must reset per goal — diffing across a single running total spanning every
  // goal's flights (as if the whole merged list were one goal's cumulative sequence) silently
  // drops/misattributes shortfalls whenever flights from different goals interleave by date.
  const flightInputs: CashPlanFlightInput[] = aviosGoals.flatMap((g) => {
    let previousShortfall = 0;
    return g.progress.flights
      .filter((f) => f.status === 'planned')
      .map((f) => {
        const cumulativeShortfall = f.shortfallAtDate ?? f.remainingCumulative;
        const incrementalShortfall = Math.max(cumulativeShortfall - previousShortfall, 0);
        previousShortfall = cumulativeShortfall;
        return {
          id: f.id,
          label: f.label,
          neededBy: f.neededBy,
          economyFareEur: f.economyFareEur,
          aviosShortfallEur: incrementalShortfall * SUBSCRIPTION_EUR_PER_AVIOS,
        };
      });
  });

  // Only the merge-and-sort-by-date step is cross-goal — the increments above are already
  // correct per-flight regardless of how goals interleave, so computeCashPlan's own running
  // cumulative-cash total (a genuinely cross-goal quantity: total € needed by each date,
  // competing for the same shared pool) is correct however this list is ordered.
  //
  // Tie-break by id (not input order) so two flights sharing an exact neededBy date land in the
  // same relative order regardless of which goal's own enrichPointsGoal call is doing the
  // merging — enrichPointsGoal always puts "self" first in the goals it merges (see below), so
  // without a stable, perspective-independent tiebreaker, each goal would see its own same-date
  // flight sort first and claim the limited buffer ahead of the other goal's identical-date
  // flight, in both goals' own mutation responses simultaneously.
  flightInputs.sort((a, b) => {
    const dateDiff = new Date(a.neededBy).getTime() - new Date(b.neededBy).getTime();
    return dateDiff !== 0 ? dateDiff : a.id - b.id;
  });

  const shared = computeCashPlan({
    monthlySurplus: capacity.monthlySurplus,
    regularInvesting: capacity.regularInvesting,
    freeMonthlyFlow: capacity.freeMonthlyFlow,
    liquidBufferAvailable: capacity.liquidBufferAvailable,
    liquidNetWorth: capacity.liquidNetWorth,
    flights: flightInputs,
  });

  return new Map(shared.flights.map((f) => [f.id, f]));
}

/** Enriches a list of goals with `progress`, and — for Avios-unit goals only — `strategy` (the
 * sourced-rate conversion of any shortfall) and `cashPlan` (whether real household cash flow can
 * fund it, shared fairly across every Avios goal). Safe to call with a single goal. */
export async function enrichPointsGoals<T extends PointsGoalInput & { unit: string }>(
  goals: T[],
): Promise<EnrichedGoal<T>[]> {
  const withBaseProgress = goals.map(withProgress);
  const aviosGoals = withBaseProgress.filter((g) => g.unit === 'Avios');
  const tierPointsGoals = withBaseProgress.filter((g) => g.unit === 'Tier points');
  if (aviosGoals.length === 0 && tierPointsGoals.length === 0) return withBaseProgress;

  const window = await resolveCompletedMonthsWindow(CAPACITY_WINDOW_MONTHS);
  const [capacity, cardTransactions, cardEarnRules, tier] = await Promise.all([
    aviosGoals.length > 0 ? fetchMoneyCapacity(window) : Promise.resolve(null),
    fetchCardTransactions(window.windowStart, window.windowEnd),
    fetchCardEarnRules(),
    fetchFinnairPlusTier(),
  ]);

  const earnReconciliation = computeAviosEarnReconciliation({
    transactions: cardTransactions,
    rules: cardEarnRules,
    tier,
    months: window.months,
  });
  const tierPointsReconciliation = {
    qualifyingTierPointMonths: earnReconciliation.qualifyingTierPointMonths,
    monthsInWindow: earnReconciliation.monthsInWindow,
    expectedTierPoints: earnReconciliation.expectedTierPoints,
  };

  const sharedFlightResults =
    capacity !== null ? buildSharedCashPlan(aviosGoals, capacity) : new Map<number, CashPlanResult['flights'][number]>();

  return withBaseProgress.map((goal) => {
    if (goal.unit === 'Tier points') {
      return { ...goal, tierPointsReconciliation };
    }
    if (goal.unit !== 'Avios' || capacity === null) return goal;

    const strategy = computeAviosStrategy(goal.progress, tier);
    const ownPlannedIds = new Set(goal.progress.flights.filter((f) => f.status === 'planned').map((f) => f.id));
    const cashPlanFlights = Array.from(sharedFlightResults.values()).filter((f) => ownPlannedIds.has(f.id));
    const firstWealthTier = cashPlanFlights.find((f) => f.tier === 'wealth') ?? null;

    const cashPlan: CashPlanResult = {
      monthlySurplus: capacity.monthlySurplus,
      regularInvesting: capacity.regularInvesting,
      freeMonthlyFlow: capacity.freeMonthlyFlow,
      liquidBufferAvailable: capacity.liquidBufferAvailable,
      liquidNetWorth: capacity.liquidNetWorth,
      flights: cashPlanFlights,
      allFundedOrTradeoff: firstWealthTier === null,
      firstWealthTierFlightId: firstWealthTier?.id ?? null,
    };

    return { ...goal, strategy, cashPlan, earnReconciliation };
  });
}

/** Enriches a single goal returned from a mutation route. When it's an Avios-unit goal, this
 * also pulls in every *other* Avios-unit goal so the shared cash plan reflects true cross-goal
 * competition for the same capacity — the same sharing `enrichPointsGoals` does for the full
 * list, which a naive `enrichPointsGoals([goal])` here would silently lose for every single-goal
 * mutation response (add/edit/delete a flight/balance, edit the goal itself). */
export async function enrichPointsGoal<T extends PointsGoalInput & { id: number; unit: string }>(
  goal: T,
): Promise<EnrichedGoal<T>> {
  if (goal.unit !== 'Avios') {
    const [enriched] = await enrichPointsGoals([goal]);
    return enriched!;
  }

  const siblings = await prisma.pointsGoal.findMany({
    where: { unit: 'Avios', id: { not: goal.id } },
    include: POINTS_GOAL_INCLUDE,
  });
  const enrichedAll = await enrichPointsGoals([goal, ...(siblings as unknown as T[])]);
  return enrichedAll[0]!;
}
