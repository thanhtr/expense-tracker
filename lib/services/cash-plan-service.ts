// Whether real household cash flow can actually fund the flights tracked on an Avios goal: the
// real economy fare (cash) plus the € cost of closing each flight's Avios gap (at the sourced
// subscription rate — see avios-strategy.ts), checked against rolling-12-month net income minus
// what's already committed to other savings goals. Pure function; the caller supplies the real
// numbers (dashboard aggregation, SavingsGoal rows) so this stays testable without a DB.

import { monthsBetween } from './points-goal-service';

export interface CashPlanSavingsGoalInput {
  targetAmount: number;
  currentAmount: number;
  targetDate: Date | string;
}

export interface CashPlanFlightInput {
  id: number;
  label: string;
  neededBy: Date | string;
  /** Real cash base fare for this flight; excluded from the plan until it's known. */
  economyFareEur: number | null;
  /** This flight's own incremental € cost of closing its share of the Avios gap at the
   * subscription rate (0 once covered) — NOT cumulative across earlier flights; this function
   * does its own running total below, so a cumulative value here would double-count. */
  aviosShortfallEur: number;
}

export interface CashPlanInput {
  /** Net income over the trailing 12 months (income - expenses), from getDashboardStats. */
  netTwelveMonths: number;
  savingsGoals: CashPlanSavingsGoalInput[];
  /** Planned flights only, in neededBy order. */
  flights: CashPlanFlightInput[];
}

export interface CashPlanFlightResult {
  id: number;
  label: string;
  neededBy: string;
  cashNeeded: number;
  cumulativeCashNeeded: number;
  cumulativeAvailableByDate: number;
  onTrack: boolean;
  shortBy: number;
}

export interface CashPlanResult {
  monthlySurplus: number;
  savingsMonthly: number;
  discretionaryMonthly: number;
  overcommitted: boolean;
  flights: CashPlanFlightResult[];
  onTrack: boolean;
  firstShortfallFlightId: number | null;
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

export function computeCashPlan(input: CashPlanInput, today: Date = new Date()): CashPlanResult {
  const monthlySurplus = input.netTwelveMonths / 12;

  const savingsMonthly = input.savingsGoals.reduce((sum, g) => {
    const remaining = g.targetAmount - g.currentAmount;
    const monthsRemaining = monthsBetween(today, g.targetDate);
    if (remaining <= 0 || monthsRemaining <= 0) return sum; // done, or already overdue
    return sum + remaining / monthsRemaining;
  }, 0);

  const discretionaryMonthly = monthlySurplus - savingsMonthly;

  let cumulativeCashNeeded = 0;
  const flights: CashPlanFlightResult[] = input.flights.map((f) => {
    const cashNeeded = (f.economyFareEur ?? 0) + f.aviosShortfallEur;
    cumulativeCashNeeded += cashNeeded;
    const monthsUntil = Math.max(monthsBetween(today, f.neededBy), 0);
    const cumulativeAvailableByDate = discretionaryMonthly * monthsUntil;
    const shortBy = Math.max(cumulativeCashNeeded - cumulativeAvailableByDate, 0);

    return {
      id: f.id,
      label: f.label,
      neededBy: toDate(f.neededBy).toISOString().slice(0, 10),
      cashNeeded,
      cumulativeCashNeeded,
      cumulativeAvailableByDate,
      onTrack: shortBy === 0,
      shortBy,
    };
  });

  const firstShortfall = flights.find((f) => !f.onTrack) ?? null;

  return {
    monthlySurplus,
    savingsMonthly,
    discretionaryMonthly,
    overcommitted: discretionaryMonthly < 0,
    flights,
    onTrack: firstShortfall === null,
    firstShortfallFlightId: firstShortfall?.id ?? null,
  };
}
