import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/db', () => ({
  prisma: {
    asset: { findMany: vi.fn() },
    fireConfig: { findUnique: vi.fn() },
    pointsGoal: { findMany: vi.fn() },
  },
}));
vi.mock('../../lib/services/aggregation-service', () => ({
  getDashboardStats: vi.fn(),
}));

import { prisma } from '../../lib/db';
import { getDashboardStats } from '../../lib/services/aggregation-service';
import { enrichPointsGoal, enrichPointsGoals } from '../../lib/services/points-goal-enrichment';
import { SUBSCRIPTION_EUR_PER_AVIOS } from '../../lib/avios-facts';

const BASE_STATS = { net: 12_000, totalInvestments: 0, totalIncome: 36_000, byMonthIncome: Array(12).fill({ month: '', amount: 3_000 }) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDashboardStats).mockResolvedValue(BASE_STATS as never);
  vi.mocked(prisma.asset.findMany).mockResolvedValue([]);
  vi.mocked(prisma.fireConfig.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.pointsGoal.findMany).mockResolvedValue([]);
});

function goalWithFlights(
  id: number,
  flights: Array<{ id: number; points: number; economyFareEur: number | null; neededBy: string }>,
) {
  return {
    id,
    unit: 'Avios',
    balances: [],
    flights: flights.map((f) => ({
      ...f,
      label: `Flight ${f.id}`,
      status: 'planned',
      redeemedAt: null,
    })),
  };
}

describe('enrichPointsGoal cashPlan', () => {
  it('derives monthlyDiscretionary and liquidBufferAvailable from real data, not SavingsGoal', async () => {
    vi.mocked(getDashboardStats).mockResolvedValueOnce({ ...BASE_STATS, net: 12_000, totalInvestments: 6_000 } as never); // €1,000/mo net, €500/mo invested
    vi.mocked(prisma.asset.findMany).mockResolvedValueOnce([{ balance: 20_000 } as never]); // bank
    vi.mocked(prisma.fireConfig.findUnique).mockResolvedValueOnce({ emergencyFundMonths: 6 } as never);

    const enriched = await enrichPointsGoal(goalWithFlights(1, []));
    expect(enriched.cashPlan!.monthlyDiscretionary).toBeCloseTo(500, 2);
    // Buffer target = 6 * (36,000/12) = 18,000; bank has 20,000 → 2,000 spare.
    expect(enriched.cashPlan!.liquidBufferAvailable).toBeCloseTo(2_000, 2);
  });

  it('does not double-count the cumulative Avios shortfall across multiple flights in one goal', async () => {
    const enriched = await enrichPointsGoal(
      goalWithFlights(1, [
        { id: 1, points: 40_000, economyFareEur: 500, neededBy: '2027-01-01' },
        { id: 2, points: 40_000, economyFareEur: 500, neededBy: '2027-06-01' },
      ]),
    );

    const expectedSecondFlightCash = 1_000 + 80_000 * SUBSCRIPTION_EUR_PER_AVIOS; // both fares + the real cumulative Avios cost
    expect(enriched.cashPlan!.flights[1]!.cumulativeCashNeeded).toBeCloseTo(expectedSecondFlightCash, 2);
  });

  it('computes each flight\'s incremental Avios shortfall within its own goal, even when flights from different goals interleave by date (regression)', async () => {
    // goalB's flight (50,000 shortfall) falls chronologically BEFORE goalA's flight (100,000
    // shortfall, in a completely separate goal) — diffing against a single cross-goal running
    // total would wrongly subtract B's shortfall from A's, understating A's real need.
    const goalA = goalWithFlights(1, [{ id: 100, points: 100_000, economyFareEur: null, neededBy: '2026-12-01' }]);
    const goalB = goalWithFlights(2, [{ id: 200, points: 50_000, economyFareEur: null, neededBy: '2026-07-01' }]);

    const [enrichedA] = await enrichPointsGoals([goalA, goalB]);

    const flightA = enrichedA!.cashPlan!.flights.find((f) => f.id === 100)!;
    expect(flightA.cashNeeded).toBeCloseTo(100_000 * SUBSCRIPTION_EUR_PER_AVIOS, 2);
  });

  it('shares one discretionary pool across multiple Avios goals instead of each claiming the full amount (regression)', async () => {
    const goalA = goalWithFlights(1, [{ id: 10, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);
    const goalB = goalWithFlights(2, [{ id: 20, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);

    const [enrichedA, enrichedB] = await enrichPointsGoals([goalA, goalB]);

    // net income €12,000/yr = €1,000/mo, ~1 month until the date → ~€1,000 available total,
    // split across BOTH flights (€2,000 combined need) — neither goal should see itself as
    // independently "on track" using the full €1,000/mo as if the other flight didn't exist.
    const aOnTrack = enrichedA!.cashPlan!.flights[0]!.onTrack;
    const bOnTrack = enrichedB!.cashPlan!.flights[0]!.onTrack;
    expect(aOnTrack && bOnTrack).toBe(false);
  });

  it('orders same-date flights across goals consistently regardless of which goal is queried (regression)', async () => {
    // Both flights share the exact same neededBy date. enrichPointsGoal always puts "self" first
    // in the merged goals list, so without an id tiebreaker, each goal would see its own flight
    // sort first and claim the buffer ahead of the other — both could report onTrack even when
    // their combined need exceeds what's available.
    const goalLowerId = goalWithFlights(1, [{ id: 10, points: 0, economyFareEur: 15_000, neededBy: '2026-11-01' }]);
    const goalHigherId = goalWithFlights(2, [{ id: 20, points: 0, economyFareEur: 15_000, neededBy: '2026-11-01' }]);
    vi.mocked(getDashboardStats).mockResolvedValue({ ...BASE_STATS, net: 0 } as never); // no monthly flow, buffer-only
    vi.mocked(prisma.asset.findMany).mockResolvedValue([{ balance: 20_000 } as never]); // buffer ~20,000 (no emergencyFundMonths config -> default *0 income = 0 target)

    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([goalHigherId as never]);
    const enrichedFromLower = await enrichPointsGoal(goalLowerId);
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([goalLowerId as never]);
    const enrichedFromHigher = await enrichPointsGoal(goalHigherId);

    // The lower-id flight (10) must win the tie identically whichever goal initiated the query.
    expect(enrichedFromLower.cashPlan!.flights[0]!.cumulativeCashNeeded).toBeCloseTo(15_000, 2);
    expect(enrichedFromHigher.cashPlan!.onTrack).toBe(false);
  });

  it('pulls in sibling Avios goals for a single-goal mutation response too, not just the full list (regression)', async () => {
    // Simulates a route like POST .../flights calling enrichPointsGoal(goal) for just the one
    // goal that was mutated — it must still see goalB's competing flight via prisma, or it'll
    // compute a cashPlan as if it alone owns the full discretionary pool.
    const goalA = goalWithFlights(1, [{ id: 10, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);
    const goalBRow = goalWithFlights(2, [{ id: 20, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([goalBRow] as never);

    const enrichedA = await enrichPointsGoal(goalA);

    expect(prisma.pointsGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unit: 'Avios', id: { not: 1 } } }),
    );
    // Same shared-pool assertion as the plural-call regression test above, but through the
    // singular enrichPointsGoal path a mutation route actually uses.
    expect(enrichedA.cashPlan!.flights[0]!.onTrack).toBe(false);
  });
});
