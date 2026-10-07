// Attaches Avios-only, DB-backed extras (the sourced-rate strategy and the real-cash
// affordability plan) to goals already enriched with `progress`. Kept separate from
// points-goal-service.ts so that file can stay a pure function with no DB dependency.

import { prisma } from '@/lib/db';
import { getDashboardStats } from './aggregation-service';
import { FIRE_DEFAULTS } from './fire-service';
import { deriveMoneyCapacity, type MoneyCapacity } from './money-capacity-service';
import { SUBSCRIPTION_EUR_PER_AVIOS } from '@/lib/avios-facts';
import { withProgress, type PointsGoalInput, type PointsGoalProgress } from './points-goal-service';
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
  const allPlannedFlights = aviosGoals.flatMap((g) => g.progress.flights.filter((f) => f.status === 'planned'));
  allPlannedFlights.sort((a, b) => new Date(a.neededBy).getTime() - new Date(b.neededBy).getTime());

  // f.shortfallAtDate/remainingCumulative are cumulative across every earlier (by neededBy)
  // flight *within that flight's own goal* — cash-plan-service does its own running total across
  // this merged, cross-goal list, so feeding it a cumulative figure directly would double-count.
  // Diff consecutive cumulative shortfalls into each flight's own incremental share instead.
  let previousShortfall = 0;
  const flightInputs: CashPlanFlightInput[] = allPlannedFlights.map((f) => {
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

export async function enrichPointsGoal<T extends PointsGoalInput & { unit: string }>(
  goal: T,
): Promise<EnrichedGoal<T>> {
  const [enriched] = await enrichPointsGoals([goal]);
  return enriched!;
}
