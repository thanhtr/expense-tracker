import { describe, it, expect } from 'vitest';
import { computeCashPlan, type CashPlanInput } from '../../lib/services/cash-plan-service';

const TODAY = new Date('2026-07-01');

function input(overrides: Partial<CashPlanInput> = {}): CashPlanInput {
  return {
    netTwelveMonths: 12_000, // €1,000/mo
    savingsGoals: [],
    flights: [],
    ...overrides,
  };
}

describe('computeCashPlan', () => {
  it('nets active savings-goal contributions out of the monthly surplus', () => {
    const r = computeCashPlan(
      input({
        savingsGoals: [{ targetAmount: 6_000, currentAmount: 0, targetDate: '2027-01-01' }], // 6mo, €1,000/mo
      }),
      TODAY,
    );
    expect(r.monthlySurplus).toBe(1_000);
    // ~6 months at an average 30.4375 days each vs a calendar Jul-Jan span — a small day-count
    // margin is expected, not an exact 1,000.
    expect(r.savingsMonthly).toBeGreaterThan(950);
    expect(r.savingsMonthly).toBeLessThan(1_050);
    expect(r.discretionaryMonthly).toBeCloseTo(1_000 - r.savingsMonthly, 5);
  });

  it('skips a completed savings goal', () => {
    const r = computeCashPlan(
      input({
        savingsGoals: [{ targetAmount: 1_000, currentAmount: 1_000, targetDate: '2027-01-01' }],
      }),
      TODAY,
    );
    expect(r.savingsMonthly).toBe(0);
  });

  it('skips an overdue savings goal', () => {
    const r = computeCashPlan(
      input({
        savingsGoals: [{ targetAmount: 1_000, currentAmount: 0, targetDate: '2026-01-01' }], // in the past
      }),
      TODAY,
    );
    expect(r.savingsMonthly).toBe(0);
  });

  it('flags overcommitted when savings goals exceed the surplus', () => {
    const r = computeCashPlan(
      input({
        netTwelveMonths: 1_200, // €100/mo
        savingsGoals: [{ targetAmount: 6_000, currentAmount: 0, targetDate: '2027-01-01' }], // €1,000/mo needed
      }),
      TODAY,
    );
    expect(r.overcommitted).toBe(true);
    expect(r.discretionaryMonthly).toBeLessThan(0);
  });

  it('marks a flight on track when discretionary cash covers it by its date', () => {
    const r = computeCashPlan(
      input({
        flights: [{ id: 1, label: 'Trip', neededBy: '2027-01-01', economyFareEur: 1_000, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    // 6 months * €1,000/mo discretionary = €6,000 available, well above €1,000 needed.
    expect(r.flights[0]!.onTrack).toBe(true);
    expect(r.flights[0]!.shortBy).toBe(0);
    expect(r.onTrack).toBe(true);
  });

  it('reports a shortfall when the cumulative cash need outpaces discretionary income', () => {
    const r = computeCashPlan(
      input({
        netTwelveMonths: 1_200, // €100/mo discretionary
        flights: [{ id: 1, label: 'Trip', neededBy: '2026-08-01', economyFareEur: 1_000, aviosShortfallEur: 500 }],
      }),
      TODAY,
    );
    expect(r.flights[0]!.cashNeeded).toBe(1_500);
    expect(r.flights[0]!.onTrack).toBe(false);
    expect(r.flights[0]!.shortBy).toBeGreaterThan(0);
    expect(r.onTrack).toBe(false);
    expect(r.firstShortfallFlightId).toBe(1);
  });

  it('shares the discretionary pool cumulatively across multiple flights', () => {
    const r = computeCashPlan(
      input({
        flights: [
          { id: 1, label: 'First', neededBy: '2026-10-01', economyFareEur: 2_000, aviosShortfallEur: 0 },
          { id: 2, label: 'Second', neededBy: '2027-01-01', economyFareEur: 2_000, aviosShortfallEur: 0 },
        ],
      }),
      TODAY,
    );
    expect(r.flights[0]!.cumulativeCashNeeded).toBe(2_000);
    expect(r.flights[1]!.cumulativeCashNeeded).toBe(4_000);
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
});
