import { describe, it, expect } from 'vitest';
import { computePointsGoalProgress, type PointsGoalInput } from '../../lib/services/points-goal-service';

function goal(overrides: Partial<PointsGoalInput> = {}): PointsGoalInput {
  return {
    balances: [],
    flights: [],
    ...overrides,
  };
}

describe('computePointsGoalProgress', () => {
  it('reports 0 balance and no flights for an empty goal', () => {
    const p = computePointsGoalProgress(goal(), new Date('2026-07-01'));
    expect(p.latestBalance).toBe(0);
    expect(p.latestRecordedAt).toBeNull();
    expect(p.accruedPoints).toBe(0);
    expect(p.availableBalance).toBe(0);
    expect(p.observedPointsPerMonth).toBeNull();
    expect(p.flights).toEqual([]);
    expect(p.nextFlightAtRisk).toBeNull();
  });

  it('uses the latest reading as the current balance', () => {
    const p = computePointsGoalProgress(
      goal({ balances: [{ id: 1, balance: 50_000, recordedAt: '2026-06-01' }] }),
      new Date('2026-07-01'),
    );
    expect(p.latestBalance).toBe(50_000);
    expect(p.latestRecordedAt).toBe('2026-06-01');
    expect(p.accruedPoints).toBe(50_000);
    expect(p.availableBalance).toBe(50_000);
  });

  it('does not compute pace from a single reading', () => {
    const p = computePointsGoalProgress(
      goal({ balances: [{ id: 1, balance: 50_000, recordedAt: '2026-06-01' }] }),
      new Date('2026-07-01'),
    );
    expect(p.observedPointsPerMonth).toBeNull();
  });

  it('computes pace from two readings in the trailing 12 months', () => {
    const p = computePointsGoalProgress(
      goal({
        balances: [
          { id: 1, balance: 0, recordedAt: '2026-01-01' },
          { id: 2, balance: 30_000, recordedAt: '2026-07-01' }, // ~6 months, ~5000/mo
        ],
      }),
      new Date('2026-07-01'),
    );
    expect(p.observedPointsPerMonth).not.toBeNull();
    expect(p.observedPointsPerMonth!).toBeCloseTo(5_000, -2);
  });

  it('ignores a reading older than 12 months when computing pace', () => {
    const p = computePointsGoalProgress(
      goal({
        balances: [
          { id: 1, balance: 10_000, recordedAt: '2024-01-01' }, // >12mo before "today"
          { id: 2, balance: 30_000, recordedAt: '2026-07-01' },
        ],
      }),
      new Date('2026-07-01'),
    );
    expect(p.observedPointsPerMonth).toBeNull();
    expect(p.latestBalance).toBe(30_000);
  });

  describe('redemptions', () => {
    it('adds a redemption dated before the latest reading back into accruedPoints (no double count)', () => {
      // The reading already reflects the spend; accrued = what you'd have today if you hadn't spent it.
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 52_000, recordedAt: '2026-06-01' }],
          flights: [
            {
              id: 1,
              label: 'Japan outbound',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2027-01-01',
              status: 'redeemed',
              redeemedAt: '2026-05-01', // before the reading
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      expect(p.accruedPoints).toBe(132_000);
      expect(p.availableBalance).toBe(52_000); // already deducted, nothing further to subtract
      expect(p.totalRedeemedPoints).toBe(80_000);
    });

    it('subtracts a redemption dated after the latest reading from availableBalance', () => {
      // Real-world balance already dropped but no new reading reflects it yet.
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 132_000, recordedAt: '2026-06-01' }],
          flights: [
            {
              id: 1,
              label: 'Japan outbound',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2027-01-01',
              status: 'redeemed',
              redeemedAt: '2026-06-15', // after the reading
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      expect(p.accruedPoints).toBe(132_000); // not baked into the reading yet
      expect(p.availableBalance).toBe(52_000); // real spendable balance right now
    });

    it('does not count a redemption as negative earning in the pace calculation', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [
            { id: 1, balance: 40_000, recordedAt: '2026-01-01' },
            { id: 2, balance: 5_000, recordedAt: '2026-07-01' }, // dropped because of a redemption
          ],
          flights: [
            {
              id: 1,
              label: 'Redeemed flight',
              points: 40_000,
              economyFareEur: null,
              neededBy: '2026-06-01',
              status: 'redeemed',
              redeemedAt: '2026-04-01', // between the two readings
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      // Accrued-equivalent at each reading: 40,000 and (5,000 + 40,000) = 45,000 → positive pace.
      expect(p.observedPointsPerMonth).not.toBeNull();
      expect(p.observedPointsPerMonth!).toBeGreaterThan(0);
    });
  });

  describe('flight coverage', () => {
    it('fully covers a planned flight once the balance meets it', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 90_000, recordedAt: '2026-06-01' }],
          flights: [
            {
              id: 1,
              label: 'Minimum upgrade',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2027-01-01',
              status: 'planned',
              redeemedAt: null,
              note: 'booking ref ABC123',
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      const f = p.flights[0]!;
      expect(f.note).toBe('booking ref ABC123');
      expect(f.coveredNow).toBe(80_000);
      expect(f.pctCoveredNow).toBe(100);
      expect(f.remainingNow).toBe(0);
      expect(f.onTrack).toBe(true);
      expect(p.nextFlightAtRisk).toBeNull();
    });

    it('allocates available balance across multiple flights in neededBy order', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 50_000, recordedAt: '2026-06-01' }],
          flights: [
            {
              id: 1,
              label: 'Later flight',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2027-06-01',
              status: 'planned',
              redeemedAt: null,
            },
            {
              id: 2,
              label: 'Sooner flight',
              points: 40_000,
              economyFareEur: null,
              neededBy: '2026-12-01',
              status: 'planned',
              redeemedAt: null,
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      // Sooner flight (id 2) should be first in the sorted list and fully covered first.
      const sooner = p.flights.find((f) => f.id === 2)!;
      const later = p.flights.find((f) => f.id === 1)!;
      expect(sooner.coveredNow).toBe(40_000);
      expect(sooner.remainingNow).toBe(0);
      expect(later.coveredNow).toBe(10_000);
      expect(later.remainingNow).toBe(70_000);
      expect(later.cumulativeNeeded).toBe(120_000);
    });

    it('flags a flight as not on track when the projection falls short', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [
            { id: 1, balance: 0, recordedAt: '2026-01-01' },
            { id: 2, balance: 1_000, recordedAt: '2026-07-01' }, // far too slow for 80k by year-end
          ],
          flights: [
            {
              id: 1,
              label: 'Minimum upgrade',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2026-12-31',
              status: 'planned',
              redeemedAt: null,
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      const f = p.flights[0]!;
      expect(f.onTrack).toBe(false);
      expect(f.shortfallAtDate).not.toBeNull();
      expect(p.nextFlightAtRisk?.id).toBe(1);
    });

    it('returns null onTrack without a pace and the flight is not yet covered', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 10_000, recordedAt: '2026-06-01' }],
          flights: [
            {
              id: 1,
              label: 'Minimum upgrade',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2026-12-31',
              status: 'planned',
              redeemedAt: null,
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      expect(p.flights[0]!.onTrack).toBeNull();
    });

    it('lists redeemed flights separately, always covered', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 10_000, recordedAt: '2026-06-01' }],
          flights: [
            {
              id: 1,
              label: 'Already redeemed',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2026-05-01',
              status: 'redeemed',
              redeemedAt: '2026-04-01',
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      expect(p.flights).toEqual([]);
      expect(p.pastFlights).toHaveLength(1);
      expect(p.pastFlights[0]!.onTrack).toBe(true);
    });

    it('keeps a redeemed flight in the main list while its date is still upcoming', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 5_778, recordedAt: '2026-10-07' }],
          flights: [
            {
              id: 1,
              label: 'Japan return x 2',
              points: 80_000,
              economyFareEur: null,
              neededBy: '2027-01-01', // still in the future relative to "today" below
              status: 'redeemed',
              redeemedAt: '2026-10-07',
            },
          ],
        }),
        new Date('2026-10-07'),
      );
      expect(p.pastFlights).toEqual([]);
      expect(p.flights).toHaveLength(1);
      expect(p.flights[0]!.status).toBe('redeemed');
      expect(p.flights[0]!.remainingNow).toBe(0);
    });

    it('does not let a past redemption make a new flight look covered (regression)', () => {
      // Balance is 50,000 after a 150,000-point flight was already redeemed — accruedPoints
      // (200,000) must never be used as "available for a new flight", only availableBalance.
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 50_000, recordedAt: '2026-06-01' }],
          flights: [
            {
              id: 1,
              label: 'Already redeemed',
              points: 150_000,
              economyFareEur: null,
              neededBy: '2026-05-01',
              status: 'redeemed',
              redeemedAt: '2026-05-01',
            },
            {
              id: 2,
              label: 'New flight',
              points: 180_000,
              economyFareEur: null,
              neededBy: '2027-01-01',
              status: 'planned',
              redeemedAt: null,
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      expect(p.accruedPoints).toBe(200_000);
      expect(p.availableBalance).toBe(50_000);
      const f = p.flights[0]!;
      expect(f.remainingNow).toBe(130_000);
      expect(f.remainingCumulative).toBe(130_000);
      expect(f.onTrack).not.toBe(true);
    });
  });

  describe('activity', () => {
    it('computes daysSinceLastActivity from the most recent of a reading or redemption', () => {
      const p = computePointsGoalProgress(
        goal({
          balances: [{ id: 1, balance: 10_000, recordedAt: '2026-01-01' }], // oldest
          flights: [
            {
              id: 1, label: 'Redeemed', points: 1, economyFareEur: null, neededBy: '2026-01-01',
              status: 'redeemed', redeemedAt: '2026-06-01', note: '', // newest
            },
          ],
        }),
        new Date('2026-07-01'),
      );
      expect(p.daysSinceLastActivity).toBeCloseTo(30, 0); // ~30 days since the 2026-06-01 redemption
    });

    it('is null with no activity recorded at all', () => {
      const p = computePointsGoalProgress(goal(), new Date('2026-07-01'));
      expect(p.daysSinceLastActivity).toBeNull();
    });
  });
});
