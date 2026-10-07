// Pure computation for a points goal (e.g. Finnair Avios) tracked against a list of specific
// flights, with manually-recorded balance readings (same pattern as Asset balances — Avios earn
// rules can't be read reliably from transactions yet, see PROJECT_SUMMARY.md "Avios goal
// tracking"). A goal is "done" when every tracked flight is covered or redeemed; there's no
// separate period or level target.

export const AVG_DAYS_PER_MONTH = 30.4375; // 365.25 / 12 — used only for day->month duration conversion
const PACE_WINDOW_DAYS = 365; // observed pace/projection use only the trailing 12 months

export interface PointsBalanceInput {
  id: number;
  balance: number;
  recordedAt: Date | string;
}

export type PointsFlightStatus = 'planned' | 'redeemed';

export interface PointsFlightInput {
  id: number;
  label: string;
  points: number;
  economyFareEur: number | null;
  neededBy: Date | string;
  // Prisma's column is a plain string (no DB enum); application code only ever writes
  // 'planned' | 'redeemed', so every comparison below checks against those literals explicitly.
  status: string;
  redeemedAt: Date | string | null;
  note: string;
}

export type PointsPurchaseKind = 'purchased' | 'bonus';

export interface PointsPurchaseInput {
  id: number;
  points: number;
  costEur: number;
  purchasedAt: Date | string;
  // Same plain-string-column reasoning as PointsFlightInput.status.
  kind: string;
  note: string;
}

export interface PointsGoalInput {
  balances: PointsBalanceInput[];
  flights: PointsFlightInput[];
  purchases: PointsPurchaseInput[];
}

export interface PointsPurchaseProgress {
  id: number;
  points: number;
  costEur: number;
  purchasedAt: string;
  kind: PointsPurchaseKind;
  note: string;
}

export interface PointsFlightProgress {
  id: number;
  label: string;
  points: number;
  economyFareEur: number | null;
  neededBy: string;
  status: PointsFlightStatus;
  redeemedAt: string | null;
  note: string;
  /** Avios applied from the current available balance, in neededBy order. */
  coveredNow: number;
  pctCoveredNow: number;
  remainingNow: number;
  /** Avios still needed, cumulative across this and every earlier (by neededBy) planned flight. */
  cumulativeNeeded: number;
  /** cumulativeNeeded minus what's already accrued — the real gap for everything due by this
   * date, as opposed to remainingNow which only reflects this one flight's own allocation. */
  remainingCumulative: number;
  /** Projected total accrued Avios at this flight's neededBy date; null without a pace. */
  projectedAtDate: number | null;
  /** null once covered now, or without a pace to project from. */
  shortfallAtDate: number | null;
  /** null once covered now, or once the date has passed. */
  pointsPerMonthNeeded: number | null;
  /** true once coveredNow >= points; else null without a pace, else the projection vs cumulativeNeeded. */
  onTrack: boolean | null;
}

export interface PointsGoalProgress {
  latestBalance: number;
  latestRecordedAt: string | null;
  /** latestBalance + flights redeemed on or before latestRecordedAt (already reflected in it). */
  accruedPoints: number;
  /** latestBalance minus flights redeemed after latestRecordedAt (real-world spend not yet re-read). */
  availableBalance: number;
  totalRedeemedPoints: number;
  totalPlannedPoints: number;
  /** Days since the most recent balance reading, redemption, or purchase — whichever is most
   * recent counts as "activity" toward the 18-month no-activity expiry rule. Null when there's
   * no activity recorded at all yet. */
  daysSinceLastActivity: number | null;
  /** Avios/month observed over the trailing 12 months, from organic earn only — purchases and
   * bonuses are excluded so a one-off top-up doesn't inflate the projected future pace. Null
   * with <2 readings in that window. */
  observedPointsPerMonth: number | null;
  /** Purchases/bonuses recorded against this goal, newest first. */
  purchases: PointsPurchaseProgress[];
  /** Avios bought (kind: 'purchased', not 'bonus') within the current calendar year — checked
   * against the yearly purchase cap in avios-strategy.ts. */
  purchasedThisCalendarYearPoints: number;
  /** Planned flights, plus redeemed flights whose date hasn't happened yet (already paid/
   * requested, but the trip itself is still upcoming) — everything still worth seeing day to
   * day, merged and sorted by neededBy. */
  flights: PointsFlightProgress[];
  /** Redeemed flights whose date has already passed — archival history. */
  pastFlights: PointsFlightProgress[];
  /** First flight in `flights` that isn't fully covered by the current balance yet (always a
   * planned one — an upcoming-redeemed flight is always already covered); null if none. Same
   * selection avios-strategy.ts uses for its own "next at risk" conversion, so the two always
   * agree on which flight that is. */
  nextFlightAtRisk: PointsFlightProgress | null;
}

/** Shared Prisma include for every route that returns a goal with progress attached. */
export const POINTS_GOAL_INCLUDE = {
  balances: { orderBy: { recordedAt: 'asc' as const } },
  flights: { orderBy: { neededBy: 'asc' as const } },
  purchases: { orderBy: { purchasedAt: 'asc' as const } },
};

export function withProgress<T extends PointsGoalInput>(goal: T): T & { progress: PointsGoalProgress } {
  return { ...goal, progress: computePointsGoalProgress(goal) };
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function toDateStr(d: Date | string): string {
  return toDate(d).toISOString().slice(0, 10);
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

export function monthsBetween(a: Date | string, b: Date | string): number {
  return daysBetween(toDate(a), toDate(b)) / AVG_DAYS_PER_MONTH;
}

export function computePointsGoalProgress(
  goal: PointsGoalInput,
  today: Date = new Date(),
): PointsGoalProgress {
  const allBalances = [...goal.balances].sort(
    (a, b) => toDate(a.recordedAt).getTime() - toDate(b.recordedAt).getTime(),
  );
  const latest = allBalances.length > 0 ? allBalances[allBalances.length - 1] : undefined;
  const latestBalance = latest?.balance ?? 0;
  const latestDate = latest ? toDate(latest.recordedAt) : null;
  const latestRecordedAt = latestDate ? toDateStr(latestDate) : null;

  const redeemedFlightsAll = goal.flights.filter(
    (f): f is PointsFlightInput & { redeemedAt: Date | string } =>
      f.status === 'redeemed' && f.redeemedAt !== null,
  );
  // A redemption dated on/before the latest reading is already baked into that balance; a later
  // one means the real-world balance has already dropped but no new reading reflects it yet.
  const redeemedBeforeOrOnLatest = redeemedFlightsAll.filter(
    (f) => latestDate === null || toDate(f.redeemedAt).getTime() <= latestDate.getTime(),
  );
  const redeemedAfterLatest = redeemedFlightsAll.filter(
    (f) => latestDate !== null && toDate(f.redeemedAt).getTime() > latestDate.getTime(),
  );
  const totalRedeemedPoints = redeemedFlightsAll.reduce((sum, f) => sum + f.points, 0);
  const accruedPoints =
    latestBalance + redeemedBeforeOrOnLatest.reduce((sum, f) => sum + f.points, 0);
  const availableBalance =
    latestBalance - redeemedAfterLatest.reduce((sum, f) => sum + f.points, 0);

  // Pace: the accrued-equivalent balance at each reading (balance + redemptions already baked
  // into it), restricted to the trailing 12 months, so a redemption never reads as negative
  // earning and a stale reading from last year doesn't skew this year's pace. Purchases/bonuses
  // are further subtracted out for a separate "organic" figure — only organic earn should feed
  // the pace used to project future accrual, since you can't assume a one-off top-up repeats.
  const paceWindowStart = new Date(today.getTime() - PACE_WINDOW_DAYS * 86_400_000);
  const accruedSeries = allBalances
    .map((b) => {
      const d = toDate(b.recordedAt);
      const redeemedByThen = redeemedFlightsAll
        .filter((f) => toDate(f.redeemedAt).getTime() <= d.getTime())
        .reduce((sum, f) => sum + f.points, 0);
      const purchasedByThen = goal.purchases
        .filter((p) => toDate(p.purchasedAt).getTime() <= d.getTime())
        .reduce((sum, p) => sum + p.points, 0);
      return { date: d, organicAccrued: b.balance + redeemedByThen - purchasedByThen };
    })
    .filter((p) => p.date >= paceWindowStart && p.date <= today);

  let observedPointsPerMonth: number | null = null;
  if (accruedSeries.length >= 2) {
    const first = accruedSeries[0]!;
    const last = accruedSeries[accruedSeries.length - 1]!;
    const spanMonths = Math.max(monthsBetween(first.date, last.date), 1 / AVG_DAYS_PER_MONTH);
    observedPointsPerMonth = (last.organicAccrued - first.organicAccrued) / spanMonths;
  }

  const purchases: PointsPurchaseProgress[] = [...goal.purchases]
    .sort((a, b) => toDate(b.purchasedAt).getTime() - toDate(a.purchasedAt).getTime())
    .map((p) => ({
      id: p.id,
      points: p.points,
      costEur: p.costEur,
      purchasedAt: toDateStr(p.purchasedAt),
      kind: p.kind === 'bonus' ? 'bonus' : 'purchased',
      note: p.note,
    }));
  const currentYear = today.getFullYear();
  const purchasedThisCalendarYearPoints = goal.purchases
    .filter((p) => p.kind !== 'bonus' && toDate(p.purchasedAt).getFullYear() === currentYear)
    .reduce((sum, p) => sum + p.points, 0);

  const plannedSorted = goal.flights
    .filter((f) => f.status === 'planned')
    .sort((a, b) => toDate(a.neededBy).getTime() - toDate(b.neededBy).getTime());
  const totalPlannedPoints = plannedSorted.reduce((sum, f) => sum + f.points, 0);

  let runningAvailable = availableBalance;
  let cumulativeNeeded = 0;
  const flights: PointsFlightProgress[] = plannedSorted.map((f) => {
    cumulativeNeeded += f.points;
    const coveredNow = Math.max(Math.min(runningAvailable, f.points), 0);
    runningAvailable = Math.max(runningAvailable - coveredNow, 0);
    const pctCoveredNow = f.points > 0 ? (coveredNow / f.points) * 100 : 100;
    const remainingNow = Math.max(f.points - coveredNow, 0);
    const neededByDate = toDate(f.neededBy);
    const monthsUntil = Math.max(monthsBetween(today, neededByDate), 0);

    // Projected from availableBalance (the real spendable amount today), not accruedPoints —
    // accruedPoints adds past redemptions back in for pace purposes only, and would otherwise
    // double-count Avios already spent as if still available for a new flight.
    const projectedAtDate =
      observedPointsPerMonth !== null ? availableBalance + observedPointsPerMonth * monthsUntil : null;
    const reached = remainingNow === 0;
    const shortfallAtDate = reached
      ? null
      : projectedAtDate !== null
        ? Math.max(cumulativeNeeded - projectedAtDate, 0)
        : null;
    const remainingCumulative = Math.max(cumulativeNeeded - availableBalance, 0);
    const pointsPerMonthNeeded =
      reached || remainingCumulative === 0
        ? null
        : monthsUntil > 0
          ? remainingCumulative / monthsUntil
          : null;
    const onTrack = reached
      ? true
      : projectedAtDate !== null
        ? projectedAtDate >= cumulativeNeeded
        : null;

    return {
      id: f.id,
      label: f.label,
      points: f.points,
      economyFareEur: f.economyFareEur,
      neededBy: toDateStr(f.neededBy),
      status: 'planned',
      redeemedAt: f.redeemedAt ? toDateStr(f.redeemedAt) : null,
      note: f.note,
      coveredNow,
      pctCoveredNow,
      remainingNow,
      cumulativeNeeded,
      remainingCumulative,
      projectedAtDate,
      shortfallAtDate,
      pointsPerMonthNeeded,
      onTrack,
    };
  });

  const redeemedProgress: PointsFlightProgress[] = redeemedFlightsAll.map((f) => ({
    id: f.id,
    label: f.label,
    points: f.points,
    economyFareEur: f.economyFareEur,
    neededBy: toDateStr(f.neededBy),
    status: 'redeemed',
    redeemedAt: toDateStr(f.redeemedAt),
    note: f.note,
    coveredNow: f.points,
    pctCoveredNow: 100,
    remainingNow: 0,
    cumulativeNeeded: f.points,
    remainingCumulative: 0,
    projectedAtDate: null,
    shortfallAtDate: null,
    pointsPerMonthNeeded: null,
    onTrack: true,
  }));

  // A redeemed flight whose date hasn't happened yet is still a real upcoming trip — the Avios
  // and cash are already spent, but you haven't flown it, so it stays in the main list rather
  // than being archived alongside flights that have actually happened.
  const upcomingRedeemed = redeemedProgress.filter((f) => toDate(f.neededBy) >= today);
  const pastFlights = redeemedProgress
    .filter((f) => toDate(f.neededBy) < today)
    // redeemedAt is guaranteed non-null here — every entry came from redeemedFlightsAll, which
    // is filtered to status === 'redeemed' && redeemedAt !== null above.
    .sort((a, b) => toDate(b.redeemedAt!).getTime() - toDate(a.redeemedAt!).getTime());

  const mergedFlights = [...flights, ...upcomingRedeemed].sort(
    (a, b) => toDate(a.neededBy).getTime() - toDate(b.neededBy).getTime(),
  );

  const nextFlightAtRisk = mergedFlights.find((f) => f.remainingNow > 0) ?? null;

  const activityDates = [
    latestDate,
    ...redeemedFlightsAll.map((f) => toDate(f.redeemedAt)),
    ...goal.purchases.map((p) => toDate(p.purchasedAt)),
  ].filter((d): d is Date => d !== null);
  const lastActivityDate = activityDates.length > 0 ? new Date(Math.max(...activityDates.map((d) => d.getTime()))) : null;
  const daysSinceLastActivity = lastActivityDate ? Math.max(daysBetween(lastActivityDate, today), 0) : null;

  return {
    latestBalance,
    latestRecordedAt,
    accruedPoints,
    availableBalance,
    totalRedeemedPoints,
    totalPlannedPoints,
    daysSinceLastActivity,
    observedPointsPerMonth,
    purchases,
    purchasedThisCalendarYearPoints,
    flights: mergedFlights,
    pastFlights,
    nextFlightAtRisk,
  };
}
