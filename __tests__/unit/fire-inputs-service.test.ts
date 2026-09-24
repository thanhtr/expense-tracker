import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../lib/db', () => ({
  prisma: {
    incomeRule: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../lib/db';
import { deriveFireInputs, fetchEuribor6m, grossFromNet } from '../../lib/services/fire-inputs-service';
import { annuityBalance, computeCurrentAge, rentalLoanInterestInRetirement } from '../../lib/services/fire-service';

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
      { merchantPattern: 'KELA', category: 'Capital income' }, { merchantPattern: 'TENANT', category: null },
    ] as never);
    vi.mocked(prisma.transaction.findMany).mockImplementation((async (args: { where: Record<string, unknown> }) => {
      const w = args.where as { type?: string; category?: string; merchant?: { contains: string } };
      if (w.category === 'Salary') return [tx('2026-07-05', 3000), tx('2026-07-20', 3000), tx('2026-08-05', 6000)];
      if (w.type === 'Income') return [
        { ...tx('2026-07-10', 500), merchant: 'KELA/FPA', category: 'Capital income' },
        { ...tx('2026-08-10', 500), merchant: 'KELA/FPA', category: 'Capital income' },
        // Kela child benefit: same merchant, different category — not rent
        { ...tx('2026-08-12', 94), merchant: 'KELA/FPA', category: 'Benefits' },
        { ...tx('2026-07-11', 200), merchant: 'TENANT OY', category: 'Other' },
        { ...tx('2026-08-11', 200), merchant: 'TENANT OY', category: 'Other' },
      ];
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

  it('counts only income matching a rental rule\'s pattern and category', async () => {
    const { rental } = await deriveFireInputs(cfg);
    // Kela rent 500 + tenant 200; the Kela child benefit (other category) is excluded
    expect(rental.rentMonthly).toBe(700);
  });

  it('subtracts the rented flat\'s fee from cash, and the own-home share only from taxable rent', async () => {
    const { inputs } = await deriveFireInputs(cfg);
    // cash: 700 − 200 × 100%; tax-only: 100 × 15%
    expect(inputs.rentalNetMonthly).toBeCloseTo(500, 6);
    expect(inputs.rentalTaxOnlyDeductionsMonthly).toBeCloseTo(15, 6);
  });

  it('carries the rental loan payment and Euribor-based rate', async () => {
    const { rental, inputs } = await deriveFireInputs(cfg);
    expect(inputs.rentalLoanPaymentMonthly).toBe(300);
    expect(inputs.rentalLoanRate).toBeCloseTo(0.027133333 + 0.006, 9);
    const monthsInRetirement = Math.round((cfg.mortgageEndAge - cfg.retirementAge) * 12);
    const balanceAtRetirement = annuityBalance(300, rental.loanRate, monthsInRetirement);
    expect(rental.loanInterestMonthly).toBeCloseTo((300 * monthsInRetirement - balanceAtRetirement) / monthsInRetirement, 6);
    expect(rental.loanInterestMonthly).toBeLessThan(rental.loanBalance * rental.loanRate / 12);
  });

  it('times out the ECB fetch so /api/fire can\'t hang', async () => {
    const spy = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return { ok: true, text: async () => ECB_CSV };
    });
    vi.stubGlobal('fetch', spy);
    await fetchEuribor6m();
    expect(spy).toHaveBeenCalled();
  });
});

describe('rentalLoanInterestInRetirement', () => {
  const dob = '1990-05-05';
  const currentAge = computeCurrentAge(dob);
  const loan = { dateOfBirth: dob, rentalLoanPaymentMonthly: 300, rentalLoanRate: 0.033, mortgageEndAge: Math.round(currentAge + 22) };

  it('is 0 when the loan ends before retirement', () => {
    expect(rentalLoanInterestInRetirement({ ...loan, retirementAge: loan.mortgageEndAge + 1 })).toBe(0);
  });

  it('is lower for a later retirement age, since the loan is smaller by then', () => {
    const early = rentalLoanInterestInRetirement({ ...loan, retirementAge: loan.mortgageEndAge - 6 });
    const late = rentalLoanInterestInRetirement({ ...loan, retirementAge: loan.mortgageEndAge - 1 });
    expect(early).toBeGreaterThan(late);
    expect(late).toBeGreaterThan(0);
  });
});
