import { describe, it, expect } from 'vitest';
import { computeAviosStrategy } from '../../lib/services/avios-strategy';
import { computePointsGoalProgress, type PointsGoalInput } from '../../lib/services/points-goal-service';
import { PURCHASE_CAP_PER_YEAR } from '../../lib/avios-facts';

function progressFor(flights: PointsGoalInput['flights'], balance = 0, today = new Date('2026-07-01')) {
  return computePointsGoalProgress(
    { balances: balance > 0 ? [{ id: 1, balance, recordedAt: '2026-06-01' }] : [], flights },
    today,
  );
}

describe('computeAviosStrategy', () => {
  it('reports allCovered when every planned flight is already covered', () => {
    const p = progressFor(
      [
        {
          id: 1,
          label: 'Upgrade',
          points: 40_000,
          economyFareEur: null,
          neededBy: '2027-01-01',
          status: 'planned',
          redeemedAt: null,
        },
      ],
      50_000,
    );
    const s = computeAviosStrategy(p);
    expect(s.allCovered).toBe(true);
    expect(s.nextAtRisk).toBeNull();
    expect(s.combined).toBeNull();
  });

  it('converts a shortfall into €, MR (rounded to a multiple of 17), and card spend', () => {
    const p = progressFor(
      [
        {
          id: 1,
          label: 'Upgrade',
          points: 80_000,
          economyFareEur: null,
          neededBy: '2026-07-01', // due now, so shortfallPoints falls back to remainingNow
          status: 'planned',
          redeemedAt: null,
        },
      ],
      0,
    );
    const s = computeAviosStrategy(p);
    expect(s.allCovered).toBe(false);
    expect(s.nextAtRisk).not.toBeNull();
    expect(s.nextAtRisk!.shortfallPoints).toBe(80_000);
    expect(s.nextAtRisk!.eurTotal).toBeCloseTo(80_000 * (628.8 / 48_000), 2);
    // 80,000 / 10 * 17 = 136,000 MR exactly divides; still must be a multiple of 17.
    expect(s.nextAtRisk!.mrPoints % 17).toBe(0);
    expect(s.nextAtRisk!.visaSpendSilverTotal).toBeLessThan(s.nextAtRisk!.visaSpendBasicTotal);
    expect(s.nextAtRisk!.overCap).toBe(false);
  });

  it('flags a shortfall above the yearly purchase cap', () => {
    const p = progressFor(
      [
        {
          id: 1,
          label: 'Huge ask',
          points: PURCHASE_CAP_PER_YEAR + 50_000,
          economyFareEur: null,
          neededBy: '2026-07-01',
          status: 'planned',
          redeemedAt: null,
        },
      ],
      0,
    );
    const s = computeAviosStrategy(p);
    expect(s.nextAtRisk!.overCap).toBe(true);
  });

  it('returns a combined conversion for the furthest flight when more than one is short', () => {
    const p = progressFor(
      [
        {
          id: 1,
          label: 'Sooner',
          points: 40_000,
          economyFareEur: null,
          neededBy: '2026-08-01',
          status: 'planned',
          redeemedAt: null,
        },
        {
          id: 2,
          label: 'Later',
          points: 40_000,
          economyFareEur: null,
          neededBy: '2027-01-01',
          status: 'planned',
          redeemedAt: null,
        },
      ],
      0,
    );
    const s = computeAviosStrategy(p);
    expect(s.nextAtRisk!.flightId).toBe(1);
    expect(s.combined).not.toBeNull();
    expect(s.combined!.flightId).toBe(2);
    expect(s.combined!.shortfallPoints).toBe(80_000); // cumulative across both flights
  });

  it('does not return a combined conversion when only one flight is short', () => {
    const p = progressFor(
      [
        {
          id: 1,
          label: 'Only one',
          points: 40_000,
          economyFareEur: null,
          neededBy: '2026-08-01',
          status: 'planned',
          redeemedAt: null,
        },
      ],
      0,
    );
    const s = computeAviosStrategy(p);
    expect(s.combined).toBeNull();
  });
});
