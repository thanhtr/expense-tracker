import { describe, it, expect } from 'vitest';
import { computeCashPlan, type CashPlanInput } from '../../lib/services/cash-plan-service';

const TODAY = new Date('2026-07-01');

function input(overrides: Partial<CashPlanInput> = {}): CashPlanInput {
  return {
    monthlyDiscretionary: 1_000,
    liquidBufferAvailable: 0,
    flights: [],
    ...overrides,
  };
}

describe('computeCashPlan', () => {
  it('flags overcommitted when monthlyDiscretionary is negative', () => {
    const r = computeCashPlan(input({ monthlyDiscretionary: -100 }), TODAY);
    expect(r.overcommitted).toBe(true);
  });

  it('does not flag overcommitted when monthlyDiscretionary is positive', () => {
    const r = computeCashPlan(input({ monthlyDiscretionary: 100 }), TODAY);
    expect(r.overcommitted).toBe(false);
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
        monthlyDiscretionary: 100,
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

  it('spends the one-time liquid buffer on the earliest flight first', () => {
    const r = computeCashPlan(
      input({
        monthlyDiscretionary: 0, // no monthly flow at all
        liquidBufferAvailable: 1_000,
        flights: [{ id: 1, label: 'Soon', neededBy: '2026-08-01', economyFareEur: 1_000, aviosShortfallEur: 0 }],
      }),
      TODAY,
    );
    // Covered entirely by the existing bank buffer, even with zero monthly flow.
    expect(r.flights[0]!.onTrack).toBe(true);
  });

  it('is not covered by the buffer alone once it runs out across multiple flights', () => {
    const r = computeCashPlan(
      input({
        monthlyDiscretionary: 0,
        liquidBufferAvailable: 1_000,
        flights: [
          { id: 1, label: 'First', neededBy: '2026-08-01', economyFareEur: 1_000, aviosShortfallEur: 0 },
          { id: 2, label: 'Second', neededBy: '2026-09-01', economyFareEur: 1_000, aviosShortfallEur: 0 },
        ],
      }),
      TODAY,
    );
    expect(r.flights[0]!.onTrack).toBe(true);
    expect(r.flights[1]!.onTrack).toBe(false); // buffer already spent, no monthly flow to top it up
  });
});
