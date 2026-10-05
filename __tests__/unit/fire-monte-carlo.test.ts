import { describe, it, expect } from 'vitest';
import { FIRE_DEFAULTS, NO_DERIVED_INPUTS, computeCurrentAge, computeFireTarget, type FireConfig } from '@/lib/services/fire-service';
import { runMonteCarlo } from '@/lib/services/fire-monte-carlo';

const DEFAULTS: FireConfig = { ...FIRE_DEFAULTS, ...NO_DERIVED_INPUTS };

// retirementAge == currentAge removes the accumulation phase entirely, so the starting
// portfolio passed to runMonteCarlo is exactly what's available at the start of
// drawdown — avoids decades of contributions swamping a deliberately under/over-funded
// test portfolio.
const RETIRED_NOW: FireConfig = { ...DEFAULTS, retirementAge: computeCurrentAge(DEFAULTS.dateOfBirth) };

describe('runMonteCarlo', () => {
  it('with volatility 0, a fully-funded plan always survives and has a zero-width band', () => {
    const config = { ...RETIRED_NOW, returnVolatility: 0, endBufferYears: 0 };
    const target = computeFireTarget(config, 0);
    const result = runMonteCarlo(config, target, 0, 200);

    expect(result.successProbability).toBe(1);
    for (const band of result.bands) {
      expect(band.p10).toBeCloseTo(band.p90, 0);
    }
  });

  it('with volatility 0, a plan funded well below target always fails', () => {
    const config = { ...RETIRED_NOW, returnVolatility: 0, endBufferYears: 0 };
    const target = computeFireTarget(config, 0);
    const result = runMonteCarlo(config, target * 0.5, 0, 200);
    expect(result.successProbability).toBe(0);
  });

  it('with volatility 0, a plan funded well above target always survives', () => {
    const config = { ...RETIRED_NOW, returnVolatility: 0, endBufferYears: 0 };
    const target = computeFireTarget(config, 0);
    const result = runMonteCarlo(config, target * 1.5, 0, 200);
    expect(result.successProbability).toBe(1);
  });

  it('higher volatility lowers success probability for a thinly-funded plan', () => {
    const config = { ...RETIRED_NOW, endBufferYears: 0 };
    // Funded at exactly the 0-volatility target: with 0 volatility it exactly survives
    // (ends at ~0), so any volatility should start pulling some paths below 0.
    const target = computeFireTarget({ ...config, returnVolatility: 0 }, 0);
    const low = runMonteCarlo({ ...config, returnVolatility: 0.05 }, target, 0, 500, 1);
    const high = runMonteCarlo({ ...config, returnVolatility: 0.25 }, target, 0, 500, 1);
    expect(high.successProbability).toBeLessThanOrEqual(low.successProbability);
  });

  it('is deterministic for a fixed seed', () => {
    const config = { ...RETIRED_NOW, returnVolatility: 0.15 };
    const target = computeFireTarget(config, 0);
    const a = runMonteCarlo(config, target, 0, 300, 7);
    const b = runMonteCarlo(config, target, 0, 300, 7);
    expect(a.successProbability).toBe(b.successProbability);
    expect(a.bands).toEqual(b.bands);
  });

  it('bands are sorted p10 <= p50 <= p90 at every age', () => {
    const config = { ...RETIRED_NOW, returnVolatility: 0.2 };
    const target = computeFireTarget(config, 0);
    const result = runMonteCarlo(config, target, 0, 300, 3);
    for (const band of result.bands) {
      expect(band.p10).toBeLessThanOrEqual(band.p50);
      expect(band.p50).toBeLessThanOrEqual(band.p90);
    }
  });
});
