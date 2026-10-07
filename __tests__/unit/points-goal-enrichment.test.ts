import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/db', () => ({
  prisma: {
    asset: { findMany: vi.fn() },
    fireConfig: { findUnique: vi.fn() },
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
});
