import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/db', () => ({
  prisma: {
    asset: { findMany: vi.fn() },
    fireConfig: { findUnique: vi.fn() },
    pointsGoal: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
    cardEarnRule: { findMany: vi.fn() },
    finnairPlusTier: { findUnique: vi.fn() },
  },
}));
vi.mock('../../lib/services/aggregation-service', () => ({
  getDashboardStats: vi.fn(),
  getEarliestTransactionDate: vi.fn(),
}));

import { prisma } from '../../lib/db';
import { getDashboardStats, getEarliestTransactionDate } from '../../lib/services/aggregation-service';
import { enrichPointsGoal, enrichPointsGoals } from '../../lib/services/points-goal-enrichment';
import { SUBSCRIPTION_EUR_PER_AVIOS } from '../../lib/avios-facts';

// €2,700/mo net surplus, €8,000/mo income, over a full rolling 12-month window.
const BASE_STATS = { net: 2_700 * 12, totalIncome: 8_000 * 12 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDashboardStats).mockResolvedValue(BASE_STATS as never);
  // Far enough in the past that the rolling 12-month window is never clamped by real history.
  vi.mocked(getEarliestTransactionDate).mockResolvedValue(new Date('2020-01-01'));
  vi.mocked(prisma.asset.findMany).mockImplementation(async ({ where }: { where: { type: unknown } }) => {
    // Called twice per capacity fetch: once for 'bank' (the buffer calc), once for the liquid
    // types set (net-worth context) — tests override per-call amounts via mockResolvedValueOnce
    // when they care about a specific total; this default keeps both calls at 0.
    void where;
    return [];
  });
  vi.mocked(prisma.fireConfig.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.pointsGoal.findMany).mockResolvedValue([]);
  vi.mocked(prisma.transaction.findMany).mockResolvedValue([]); // no Investments/card activity by default
  vi.mocked(prisma.cardEarnRule.findMany).mockResolvedValue([]);
  vi.mocked(prisma.finnairPlusTier.findUnique).mockResolvedValue(null); // defaults to 'basic'
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
  it('derives monthlySurplus and liquidBufferAvailable from real data, not SavingsGoal', async () => {
    vi.mocked(prisma.asset.findMany).mockResolvedValueOnce([{ balance: 20_000 } as never]); // bank
    vi.mocked(prisma.asset.findMany).mockResolvedValueOnce([{ balance: 20_000 } as never]); // liquid types
    vi.mocked(prisma.fireConfig.findUnique).mockResolvedValueOnce({ emergencyFundMonths: 6 } as never);

    const enriched = await enrichPointsGoal(goalWithFlights(1, []));
    expect(enriched.cashPlan!.monthlySurplus).toBeCloseTo(2_700, 2);
    expect(enriched.cashPlan!.regularInvesting).toBe(0); // no mocked Investments activity
    expect(enriched.cashPlan!.freeMonthlyFlow).toBeCloseTo(2_700, 2);
    // Buffer target = 6 * 8,000 = 48,000; bank has 20,000 → fully inside the buffer, 0 spare.
    expect(enriched.cashPlan!.liquidBufferAvailable).toBe(0);
    expect(enriched.cashPlan!.liquidNetWorth).toBe(20_000);
  });

  it('does not crash when there are no transactions at all (regression: null earliestDataDate)', async () => {
    vi.mocked(getEarliestTransactionDate).mockResolvedValueOnce(null);
    vi.mocked(getDashboardStats).mockResolvedValueOnce({ net: 0, totalIncome: 0 } as never);

    const enriched = await enrichPointsGoal(goalWithFlights(1, []));
    expect(enriched.cashPlan!.monthlySurplus).toBe(0);
    // The real query call (not just the mock) must receive a real Date, not null, as `gte`.
    expect(vi.mocked(getDashboardStats).mock.calls[0]![0]).toBeInstanceOf(Date);
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

  it('shares one capacity pool across multiple Avios goals instead of each claiming the full amount (regression)', async () => {
    // Zero monthly flow and zero buffer, so two €1,000-fare flights on the same date can't both
    // be 'funded' — if each goal computed its own cash plan independently, each would see
    // itself as the only claimant on the (nonexistent) capacity and misreport 'funded'.
    vi.mocked(getDashboardStats).mockResolvedValue({ net: 0, totalIncome: 0 } as never);
    const goalA = goalWithFlights(1, [{ id: 10, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);
    const goalB = goalWithFlights(2, [{ id: 20, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);

    const [enrichedA, enrichedB] = await enrichPointsGoals([goalA, goalB]);

    const aFunded = enrichedA!.cashPlan!.flights[0]!.tier === 'funded';
    const bFunded = enrichedB!.cashPlan!.flights[0]!.tier === 'funded';
    expect(aFunded && bFunded).toBe(false);
  });

  it('orders same-date flights across goals consistently regardless of which goal is queried (regression)', async () => {
    // Both flights share the exact same neededBy date. enrichPointsGoal always puts "self" first
    // in the merged goals list, so without an id tiebreaker, each goal would see its own flight
    // sort first and claim the buffer ahead of the other.
    const goalLowerId = goalWithFlights(1, [{ id: 10, points: 0, economyFareEur: 15_000, neededBy: '2026-11-01' }]);
    const goalHigherId = goalWithFlights(2, [{ id: 20, points: 0, economyFareEur: 15_000, neededBy: '2026-11-01' }]);
    vi.mocked(getDashboardStats).mockResolvedValue({ net: 0, totalIncome: 0 } as never); // no monthly flow, buffer-only
    vi.mocked(prisma.asset.findMany).mockResolvedValue([{ balance: 20_000 } as never]); // buffer ~20,000 for both calls

    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([goalHigherId as never]);
    const enrichedFromLower = await enrichPointsGoal(goalLowerId);
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([goalLowerId as never]);
    const enrichedFromHigher = await enrichPointsGoal(goalHigherId);

    // The lower-id flight (10) must win the tie identically whichever goal initiated the query.
    expect(enrichedFromLower.cashPlan!.flights[0]!.cumulativeCashNeeded).toBeCloseTo(15_000, 2);
    expect(enrichedFromHigher.cashPlan!.allFundedOrTradeoff).toBe(false);
  });

  it('pulls in sibling Avios goals for a single-goal mutation response too, not just the full list (regression)', async () => {
    // Simulates a route like POST .../flights calling enrichPointsGoal(goal) for just the one
    // goal that was mutated — it must still see goalB's competing flight via prisma, or it'll
    // compute a cashPlan as if it alone owns the full capacity.
    vi.mocked(getDashboardStats).mockResolvedValue({ net: 0, totalIncome: 0 } as never);
    const goalA = goalWithFlights(1, [{ id: 10, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);
    const goalBRow = goalWithFlights(2, [{ id: 20, points: 0, economyFareEur: 1_000, neededBy: '2026-08-01' }]);
    vi.mocked(prisma.pointsGoal.findMany).mockResolvedValueOnce([goalBRow] as never);

    const enrichedA = await enrichPointsGoal(goalA);

    expect(prisma.pointsGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { unit: 'Avios', id: { not: 1 } } }),
    );
    // Same shared-pool assertion as the plural-call regression test above, but through the
    // singular enrichPointsGoal path a mutation route actually uses.
    expect(enrichedA.cashPlan!.flights[0]!.tier).not.toBe('funded');
  });
});

describe('earn reconciliation', () => {
  it('defaults to the basic tier and attaches earnReconciliation to an Avios goal', async () => {
    vi.mocked(prisma.finnairPlusTier.findUnique).mockResolvedValueOnce(null);
    const enriched = await enrichPointsGoal(goalWithFlights(1, []));
    expect(enriched.earnReconciliation).toBeDefined();
    expect(enriched.earnReconciliation!.expectedAviosPerMonth).toBe(0);
  });

  it('classifies Finnair Visa spend at the Silver rate when the tier is set to silver', async () => {
    vi.mocked(prisma.finnairPlusTier.findUnique).mockResolvedValue({ id: 1, tier: 'silver' } as never);
    vi.mocked(prisma.transaction.findMany).mockResolvedValue([
      { account: 'Finnair Visa', merchant: 'SHOP', amount: -1_000, date: new Date('2026-05-15') },
    ] as never);

    const enriched = await enrichPointsGoal(goalWithFlights(1, []));
    // 1.2 Avios/€ at Silver vs 1.0 at Basic — over however many completed months are in the window.
    expect(enriched.earnReconciliation!.expectedAviosPerMonth).toBeGreaterThan(0);
  });

  it('excludes a classified merchant from both Avios and tier-point qualifying spend', async () => {
    vi.mocked(prisma.transaction.findMany).mockImplementation(async ({ where }: { where: { category?: string } }) => {
      // First call is fetchMonthlyInvestments (category: 'Investments'); second is the card fetch.
      if (where.category === 'Investments') return [];
      return [
        { account: 'Finnair Visa', merchant: 'NORDEA TRANSFER', amount: -2_000, date: new Date('2026-05-15') },
      ];
    });
    vi.mocked(prisma.cardEarnRule.findMany).mockResolvedValueOnce([
      { account: 'Finnair Visa', merchantPattern: 'NORDEA', classification: 'excluded' },
    ] as never);

    const enriched = await enrichPointsGoal(goalWithFlights(1, []));
    expect(enriched.earnReconciliation!.expectedAviosPerMonth).toBe(0);
    expect(enriched.earnReconciliation!.qualifyingTierPointMonths).toBe(0);
  });

  it('attaches tierPointsReconciliation to a Tier points goal, not strategy/cashPlan', async () => {
    const goal = { ...goalWithFlights(1, []), unit: 'Tier points' };
    const enriched = await enrichPointsGoal(goal);
    expect(enriched.tierPointsReconciliation).toBeDefined();
    expect(enriched.strategy).toBeUndefined();
    expect(enriched.cashPlan).toBeUndefined();
  });
});
