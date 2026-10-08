// Whether real household cash flow and balance sheet can actually fund the flights tracked
// across every Avios goal: each flight's real economy fare (cash) plus the € cost of closing its
// Avios gap (at the sourced subscription rate — see avios-strategy.ts), checked cumulatively (by
// neededBy date) against three widening pools of money, cheapest first:
//   1. funded   — spare bank cash already above the emergency buffer, plus ongoing free monthly
//                 flow (surplus left over after regular investing)
//   2. tradeoff — the above, plus temporarily reducing regular investing itself
//   3. wealth   — still short even pausing investing entirely; has to draw on existing liquid
//                 net worth
// Pure function; the caller (points-goal-enrichment.ts) supplies the real numbers and the
// flights in neededBy order, already merged across every Avios-unit goal so they all compete for
// the same pool instead of each goal assuming it alone owns the full capacity.

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
  /** Average monthly surplus (income - expenses) over the household's observed history. Can be
   * negative. */
  monthlySurplus: number;
  /** Median monthly Investments-category spend — the "regular" investing habit. */
  regularInvesting: number;
  /** monthlySurplus - regularInvesting. Can be negative. */
  freeMonthlyFlow: number;
  /** One-time bank cash above the emergency-fund buffer, spent on the earliest flights first. */
  liquidBufferAvailable: number;
  /** Bank + investment + crypto assets — the ceiling for the 'wealth' tier. */
  liquidNetWorth: number;
  /** Planned flights across every Avios-unit goal, in neededBy order. */
  flights: CashPlanFlightInput[];
}

export type CashPlanTier = 'funded' | 'tradeoff' | 'wealth';

export interface CashPlanFlightResult {
  id: number;
  label: string;
  neededBy: string;
  cashNeeded: number;
  cumulativeCashNeeded: number;
  tier: CashPlanTier;
  /** This flight's own incremental cash need, spread evenly over the months until its date — how
   * big a monthly commitment this flight is on its own, independent of tier. Null once its date
   * has already passed (no months left to spread it over). */
  setAsidePerMonth: number | null;
  /** setAsidePerMonth as a % of monthlySurplus; null when monthlySurplus isn't positive (no
   * sensible percentage of a zero or negative baseline). */
  setAsidePctOfSurplus: number | null;
  /** Only set when tier === 'tradeoff': the exact €/mo regular investing needs to shrink by, for
   * the remaining months, to still make this flight's date without touching existing wealth. */
  tradeOffReductionPerMonth: number | null;
  /** Only set when tier === 'wealth': the € that has to come from existing liquid net worth (on
   * top of pausing regular investing entirely), and that amount as a % of liquidNetWorth. */
  wealthNeeded: number | null;
  wealthPctOfNetWorth: number | null;
}

export interface CashPlanResult {
  monthlySurplus: number;
  regularInvesting: number;
  freeMonthlyFlow: number;
  liquidBufferAvailable: number;
  liquidNetWorth: number;
  flights: CashPlanFlightResult[];
  /** True once no flight needs to draw on existing wealth (every flight is 'funded' or
   * 'tradeoff'). */
  allFundedOrTradeoff: boolean;
  firstWealthTierFlightId: number | null;
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

    const availableAtFreeFlow = input.liquidBufferAvailable + input.freeMonthlyFlow * monthsUntil;
    const availableAtFullSurplus = input.liquidBufferAvailable + input.monthlySurplus * monthsUntil;

    const freeFlowShort = Math.max(cumulativeCashNeeded - availableAtFreeFlow, 0);
    const surplusShort = Math.max(cumulativeCashNeeded - availableAtFullSurplus, 0);

    const tier: CashPlanTier = freeFlowShort === 0 ? 'funded' : surplusShort === 0 ? 'tradeoff' : 'wealth';

    const setAsidePerMonth = monthsUntil > 0 ? cashNeeded / monthsUntil : null;
    const setAsidePctOfSurplus =
      setAsidePerMonth !== null && input.monthlySurplus > 0
        ? (setAsidePerMonth / input.monthlySurplus) * 100
        : null;

    const tradeOffReductionPerMonth = tier === 'tradeoff' && monthsUntil > 0 ? freeFlowShort / monthsUntil : null;
    const wealthNeeded = tier === 'wealth' ? surplusShort : null;
    const wealthPctOfNetWorth =
      wealthNeeded !== null && input.liquidNetWorth > 0 ? (wealthNeeded / input.liquidNetWorth) * 100 : null;

    return {
      id: f.id,
      label: f.label,
      neededBy: toDate(f.neededBy).toISOString().slice(0, 10),
      cashNeeded,
      cumulativeCashNeeded,
      tier,
      setAsidePerMonth,
      setAsidePctOfSurplus,
      tradeOffReductionPerMonth,
      wealthNeeded,
      wealthPctOfNetWorth,
    };
  });

  const firstWealthTier = flights.find((f) => f.tier === 'wealth') ?? null;

  return {
    monthlySurplus: input.monthlySurplus,
    regularInvesting: input.regularInvesting,
    freeMonthlyFlow: input.freeMonthlyFlow,
    liquidBufferAvailable: input.liquidBufferAvailable,
    liquidNetWorth: input.liquidNetWorth,
    flights,
    allFundedOrTradeoff: firstWealthTier === null,
    firstWealthTierFlightId: firstWealthTier?.id ?? null,
  };
}
