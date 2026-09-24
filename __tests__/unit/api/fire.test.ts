import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../lib/db', () => ({
  prisma: {
    asset: {
      findMany: vi.fn(),
    },
    fireConfig: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock('../../../lib/services/aggregation-service', () => ({
  getDashboardStats: vi.fn(),
}));

vi.mock('../../../lib/services/fire-inputs-service', () => ({
  deriveFireInputs: vi.fn(),
}));

import { GET, PUT } from '../../../app/api/fire/route';
import { prisma } from '../../../lib/db';
import { getDashboardStats } from '../../../lib/services/aggregation-service';
import { FIRE_DEFAULTS } from '../../../lib/services/fire-service';
import { deriveFireInputs } from '../../../lib/services/fire-inputs-service';

const DERIVED = {
  inputs: { annualGrossEarnings: 120_000, rentalNetMonthly: 300, rentalLoanInterestMonthly: 50 },
  earnings: { netMonthly: 6200, months: 9, grossAnnual: 120_000 },
  rental: {
    rentMonthly: 450, rentMonths: 9,
    fees: [{ merchant: 'Säästötupa', share: 1, paidMonthly: 150, deductibleMonthly: 150 }],
    netMonthly: 300, loanPaymentMonthly: 300, loanRate: 0.033,
    euribor: { rate: 0.027, period: '2026-08', live: true },
    loanBalance: 50_000, loanInterestMonthly: 50,
  },
};

beforeEach(() => {
  vi.mocked(deriveFireInputs).mockResolvedValue(DERIVED as never);
});

const makeConfig = (overrides = {}) => ({
  id: 1,
  updatedAt: new Date(),
  ...FIRE_DEFAULTS,
  ...overrides,
});

function mockAssets(investmentTotal: number, bankTotal: number) {
  vi.mocked(prisma.asset.findMany).mockImplementation(({ where }: { where: { type: string } }) => {
    if (where.type === 'investment') return Promise.resolve([{ id: 1, balance: investmentTotal }] as never);
    if (where.type === 'bank') return Promise.resolve([{ id: 2, balance: bankTotal }] as never);
    return Promise.resolve([] as never);
  });
}

// byMonthIncome only needs the right length — the route divides totalIncome
// by how many months are present, it doesn't read each entry's amount.
const monthsOfIncome = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ month: `2026-${String(i + 1).padStart(2, '0')}`, amount: 0 }));

function mockIncome(totalIncome: number, monthCount: number) {
  vi.mocked(getDashboardStats).mockResolvedValueOnce({ totalIncome, byMonthIncome: monthsOfIncome(monthCount) } as never);
}

describe('GET /api/fire — portfolio breakdown', () => {
  beforeEach(() => vi.clearAllMocks());

  it('counts bank cash above the emergency buffer toward the portfolio', async () => {
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig({ emergencyFundMonths: 6 }));
    mockAssets(78_131.24, 52_177.11);
    mockIncome(6_000, 12);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    // avgMonthlyIncome = 6000 / 12 = 500; bufferTarget = 6 * 500 = 3000
    expect(body.avgMonthlyIncome).toBe(500);
    expect(body.bufferTarget).toBe(3000);
    expect(body.investmentTotal).toBe(78_131.24);
    expect(body.bankTotal).toBe(52_177.11);
    expect(body.investableCash).toBeCloseTo(52_177.11 - 3000);
    expect(body.currentPortfolio).toBeCloseTo(78_131.24 + (52_177.11 - 3000));
  });

  it('excludes all bank cash when it is under the buffer target', async () => {
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig({ emergencyFundMonths: 6 }));
    mockAssets(10_000, 2_000);
    mockIncome(60_000, 12);

    const res = await GET();
    const body = await res.json();

    // avgMonthlyIncome = 5000; bufferTarget = 30000 — far above the 2000 bank total
    expect(body.investableCash).toBe(0);
    expect(body.currentPortfolio).toBe(10_000);
  });

  it('averages over the months actually covered by data, not a fixed 12', async () => {
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig({ emergencyFundMonths: 1 }));
    mockAssets(0, 5_000);
    // Only 3 months of history — averaging over a hardcoded 12 would understate
    // avgMonthlyIncome (750 instead of 3000) and undersize the buffer.
    mockIncome(9_000, 3);

    const res = await GET();
    const body = await res.json();

    expect(body.avgMonthlyIncome).toBe(3_000);
    expect(body.bufferTarget).toBe(3_000);
    expect(body.investableCash).toBe(2_000);
  });

  it('does not double-count liability or property assets', async () => {
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig({ emergencyFundMonths: 0 }));
    mockAssets(10_000, 5_000);
    mockIncome(0, 0);

    await GET();
    expect(prisma.asset.findMany).toHaveBeenCalledWith({ where: { type: 'investment' } });
    expect(prisma.asset.findMany).toHaveBeenCalledWith({ where: { type: 'bank' } });
    expect(prisma.asset.findMany).not.toHaveBeenCalledWith({ where: { type: 'liability' } });
    expect(prisma.asset.findMany).not.toHaveBeenCalledWith({ where: { type: 'property' } });
  });

  it('requests income stats truncated to a day boundary, so repeated calls hit the aggregation cache', async () => {
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig());
    mockAssets(0, 0);
    mockIncome(0, 0);

    await GET();
    const [dateFrom, dateTo] = vi.mocked(getDashboardStats).mock.calls[0]!;
    for (const d of [dateFrom, dateTo] as Date[]) {
      expect(d.getHours()).toBe(0);
      expect(d.getMinutes()).toBe(0);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
    }
  });
});

describe('PUT /api/fire — recomputes breakdown with updated config', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applies the saved emergencyFundMonths to the buffer calculation', async () => {
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig({ emergencyFundMonths: 3 }));
    mockAssets(0, 3_000);
    mockIncome(12_000, 12);

    const req = new Request('http://localhost/api/fire', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emergencyFundMonths: 3 }),
    });
    const res = await PUT(req as never);
    const body = await res.json();

    // avgMonthlyIncome = 1000; bufferTarget = 3 * 1000 = 3000 — exactly equal to bank total
    expect(body.bufferTarget).toBe(3000);
    expect(body.investableCash).toBe(0);
    expect(body.currentPortfolio).toBe(0);
  });

  it('merges derived earnings and rent into the config and returns their breakdown', async () => {
    const saved = { pensionAccruedMonthly: 1330, lifeExpectancyCoef: 0.9, pensionTaxRate: 0.2, taxpayers: 2 };
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig(saved));
    mockAssets(50_000, 0);
    mockIncome(12_000, 12);

    const req = new Request('http://localhost/api/fire', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(saved),
    });
    const res = await PUT(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.pension.accruedMonthly).toBe(1330);
    expect(body.pension.futureAccrualMonthly).toBeGreaterThan(0);
    expect(body.phases[0].rentalIncome).toBe(300);
    expect(body.config.annualGrossEarnings).toBe(120_000);
    expect(body.config).not.toHaveProperty('deemedCostPct');
    expect(body.deemedCostPct).toBe(0.40);
    expect(body.derived.rental.euribor.period).toBe('2026-08');
  });

  it('ignores attempts to save derived fields', async () => {
    vi.mocked(prisma.fireConfig.upsert).mockResolvedValueOnce(makeConfig());
    mockAssets(0, 0);
    mockIncome(0, 0);

    const req = new Request('http://localhost/api/fire', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deemedCostPct: 0.1, annualGrossEarnings: 1, rentalNetMonthly: 9999 }),
    });
    await PUT(req as never);
    const arg = vi.mocked(prisma.fireConfig.upsert).mock.calls[0]![0] as { update: Record<string, unknown> };
    expect(arg.update).toEqual({});
  });

  it('rejects more than two taxpayers', async () => {
    const req = new Request('http://localhost/api/fire', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxpayers: 3 }),
    });
    const res = await PUT(req as never);
    expect(res.status).toBe(400);
    expect(prisma.fireConfig.upsert).not.toHaveBeenCalled();
  });
});
