import { describe, it, expect } from 'vitest';
import {
  classifyTransaction,
  computeAviosEarnReconciliation,
  type CardEarnRuleInput,
  type CardTransactionInput,
} from '../../lib/services/avios-earn-service';
import { AMEX_MR_PER_EUR, AMEX_BONUS_MR_PER_EUR, VISA_AVIOS_PER_EUR } from '../../lib/avios-facts';

describe('classifyTransaction', () => {
  it('returns normal for an unmatched merchant', () => {
    expect(classifyTransaction('RANDOM SHOP', 'Amex', [])).toBe('normal');
  });

  it('matches case-insensitively by substring', () => {
    const rules: CardEarnRuleInput[] = [{ account: 'Amex', merchantPattern: 'british airways', classification: 'bonus' }];
    expect(classifyTransaction('BRITISH AIRWAYS 1234', 'Amex', rules)).toBe('bonus');
  });

  it('only matches rules scoped to the same account', () => {
    const rules: CardEarnRuleInput[] = [{ account: 'Finnair Visa', merchantPattern: 'NORDEA', classification: 'excluded' }];
    expect(classifyTransaction('NORDEA TRANSFER', 'Amex', rules)).toBe('normal');
  });

  it('breaks ties between overlapping patterns by longest match', () => {
    const rules: CardEarnRuleInput[] = [
      { account: 'Amex', merchantPattern: 'AIR', classification: 'normal' },
      { account: 'Amex', merchantPattern: 'AIR FRANCE', classification: 'bonus' },
    ];
    expect(classifyTransaction('AIR FRANCE-KLM', 'Amex', rules)).toBe('bonus');
  });
});

describe('computeAviosEarnReconciliation', () => {
  const months = ['2026-01', '2026-02', '2026-03'];

  it('returns all zeros for no transactions', () => {
    const result = computeAviosEarnReconciliation({ transactions: [], rules: [], tier: 'basic', months });
    expect(result.expectedAviosPerMonth).toBe(0);
    expect(result.expectedMrPerMonth).toBe(0);
    expect(result.qualifyingTierPointMonths).toBe(0);
    expect(result.expectedTierPoints).toBe(0);
  });

  it('returns zeros for an empty months window (division guard)', () => {
    const transactions: CardTransactionInput[] = [
      { account: 'Finnair Visa', merchant: 'SHOP', amount: -500, date: '2026-01-15' },
    ];
    const result = computeAviosEarnReconciliation({ transactions, rules: [], tier: 'basic', months: [] });
    expect(result.expectedAviosPerMonth).toBe(0);
    expect(result.monthsInWindow).toBe(0);
  });

  it('computes expected Avios/mo from Visa spend at the given tier', () => {
    const transactions: CardTransactionInput[] = [
      { account: 'Finnair Visa', merchant: 'SHOP', amount: -3_000, date: '2026-02-10' },
    ];
    const result = computeAviosEarnReconciliation({ transactions, rules: [], tier: 'basic', months });
    expect(result.expectedAviosPerMonth).toBeCloseTo((3_000 * VISA_AVIOS_PER_EUR.basic) / 3, 5);
  });

  it('computes expected MR/mo from Amex spend, splitting normal and bonus rates', () => {
    const transactions: CardTransactionInput[] = [
      { account: 'Amex', merchant: 'NORMAL SHOP', amount: -1_000, date: '2026-01-10' },
      { account: 'Amex', merchant: 'BRITISH AIRWAYS', amount: -1_000, date: '2026-01-15' },
    ];
    const rules: CardEarnRuleInput[] = [{ account: 'Amex', merchantPattern: 'BRITISH AIRWAYS', classification: 'bonus' }];
    const result = computeAviosEarnReconciliation({ transactions, rules, tier: 'basic', months });
    const expected = (1_000 * AMEX_MR_PER_EUR + 1_000 * AMEX_BONUS_MR_PER_EUR) / 3;
    expect(result.expectedMrPerMonth).toBeCloseTo(expected, 5);
  });

  it('excludes a classified row from both Avios/MR totals and the tier-points qualifying check', () => {
    const transactions: CardTransactionInput[] = [
      { account: 'Finnair Visa', merchant: 'NORDEA TRANSFER', amount: -2_000, date: '2026-01-15' },
    ];
    const rules: CardEarnRuleInput[] = [{ account: 'Finnair Visa', merchantPattern: 'NORDEA', classification: 'excluded' }];
    const result = computeAviosEarnReconciliation({ transactions, rules, tier: 'basic', months });
    expect(result.expectedAviosPerMonth).toBe(0);
    expect(result.qualifyingTierPointMonths).toBe(0);
  });

  it('counts a qualifying tier-points month only when Visa spend meets the threshold', () => {
    const transactions: CardTransactionInput[] = [
      { account: 'Finnair Visa', merchant: 'SHOP', amount: -1_500, date: '2026-01-15' },
      { account: 'Finnair Visa', merchant: 'SHOP', amount: -1_499, date: '2026-02-15' },
    ];
    const result = computeAviosEarnReconciliation({ transactions, rules: [], tier: 'basic', months });
    expect(result.qualifyingTierPointMonths).toBe(1);
    expect(result.expectedTierPoints).toBe(500);
  });
});
