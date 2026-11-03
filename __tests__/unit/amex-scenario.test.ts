import { describe, it, expect } from 'vitest';
import { computeAmexCancelScenario } from '../../lib/services/amex-scenario';
import { computePointsGoalProgress, type PointsGoalInput } from '../../lib/services/points-goal-service';
import { AMEX_PLATINUM_MONTHLY_FEE_EUR, SALE_EUR_PER_AVIOS } from '../../lib/avios-facts';

const TODAY = new Date('2026-11-01');

function progressFor(flights: PointsGoalInput['flights'], balance = 0, amexMr = 0) {
  return computePointsGoalProgress(
    {
      balances: [{ id: 1, balance, amexMr, recordedAt: '2026-10-01' }],
      flights,
    },
    TODAY,
  );
}

const oneFlight: PointsGoalInput['flights'] = [
  {
    id: 1,
    label: 'Upgrade',
    points: 80_000,
    economyFareEur: null,
    neededBy: '2027-07-01', // 8 months out
    status: 'planned',
    redeemedAt: null,
  },
];

describe('computeAmexCancelScenario', () => {
  it('stops MR accrual at the cancellation date, so cancelling is never better than keeping Amex', () => {
    const progress = progressFor(oneFlight, 14_000, 10_000);
    const result = computeAmexCancelScenario({
      progress,
      expectedAviosPerMonth: 770,
      expectedMrPerMonth: 3_000,
      cancelDate: '2027-02-01', // 3 months out, before the flight's neededBy
      today: TODAY,
    });

    const f = result.flights[0]!;
    expect(f.projectedCancel).toBeLessThan(f.projectedKeep);
    expect(f.shortfallCancel).toBeGreaterThan(f.shortfallKeep);
    expect(f.extraShortfall).toBeCloseTo(f.shortfallCancel - f.shortfallKeep, 5);
    expect(f.eurToCloseCancel).toBeCloseTo(f.shortfallCancel * SALE_EUR_PER_AVIOS, 5);
  });

  it('gives the same projection as keeping Amex when the cancellation date is after neededBy', () => {
    const progress = progressFor(oneFlight, 14_000, 10_000);
    const result = computeAmexCancelScenario({
      progress,
      expectedAviosPerMonth: 770,
      expectedMrPerMonth: 3_000,
      cancelDate: '2028-01-01', // well after the flight's neededBy
      today: TODAY,
    });

    const f = result.flights[0]!;
    expect(f.projectedCancel).toBeCloseTo(f.projectedKeep, 5);
    expect(f.shortfallCancel).toBeCloseTo(f.shortfallKeep, 5);
    expect(f.extraShortfall).toBeCloseTo(0, 5);
    // The card hasn't been cancelled yet by the time the flight is needed, so no fee is saved.
    expect(f.feeSavedByDate).toBe(0);
  });

  it('only converts the current MR balance when the cancellation date is already in the past', () => {
    const progress = progressFor(oneFlight, 14_000, 10_000);
    const result = computeAmexCancelScenario({
      progress,
      expectedAviosPerMonth: 770,
      expectedMrPerMonth: 3_000,
      cancelDate: '2026-01-01', // before today
      today: TODAY,
    });

    expect(result.mrToTransferAtCancel).toBe(10_000);
  });

  it('accumulates shortfall cumulatively across two flights, by neededBy order', () => {
    const twoFlights: PointsGoalInput['flights'] = [
      { id: 1, label: 'A', points: 40_000, economyFareEur: null, neededBy: '2027-03-01', status: 'planned', redeemedAt: null },
      { id: 2, label: 'B', points: 40_000, economyFareEur: null, neededBy: '2027-09-01', status: 'planned', redeemedAt: null },
    ];
    const progress = progressFor(twoFlights, 0, 0);
    const result = computeAmexCancelScenario({
      progress,
      expectedAviosPerMonth: 770,
      expectedMrPerMonth: 3_000,
      cancelDate: '2027-01-01',
      today: TODAY,
    });

    expect(result.flights[0]!.cumulativeNeeded).toBe(40_000);
    expect(result.flights[1]!.cumulativeNeeded).toBe(80_000);
    expect(result.flights[1]!.shortfallCancel).toBeGreaterThanOrEqual(result.flights[0]!.shortfallCancel);
  });

  it('saves one Amex fee per month between the cancellation date and a later neededBy date', () => {
    const progress = progressFor(oneFlight, 14_000, 10_000);
    const result = computeAmexCancelScenario({
      progress,
      expectedAviosPerMonth: 770,
      expectedMrPerMonth: 3_000,
      cancelDate: '2027-01-01', // 6 months before the flight's neededBy
      today: TODAY,
    });

    const f = result.flights[0]!;
    // ~6 calendar months between the two dates; monthsBetween uses an average month length, so
    // allow a few days' worth of slack rather than asserting an exact figure.
    expect(f.feeSavedByDate).toBeGreaterThan(AMEX_PLATINUM_MONTHLY_FEE_EUR * 5.8);
    expect(f.feeSavedByDate).toBeLessThan(AMEX_PLATINUM_MONTHLY_FEE_EUR * 6.2);
  });
});
