// Pure computation for a points goal (e.g. Finnair Avios) with manually-recorded balance
// readings. Phase 1: the balance is entered by hand (same as Asset balances), since neither
// Avios earn rules nor redemption/transfer activity can be read reliably from transactions
// yet (see PROJECT_SUMMARY.md, "Avios goal tracking"). No earn-rate assumptions are made here.

const AVG_DAYS_PER_MONTH = 30.4375; // 365.25 / 12 — used only for day->month duration conversion

export interface PointsGoalLevelInput {
  id: number;
  label: string;
  targetPoints: number;
}

export interface PointsBalanceInput {
  id: number;
  balance: number;
  recordedAt: Date | string;
}

export interface PointsGoalInput {
  periodStart: Date | string;
  periodEnd: Date | string;
  levels: PointsGoalLevelInput[];
  balances: PointsBalanceInput[];
}

export interface PointsGoalLevelProgress {
  id: number;
  label: string;
  targetPoints: number;
  reached: boolean;
  /** Can exceed 100 once the level is reached. */
  pctOfTarget: number;
  remaining: number;
  expectedByToday: number;
  /** null once reached, or once the period has ended. */
  pointsPerMonthNeeded: number | null;
  /** null when there isn't yet a pace to project from (fewer than 2 readings in the period). */
  onTrack: boolean | null;
}

export interface PointsGoalProgress {
  latestBalance: number;
  latestRecordedAt: string | null;
  /** 0–100, clamped to the period's bounds. */
  periodElapsedPct: number;
  monthsElapsed: number;
  monthsRemaining: number;
  /** Avios/month between the first and last reading taken inside the period; null with <2 readings. */
  observedPointsPerMonth: number | null;
  /** Straight-line projection of observedPointsPerMonth out to periodEnd; null with <2 readings. */
  projectedEndBalance: number | null;
  levels: PointsGoalLevelProgress[];
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

export function computePointsGoalProgress(
  goal: PointsGoalInput,
  today: Date = new Date(),
): PointsGoalProgress {
  const periodStart = toDate(goal.periodStart);
  const periodEnd = toDate(goal.periodEnd);
  const totalDays = Math.max(daysBetween(periodStart, periodEnd), 1);
  const elapsedDays = Math.min(Math.max(daysBetween(periodStart, today), 0), totalDays);
  const periodElapsedPct = (elapsedDays / totalDays) * 100;
  const monthsElapsed = elapsedDays / AVG_DAYS_PER_MONTH;
  const monthsRemaining = (totalDays - elapsedDays) / AVG_DAYS_PER_MONTH;

  const allBalances = [...goal.balances].sort(
    (a, b) => toDate(a.recordedAt).getTime() - toDate(b.recordedAt).getTime(),
  );
  const latest = allBalances.length > 0 ? allBalances[allBalances.length - 1] : undefined;
  const latestBalance = latest?.balance ?? 0;
  const latestRecordedAt = latest ? toDate(latest.recordedAt).toISOString().slice(0, 10) : null;

  // Pace/projection use only readings taken inside the goal's own period — a reading from a
  // previous year's goal isn't a fact about this period's earn rate.
  const inPeriod = allBalances.filter((b) => {
    const d = toDate(b.recordedAt);
    return d >= periodStart && d <= periodEnd;
  });

  let observedPointsPerMonth: number | null = null;
  let projectedEndBalance: number | null = null;
  if (inPeriod.length >= 2) {
    const first = inPeriod[0]!;
    const last = inPeriod[inPeriod.length - 1]!;
    const firstDate = toDate(first.recordedAt);
    const lastDate = toDate(last.recordedAt);
    const spanMonths = Math.max(daysBetween(firstDate, lastDate) / AVG_DAYS_PER_MONTH, 1 / AVG_DAYS_PER_MONTH);
    observedPointsPerMonth = (last.balance - first.balance) / spanMonths;
    const monthsToEnd = Math.max(daysBetween(lastDate, periodEnd) / AVG_DAYS_PER_MONTH, 0);
    projectedEndBalance = last.balance + observedPointsPerMonth * monthsToEnd;
  }

  const levels: PointsGoalLevelProgress[] = [...goal.levels]
    .sort((a, b) => a.targetPoints - b.targetPoints)
    .map((level) => {
      const reached = latestBalance >= level.targetPoints;
      const pctOfTarget = level.targetPoints > 0 ? (latestBalance / level.targetPoints) * 100 : 0;
      const remaining = Math.max(level.targetPoints - latestBalance, 0);
      const expectedByToday = level.targetPoints * (periodElapsedPct / 100);
      const pointsPerMonthNeeded = reached
        ? null
        : monthsRemaining > 0
          ? remaining / monthsRemaining
          : null;
      const onTrack = reached ? true : projectedEndBalance !== null ? projectedEndBalance >= level.targetPoints : null;

      return {
        id: level.id,
        label: level.label,
        targetPoints: level.targetPoints,
        reached,
        pctOfTarget,
        remaining,
        expectedByToday,
        pointsPerMonthNeeded,
        onTrack,
      };
    });

  return {
    latestBalance,
    latestRecordedAt,
    periodElapsedPct,
    monthsElapsed,
    monthsRemaining,
    observedPointsPerMonth,
    projectedEndBalance,
    levels,
  };
}
