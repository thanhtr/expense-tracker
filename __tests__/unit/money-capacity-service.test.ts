import { describe, it, expect } from 'vitest';
import { deriveMoneyCapacity } from '../../lib/services/money-capacity-service';

function input(overrides: Partial<Parameters<typeof deriveMoneyCapacity>[0]> = {}) {
  return {
    netOverWindow: 12_000, // €1,000/mo over 12 months
    monthCount: 12,
    monthlyInvestments: Array(12).fill(0),
    bankTotal: 0,
    liquidAssetTotal: 0,
    avgMonthlyIncome: 3_000,
    emergencyFundMonths: 6,
    ...overrides,
  };
}

describe('deriveMoneyCapacity', () => {
  it('divides net by the actual month count, not a fixed 12', () => {
    const c = deriveMoneyCapacity(input({ netOverWindow: 2_700 * 9, monthCount: 9 }));
    expect(c.monthlySurplus).toBeCloseTo(2_700, 5);
  });

  it('uses the median monthly investment, ignoring a one-off lump', () => {
    // 8 months at €2,000, one lump month at €21,500 — median stays at the regular €2,000.
    const monthlyInvestments = [2_000, 2_000, 2_000, 2_000, 21_500, 2_000, 2_000, 2_000, 2_000];
    const c = deriveMoneyCapacity(input({ monthlyInvestments, monthCount: 9 }));
    expect(c.regularInvesting).toBe(2_000);
  });

  it('computes freeMonthlyFlow as surplus minus regular investing, and allows it to go negative', () => {
    const c = deriveMoneyCapacity(
      input({ netOverWindow: 2_700 * 9, monthCount: 9, monthlyInvestments: Array(9).fill(2_000) }),
    );
    expect(c.freeMonthlyFlow).toBeCloseTo(700, 5);

    const c2 = deriveMoneyCapacity(
      input({ netOverWindow: 1_000 * 9, monthCount: 9, monthlyInvestments: Array(9).fill(2_000) }),
    );
    expect(c2.freeMonthlyFlow).toBeLessThan(0);
  });

  it('excludes the emergency-fund buffer from liquidBufferAvailable', () => {
    // Buffer target = 6 * 3,000 = 18,000; bank has 20,000 → 2,000 spare.
    const c = deriveMoneyCapacity(input({ bankTotal: 20_000 }));
    expect(c.liquidBufferAvailable).toBeCloseTo(2_000, 5);
  });

  it('floors liquidBufferAvailable at 0 when bank balance is below the buffer', () => {
    const c = deriveMoneyCapacity(input({ bankTotal: 5_000 })); // buffer target 18,000
    expect(c.liquidBufferAvailable).toBe(0);
  });

  it('passes liquidAssetTotal through unchanged as liquidNetWorth', () => {
    const c = deriveMoneyCapacity(input({ liquidAssetTotal: 123_456 }));
    expect(c.liquidNetWorth).toBe(123_456);
  });

  it('returns 0 surplus when there are no completed months at all', () => {
    const c = deriveMoneyCapacity(input({ netOverWindow: 0, monthCount: 0, monthlyInvestments: [] }));
    expect(c.monthlySurplus).toBe(0);
    expect(c.regularInvesting).toBe(0);
  });
});
