import { describe, it, expect } from 'vitest';
import {
  FIRE_DEFAULTS,
  computeFireTarget,
  computePhases,
  computeYearsToFire,
  simulateProjection,
  baristaVariants,
  runFireCalculation,
} from '@/lib/services/fire-service';

describe('computePhases', () => {
  it('returns 3 phases with correct age boundaries', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    expect(phases).toHaveLength(3);
    expect(phases[0]!.ageFrom).toBe(50);
    expect(phases[0]!.ageTo).toBe(60);
    expect(phases[1]!.ageFrom).toBe(60);
    expect(phases[1]!.ageTo).toBe(65);
    expect(phases[2]!.ageFrom).toBe(65);
    expect(phases[2]!.ageTo).toBe(95);
  });

  it('Phase 1A gross withdrawal matches hankintameno-olettama 20% tax', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    // €4500 net / (1 - 0.20) = €5625
    expect(phases[0]!.grossWithdrawal).toBeCloseTo(5625, 0);
    expect(phases[0]!.grossAnnual).toBeCloseTo(67500, 0);
  });

  it('Phase 1B gross withdrawal is correct', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    // €3000 / 0.80 = €3750
    expect(phases[1]!.grossWithdrawal).toBeCloseTo(3750, 0);
  });

  it('Phase 2 applies pension offset before gross-up', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    // shortfall = €3000 - €1580 = €1420; gross = €1420 / 0.80 = €1775
    expect(phases[2]!.portfolioShortfall).toBeCloseTo(1420, 0);
    expect(phases[2]!.grossWithdrawal).toBeCloseTo(1775, 0);
  });

  it('Phase 2 pension offset is zero before pensionAge for phases 1A/1B', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    expect(phases[0]!.pensionOffset).toBe(0);
    expect(phases[1]!.pensionOffset).toBe(0);
    expect(phases[2]!.pensionOffset).toBe(1580);
  });
});

describe('computeFireTarget', () => {
  it('returns ~903k for Finnish default config (pure FIRE)', () => {
    const target = computeFireTarget(FIRE_DEFAULTS, 0);
    expect(target).toBeGreaterThan(880_000);
    expect(target).toBeLessThan(930_000);
  });

  it('barista income reduces the FIRE target', () => {
    const pure = computeFireTarget(FIRE_DEFAULTS, 0);
    const barista = computeFireTarget(FIRE_DEFAULTS, 1500);
    expect(barista).toBeLessThan(pure);
  });

  it('50% barista target is lower than 33% barista target', () => {
    const b33 = computeFireTarget(FIRE_DEFAULTS, FIRE_DEFAULTS.phase1aNetMonthly * 0.33);
    const b50 = computeFireTarget(FIRE_DEFAULTS, FIRE_DEFAULTS.phase1aNetMonthly * 0.50);
    expect(b50).toBeLessThan(b33);
  });

  it('higher drawdown return reduces FIRE target', () => {
    const low = computeFireTarget({ ...FIRE_DEFAULTS, drawdownReturn: 0.03 }, 0);
    const high = computeFireTarget({ ...FIRE_DEFAULTS, drawdownReturn: 0.05 }, 0);
    expect(high).toBeLessThan(low);
  });
});

describe('computeYearsToFire', () => {
  it('returns 0 when portfolio already meets target', () => {
    const target = computeFireTarget(FIRE_DEFAULTS, 0);
    expect(computeYearsToFire(FIRE_DEFAULTS, target, target)).toBe(0);
  });

  it('returns null when portfolio cannot reach target before retirementAge', () => {
    // €0 starting with €0 monthly contribution will never reach €900k
    const result = computeYearsToFire(
      { ...FIRE_DEFAULTS, monthlyContribution: 0 },
      0,
      900_000,
    );
    expect(result).toBeNull();
  });

  it('returns fractional years less than (retirementAge - currentAge)', () => {
    const target = computeFireTarget(FIRE_DEFAULTS, 0);
    const years = computeYearsToFire(FIRE_DEFAULTS, 82_000, target);
    expect(years).not.toBeNull();
    expect(years!).toBeGreaterThan(0);
    expect(years!).toBeLessThanOrEqual(FIRE_DEFAULTS.retirementAge - FIRE_DEFAULTS.currentAge);
  });
});

describe('simulateProjection', () => {
  it('starts at currentAge and ends at lifeExpectancy', () => {
    const pts = simulateProjection(FIRE_DEFAULTS, 82_000);
    expect(pts[0]!.age).toBe(FIRE_DEFAULTS.currentAge);
    expect(pts[pts.length - 1]!.age).toBe(FIRE_DEFAULTS.lifeExpectancy);
  });

  it('portfolio grows during accumulation phase', () => {
    const pts = simulateProjection(FIRE_DEFAULTS, 82_000);
    const atRetirement = pts.find(p => p.age === FIRE_DEFAULTS.retirementAge)!;
    const atStart = pts[0]!;
    expect(atRetirement.portfolio).toBeGreaterThan(atStart.portfolio);
  });

  it('under-funded portfolio depletes to negative by lifeExpectancy', () => {
    // €0 start can never reach FIRE target — drawdown phase runs out of money
    const pts = simulateProjection(FIRE_DEFAULTS, 0);
    const atEnd = pts[pts.length - 1]!;
    expect(atEnd.portfolio).toBeLessThan(0);
  });

  it('over-funded portfolio stays positive throughout', () => {
    // Starting with 3× FIRE target leaves a large surplus at lifeExpectancy
    const target = computeFireTarget(FIRE_DEFAULTS, 0);
    const pts = simulateProjection(FIRE_DEFAULTS, target * 3);
    const atEnd = pts[pts.length - 1]!;
    expect(atEnd.portfolio).toBeGreaterThan(0);
  });
});

describe('baristaVariants', () => {
  it('returns three named variants', () => {
    const { pure, barista33, barista50 } = baristaVariants(FIRE_DEFAULTS, 82_000);
    expect(pure.label).toBe('Pure FIRE');
    expect(barista33.label).toBe('Barista 33%');
    expect(barista50.label).toBe('Barista 50%');
  });

  it('Pure FIRE has zero active income', () => {
    const { pure } = baristaVariants(FIRE_DEFAULTS, 82_000);
    expect(pure.activeIncomeMonthly).toBe(0);
  });

  it('FIRE targets decrease as active income increases', () => {
    const { pure, barista33, barista50 } = baristaVariants(FIRE_DEFAULTS, 82_000);
    expect(barista33.fireTarget).toBeLessThan(pure.fireTarget);
    expect(barista50.fireTarget).toBeLessThan(barista33.fireTarget);
  });
});

describe('runFireCalculation', () => {
  it('progressPct is 100 when portfolio equals fireTarget', () => {
    const target = computeFireTarget(FIRE_DEFAULTS, 0);
    const result = runFireCalculation(FIRE_DEFAULTS, target);
    expect(result.progressPct).toBeCloseTo(100, 0);
  });

  it('progressPct is 0 for empty portfolio', () => {
    const result = runFireCalculation(FIRE_DEFAULTS, 0);
    expect(result.progressPct).toBe(0);
  });

  it('yearsToFire is null when portfolio never reaches target', () => {
    const result = runFireCalculation(
      { ...FIRE_DEFAULTS, monthlyContribution: 0 },
      0,
    );
    expect(result.yearsToFire).toBeNull();
  });

  it('result shape is complete', () => {
    const result = runFireCalculation(FIRE_DEFAULTS, 82_000);
    expect(result).toHaveProperty('fireTarget');
    expect(result).toHaveProperty('currentPortfolio', 82_000);
    expect(result).toHaveProperty('progressPct');
    expect(result).toHaveProperty('phases');
    expect(result).toHaveProperty('pureFire');
    expect(result).toHaveProperty('barista33');
    expect(result).toHaveProperty('barista50');
    expect(result).toHaveProperty('projection');
    expect(result.phases).toHaveLength(3);
  });
});
