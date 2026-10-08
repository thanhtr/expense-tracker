import { describe, it, expect } from 'vitest';
import { computeCashPlan, type CashPlanInput } from '../../lib/services/cash-plan-service';
import { monthsBetween } from '../../lib/services/points-goal-service';

const TODAY = new Date('2026-07-01');
const MONTHS_TO_JAN = monthsBetween(TODAY, '2027-01-01'); // not exactly 6 — AVG_DAYS_PER_MONTH-based

function input(overrides: Partial<CashPlanInput> = {}): CashPlanInput {
  return {
    monthlySurplus: 2_700,
    regularInvesting: 2_000,
    freeMonthlyFlow: 700,
    liquidBufferAvailable: 0,
    liquidNetWorth: 100_000,
    flights: [],
    ...overrides,
  };
}

describe('computeCashPlan', () => {
  it('tiers a flight as funded when spare cash and free monthly flow alone cover it', () => {
    const r = computeCashPlan(
      input({
        flights: [{ id: 1, label: 'Trip', neededBy: '2027-01-01', economyFareEur: 1_000, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    // 6 months * €700/mo free flow = €4,200, well above €1,000 needed.
    expect(r.flights[0]!.tier).toBe('funded');
    expect(r.allFundedOrTradeoff).toBe(true);
    expect(r.firstWealthTierFlightId).toBeNull();
  });

  it('tiers a flight as tradeoff when it needs reducing regular investing, with the exact reduction', () => {
    // Pick a fare so the shortfall against free-flow-only capacity is exactly 1,500, regardless
    // of the precise (non-integer) month count to the date.
    const freeFlowShort = 1_500;
    const fare = 0 + 700 * MONTHS_TO_JAN + freeFlowShort;
    const r = computeCashPlan(
      input({
        flights: [{ id: 1, label: 'Trip', neededBy: '2027-01-01', economyFareEur: fare, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    expect(r.flights[0]!.tier).toBe('tradeoff');
    expect(r.flights[0]!.tradeOffReductionPerMonth).toBeCloseTo(freeFlowShort / MONTHS_TO_JAN, 5);
    expect(r.flights[0]!.wealthNeeded).toBeNull();
    expect(r.allFundedOrTradeoff).toBe(true);
  });

  it('tiers a flight as wealth when even pausing investing entirely falls short', () => {
    const surplusShort = 3_800;
    const fare = 0 + 2_700 * MONTHS_TO_JAN + surplusShort;
    const r = computeCashPlan(
      input({
        flights: [{ id: 1, label: 'Trip', neededBy: '2027-01-01', economyFareEur: fare, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    expect(r.flights[0]!.tier).toBe('wealth');
    expect(r.flights[0]!.wealthNeeded).toBeCloseTo(surplusShort, 5);
    expect(r.flights[0]!.wealthPctOfNetWorth).toBeCloseTo((surplusShort / 100_000) * 100, 5);
    expect(r.allFundedOrTradeoff).toBe(false);
    expect(r.firstWealthTierFlightId).toBe(1);
  });

  it('computes cashNeeded as fare plus the Avios shortfall cost, cumulative across flights', () => {
    const r = computeCashPlan(
      input({
        flights: [
          { id: 1, label: 'First', neededBy: '2026-10-01', economyFareEur: 1_000, aviosShortfallEur: 500 },
          { id: 2, label: 'Second', neededBy: '2027-01-01', economyFareEur: 2_000, aviosShortfallEur: 0 },
        ],
      }),
      TODAY,
    );
    expect(r.flights[0]!.cashNeeded).toBe(1_500);
    expect(r.flights[0]!.cumulativeCashNeeded).toBe(1_500);
    expect(r.flights[1]!.cumulativeCashNeeded).toBe(3_500);
  });

  it('excludes a flight with no economy fare set from the cash need beyond its Avios cost', () => {
    const r = computeCashPlan(
      input({
        flights: [{ id: 1, label: 'Unpriced', neededBy: '2027-01-01', economyFareEur: null, aviosShortfallEur: 500 }],
      }),
      TODAY,
    );
    expect(r.flights[0]!.cashNeeded).toBe(500);
  });

  it('spends the one-time liquid buffer on the earliest flight first', () => {
    const r = computeCashPlan(
      input({
        monthlySurplus: 0,
        regularInvesting: 0,
        freeMonthlyFlow: 0,
        liquidBufferAvailable: 1_000,
        flights: [{ id: 1, label: 'Soon', neededBy: '2026-08-01', economyFareEur: 1_000, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    expect(r.flights[0]!.tier).toBe('funded');
  });

  it('gives setAsidePerMonth as this flight\'s own incremental cost spread over its own months, and a % of surplus', () => {
    const r = computeCashPlan(
      input({
        monthlySurplus: 1_000,
        flights: [{ id: 1, label: 'Trip', neededBy: '2027-01-01', economyFareEur: 1_200, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    const expectedPerMonth = 1_200 / MONTHS_TO_JAN;
    expect(r.flights[0]!.setAsidePerMonth).toBeCloseTo(expectedPerMonth, 5);
    expect(r.flights[0]!.setAsidePctOfSurplus).toBeCloseTo((expectedPerMonth / 1_000) * 100, 5);
  });

  it('leaves setAsidePctOfSurplus null when monthlySurplus is not positive', () => {
    const r = computeCashPlan(
      input({
        monthlySurplus: -500,
        flights: [{ id: 1, label: 'Trip', neededBy: '2027-01-01', economyFareEur: 1_200, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    expect(r.flights[0]!.setAsidePctOfSurplus).toBeNull();
  });
});
