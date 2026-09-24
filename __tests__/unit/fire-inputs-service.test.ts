import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/db', () => ({
  prisma: {
    incomeRule: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../lib/db';
import { annuityBalance, deriveFireInputs, fetchEuribor6m, grossFromNet } from '../../lib/services/fire-inputs-service';
import { computeCurrentAge } from '../../lib/services/fire-service';

const tx = (date: string, amount: number) => ({ date: new Date(date), amount });

function mockEcb(csv: string | null) {
  vi.stubGlobal('fetch', vi.fn(async () => (csv === null
    ? { ok: false, text: async () => '' }
    : { ok: true, text: async () => csv })));
}

const ECB_CSV = 'KEY,FREQ,TIME_PERIOD,OBS_VALUE\nFM.M.U2,M,2026-08,2.7133333\n';

describe('grossFromNet', () => {
  it('divides net by 1 − (30% tax + 7.3% pension + 0.89% unemployment)', () => {
    expect(grossFromNet(61_810)).toBeCloseTo(100_000, 0);
  });
});

describe('annuityBalance', () => {
  it('is the present value of the remaining payments', () => {
    // €300/mo, 12 months at 0%: €3,600
    expect(annuityBalance(300, 0, 12)).toBe(3600);
    // At 3.3%, the balance is less than the sum of payments
    const b = annuityBalance(300, 0.033, 264);
    expect(b).toBeLessThan(300 * 264);
    expect(b).toBeGreaterThan(55_000);
  });

  it('is 0 when no months are left', () => {
    expect(annuityBalance(300, 0.03, 0)).toBe(0);
  });
});

describe('fetchEuribor6m', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('parses the latest ECB observation', async () => {
    mockEcb(ECB_CSV);
    const q = await fetchEuribor6m();
    expect(q).toEqual({ rate: 0.027133333, period: '2026-08', live: true });
  });

  it('falls back to the cached value when the API fails', async () => {
    mockEcb(null);
    const q = await fetchEuribor6m();
    expect(q.live).toBe(false);
    expect(q.rate).toBeCloseTo(0.027133, 6);
  });
});

describe('deriveFireInputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEcb(ECB_CSV);
    vi.mocked(prisma.incomeRule.findMany).mockResolvedValue([
      { merchantPattern: 'KELA' }, { merchantPattern: 'TENANT' },
    ] as never);
    vi.mocked(prisma.transaction.findMany).mockImplementation((async (args: { where: Record<string, unknown> }) => {
      const w = args.where as { category?: string; OR?: unknown[]; merchant?: { contains: string } };
      if (w.category === 'Salary') return [tx('2026-07-05', 3000), tx('2026-07-20', 3000), tx('2026-08-05', 6000)];
      if (w.OR) return [tx('2026-07-10', 700), tx('2026-08-10', 700)];
      if (w.merchant?.contains === 'FI73 5723 8183 6277 67') return [tx('2026-07-15', -300), tx('2026-08-15', -300)];
      if (w.merchant?.contains === 'Säästötupa') return [tx('2026-07-01', -200), tx('2026-08-01', -200)];
      if (w.merchant?.contains === 'Matela') return [tx('2026-07-01', -100), tx('2026-08-01', -100)];
      return [];
    }) as never);
  });
  afterEach(() => vi.unstubAllGlobals());

  const dob = '1990-05-05';
  const currentAge = computeCurrentAge(dob);
  const cfg = { dateOfBirth: dob, retirementAge: Math.round(currentAge + 16), mortgageEndAge: Math.round(currentAge + 22) };

  it('averages salary over months with pay and grosses it up', async () => {
    const { earnings, inputs } = await deriveFireInputs(cfg);
    expect(earnings.months).toBe(2);
    expect(earnings.netMonthly).toBe(6000);
    expect(inputs.annualGrossEarnings).toBeCloseTo(grossFromNet(72_000), 6);
  });

  it('nets rent against full and partial housing-company fees', async () => {
    const { rental, inputs } = await deriveFireInputs(cfg);
    expect(rental.rentMonthly).toBe(700);
    // 700 − 200 × 100% − 100 × 15%
    expect(inputs.rentalNetMonthly).toBeCloseTo(485, 6);
  });

  it('uses the average loan interest between retirement and loan end', async () => {
    const { rental, inputs } = await deriveFireInputs(cfg);
    expect(rental.loanRate).toBeCloseTo(0.027133333 + 0.006, 9);
    const monthsInRetirement = Math.round((cfg.mortgageEndAge - cfg.retirementAge) * 12);
    const balanceAtRetirement = annuityBalance(300, rental.loanRate, monthsInRetirement);
    expect(inputs.rentalLoanInterestMonthly).toBeCloseTo((300 * monthsInRetirement - balanceAtRetirement) / monthsInRetirement, 6);
    // Less than the interest today: the loan will be smaller by then
    expect(inputs.rentalLoanInterestMonthly).toBeLessThan(rental.loanBalance * rental.loanRate / 12);
  });

  it('has no loan interest when the loan ends before retirement', async () => {
    const { inputs } = await deriveFireInputs({ ...cfg, mortgageEndAge: cfg.retirementAge - 1 });
    expect(inputs.rentalLoanInterestMonthly).toBe(0);
  });
});
