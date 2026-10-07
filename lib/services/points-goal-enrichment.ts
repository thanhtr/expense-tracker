// Attaches Avios-only, DB-backed extras (the sourced-rate strategy and the real-cash
// affordability plan) to goals already enriched with `progress`. Kept separate from
// points-goal-service.ts so that file can stay a pure function with no DB dependency.

import { prisma } from '@/lib/db';
import { getDashboardStats } from './aggregation-service';
import { SUBSCRIPTION_EUR_PER_AVIOS } from '@/lib/avios-facts';
import { withProgress, type PointsGoalInput, type PointsGoalProgress } from './points-goal-service';
import { computeAviosStrategy, type AviosStrategyResult } from './avios-strategy';
import { computeCashPlan, type CashPlanResult } from './cash-plan-service';

type GoalWithProgress<T> = T & { progress: PointsGoalProgress };
type EnrichedGoal<T> = GoalWithProgress<T> & {
  strategy?: AviosStrategyResult;
  cashPlan?: CashPlanResult;
};

async function fetchHouseholdContext() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const twelveMonthsAgo = new Date(today);
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const [stats, savingsGoals] = await Promise.all([
    getDashboardStats(twelveMonthsAgo, today),
    prisma.savingsGoal.findMany(),
  ]);
  return { netTwelveMonths: stats.net, savingsGoals };
}

/** Enriches a list of goals with `progress`, and — for Avios-unit goals only — `strategy` (the
 * sourced-rate conversion of any shortfall) and `cashPlan` (whether real household cash flow can
 * fund it). Safe to call with a single goal. */
export async function enrichPointsGoals<T extends PointsGoalInput & { unit: string }>(
  goals: T[],
): Promise<EnrichedGoal<T>[]> {
  const withBaseProgress = goals.map(withProgress);
  const hasAvios = withBaseProgress.some((g) => g.unit === 'Avios');
  if (!hasAvios) return withBaseProgress;

  const { netTwelveMonths, savingsGoals } = await fetchHouseholdContext();

  return withBaseProgress.map((goal) => {
    if (goal.unit !== 'Avios') return goal;

    const strategy = computeAviosStrategy(goal.progress);

    // f.shortfallAtDate/remainingCumulative are already cumulative across every earlier (by
    // neededBy) flight — cash-plan-service.ts does its own running total, so feeding it a
    // cumulative figure directly would double-count. Diff consecutive cumulative shortfalls to
    // get each flight's own incremental share instead; the running sum telescopes back to the
    // same cumulative shortfall at each point.
    let previousShortfall = 0;
    const cashPlan = computeCashPlan({
      netTwelveMonths,
      savingsGoals,
      // Planned only — an upcoming-redeemed flight is already paid for (both the fare and the
      // Avios), so it has nothing left to plan cash for.
      flights: goal.progress.flights.filter((f) => f.status === 'planned').map((f) => {
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
      }),
    });

    return { ...goal, strategy, cashPlan };
  });
}

export async function enrichPointsGoal<T extends PointsGoalInput & { unit: string }>(
  goal: T,
): Promise<EnrichedGoal<T>> {
  const [enriched] = await enrichPointsGoals([goal]);
  return enriched!;
}
