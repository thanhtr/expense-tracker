import { describe, it, expect } from 'vitest';
import {
  AMEX_BONUS_MR_PER_EUR,
  AMEX_MR_PER_EUR,
  TIER_POINTS_MONTHLY_SPEND_THRESHOLD_EUR,
  TIER_POINTS_PER_QUALIFYING_MONTH,
} from '../../lib/avios-facts';

describe('avios-facts new constants', () => {
  it('bonus rate is double the normal Amex rate', () => {
    expect(AMEX_BONUS_MR_PER_EUR).toBe(AMEX_MR_PER_EUR * 2);
  });

  it('tier-points qualifying threshold and award match the explainer prose', () => {
    expect(TIER_POINTS_MONTHLY_SPEND_THRESHOLD_EUR).toBe(1_500);
    expect(TIER_POINTS_PER_QUALIFYING_MONTH).toBe(500);
  });
});
