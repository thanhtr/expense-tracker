// Attaches Avios-only, DB-backed extras (the sourced-rate strategy and the real-cash
// affordability plan) to goals already enriched with `progress`. Kept separate from
// points-goal-service.ts so that file can stay a pure function with no DB dependency.

import { prisma } from '@/lib/db';
import { getDashboardStats } from './aggregation-service';
import { FIRE_DEFAULTS } from './fire-service';
import { deriveMoneyCapacity, type MoneyCapacity } from './money-capacity-service';
import { SUBSCRIPTION_EUR_PER_AVIOS } from '@/lib/avios-facts';
import { withProgress, POINTS_GOAL_INCLUDE, type PointsGoalInput, type PointsGoalProgress } from './points-goal-service';
import { computeAviosStrategy, type AviosStrategyResult } from './avios-strategy';
import { computeCashPlan, type CashPlanFlightInput, type CashPlanResult } from './cash-plan-service';

type GoalWithProgress<T> = T & { progress: PointsGoalProgress };
type EnrichedGoal<T> = GoalWithProgress<T> & {
  strategy?: AviosStrategyResult;
  cashPlan?: CashPlanResult;
};

// Entirely derived from real data — never from a manually-maintained goal. SavingsGoal/GoalsCard
// were retired (PR #98) and are not read here.
async function fetchMoneyCapacity(): Promise<MoneyCapacity> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const [stats, bankAssets, fireConfig] = await Promise.all([
    getDashboardStats(twelveMonthsAgo, today),
    prisma.asset.findMany({ where: { type: 'bank' } }),
    prisma.fireConfig.findUnique({ where: { id: 1 } }),
  ]);

  const bankTotal = bankAssets.reduce((sum, a) => sum + a.balance, 0);
  const avgMonthlyIncome = stats.totalIncome / Math.max(1, stats.byMonthIncome.length);
  const emergencyFundMonths = fireConfig?.emergencyFundMonths ?? FIRE_DEFAULTS.emergencyFundMonths;

  return deriveMoneyCapacity({
    netTwelveMonths: stats.net,
    investmentsTwelveMonths: stats.totalInvestments,
    bankTotal,
    avgMonthlyIncome,
    emergencyFundMonths,
  });
}

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
    monthlyDiscretionary: capacity.monthlyDiscretionary,
    liquidBufferAvailable: capacity.liquidBufferAvailable,
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
  if (aviosGoals.length === 0) return withBaseProgress;

  const capacity = await fetchMoneyCapacity();
  const sharedFlightResults = buildSharedCashPlan(aviosGoals, capacity);

  return withBaseProgress.map((goal) => {
    if (goal.unit !== 'Avios') return goal;

    const strategy = computeAviosStrategy(goal.progress);
    const ownPlannedIds = new Set(goal.progress.flights.filter((f) => f.status === 'planned').map((f) => f.id));
    const cashPlanFlights = Array.from(sharedFlightResults.values()).filter((f) => ownPlannedIds.has(f.id));
    const firstShortfall = cashPlanFlights.find((f) => !f.onTrack) ?? null;

    const cashPlan: CashPlanResult = {
      monthlyDiscretionary: capacity.monthlyDiscretionary,
      liquidBufferAvailable: capacity.liquidBufferAvailable,
      overcommitted: capacity.monthlyDiscretionary < 0,
      flights: cashPlanFlights,
      onTrack: firstShortfall === null,
      firstShortfallFlightId: firstShortfall?.id ?? null,
    };

    return { ...goal, strategy, cashPlan };
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
