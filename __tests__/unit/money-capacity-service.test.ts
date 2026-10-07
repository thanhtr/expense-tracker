import { describe, it, expect } from 'vitest';
import { deriveMoneyCapacity } from '../../lib/services/money-capacity-service';

function input(overrides: Partial<Parameters<typeof deriveMoneyCapacity>[0]> = {}) {
  return {
    netTwelveMonths: 12_000, // €1,000/mo
    investmentsTwelveMonths: 0,
    bankTotal: 0,
    avgMonthlyIncome: 3_000,
    emergencyFundMonths: 6,
    ...overrides,
  };
}

describe('deriveMoneyCapacity', () => {
  it('nets observed investing out of net income to get monthlyDiscretionary', () => {
    const c = deriveMoneyCapacity(input({ investmentsTwelveMonths: 6_000 })); // €500/mo
    expect(c.monthlyDiscretionary).toBeCloseTo(500, 5);
  });

  it('allows monthlyDiscretionary to go negative when investing exceeds net income', () => {
    const c = deriveMoneyCapacity(input({ investmentsTwelveMonths: 18_000 })); // €1,500/mo > €1,000/mo
    expect(c.monthlyDiscretionary).toBeLessThan(0);
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
});
