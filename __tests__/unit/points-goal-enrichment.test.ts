import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/db', () => ({
  prisma: { savingsGoal: { findMany: vi.fn() } },
}));
vi.mock('../../lib/services/aggregation-service', () => ({
  getDashboardStats: vi.fn(),
}));

import { prisma } from '../../lib/db';
import { getDashboardStats } from '../../lib/services/aggregation-service';
import { enrichPointsGoal } from '../../lib/services/points-goal-enrichment';
import { SUBSCRIPTION_EUR_PER_AVIOS } from '../../lib/avios-facts';

const TODAY_ISO_BASIS = { net: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getDashboardStats).mockResolvedValue(TODAY_ISO_BASIS as never);
  vi.mocked(prisma.savingsGoal.findMany).mockResolvedValue([]);
});

function goalWithFlights(flights: Array<{ id: number; points: number; economyFareEur: number | null; neededBy: string }>) {
  return {
    id: 1,
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

describe('enrichPointsGoal cashPlan (regression)', () => {
  it('does not double-count the cumulative Avios shortfall across multiple flights', async () => {
    const enriched = await enrichPointsGoal(
      goalWithFlights([
        { id: 1, points: 40_000, economyFareEur: 500, neededBy: '2027-01-01' },
        { id: 2, points: 40_000, economyFareEur: 500, neededBy: '2027-06-01' },
      ]),
    );

    const expectedSecondFlightCash = 1_000 + 80_000 * SUBSCRIPTION_EUR_PER_AVIOS; // both fares + the real cumulative Avios cost
    expect(enriched.cashPlan!.flights[1]!.cumulativeCashNeeded).toBeCloseTo(expectedSecondFlightCash, 2);
  });
});
