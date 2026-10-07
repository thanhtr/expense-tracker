// Whether real household cash flow can actually fund the flights tracked across every Avios
// goal: each flight's real economy fare (cash) plus the € cost of closing its Avios gap (at the
// sourced subscription rate — see avios-strategy.ts), checked against money-capacity-service's
// derived monthly discretionary income and one-time liquid buffer. Pure function; the caller
// (points-goal-enrichment.ts) supplies the real numbers and the flights in neededBy order,
// already merged across every Avios-unit goal so they all compete for the same pool instead of
// each goal assuming it alone owns the full capacity.

import { monthsBetween } from './points-goal-service';

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
  /** Rolling-12mo net income minus observed ongoing investing (money-capacity-service). Can be
   * negative if investing already exceeds net income. */
  monthlyDiscretionary: number;
  /** One-time bank cash above the emergency-fund buffer (money-capacity-service), spent on the
   * earliest flights first, on top of the accruing monthly discretionary flow. */
  liquidBufferAvailable: number;
  /** Planned flights across every Avios-unit goal, in neededBy order. */
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
  monthlyDiscretionary: number;
  liquidBufferAvailable: number;
  overcommitted: boolean;
  flights: CashPlanFlightResult[];
  onTrack: boolean;
  firstShortfallFlightId: number | null;
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

export function computeCashPlan(input: CashPlanInput, today: Date = new Date()): CashPlanResult {
  let cumulativeCashNeeded = 0;
  const flights: CashPlanFlightResult[] = input.flights.map((f) => {
    const cashNeeded = (f.economyFareEur ?? 0) + f.aviosShortfallEur;
    cumulativeCashNeeded += cashNeeded;
    const monthsUntil = Math.max(monthsBetween(today, f.neededBy), 0);
    const cumulativeAvailableByDate = input.liquidBufferAvailable + input.monthlyDiscretionary * monthsUntil;
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
    monthlyDiscretionary: input.monthlyDiscretionary,
    liquidBufferAvailable: input.liquidBufferAvailable,
    overcommitted: input.monthlyDiscretionary < 0,
    flights,
    onTrack: firstShortfall === null,
    firstShortfallFlightId: firstShortfall?.id ?? null,
  };
}
