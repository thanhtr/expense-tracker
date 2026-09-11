import { describe, it, expect } from 'vitest';
import {
  FIRE_DEFAULTS,
  computeCurrentAge,
  computeFireTarget,
  computePhases,
  computeYearsToFire,
  simulateProjection,
  baristaVariants,
  runFireCalculation,
  grossUpAnnual,
} from '@/lib/services/fire-service';

describe('grossUpAnnual', () => {
  it('applies only the 30% bracket below the €30k taxable-gain threshold', () => {
    // net €17,040, deemed cost 20%: gross = 17040 / (1 - 0.30*0.80) = 17040 / 0.76
    expect(grossUpAnnual(17040, 0.20)).toBeCloseTo(22421.05, 1);
  });

  it('applies the 34% bracket above the €30k taxable-gain threshold', () => {
    // net €54,000, deemed cost 20%: gross = (54000 - 1200) / (1 - 0.34*0.80) = 52800 / 0.728
    expect(grossUpAnnual(54000, 0.20)).toBeCloseTo(72527.47, 1);
  });

  it('is continuous at the bracket boundary (net €28,500 <-> gross €37,500)', () => {
    const justBelow = grossUpAnnual(28500 - 0.01, 0.20);
    const justAbove = grossUpAnnual(28500 + 0.01, 0.20);
    expect(justAbove - justBelow).toBeLessThan(0.1);
    expect(justBelow).toBeCloseTo(37500, 0);
    expect(justAbove).toBeCloseTo(37500, 0);
  });

  it('returns 0 for non-positive net amounts', () => {
    expect(grossUpAnnual(0, 0.20)).toBe(0);
    expect(grossUpAnnual(-100, 0.20)).toBe(0);
  });

  it('higher deemedCostPct (40%) requires lower gross than 20% for the same net', () => {
    // With 40% deemed cost, only 60% of the gross is taxable gain, so less tax is owed.
    // net €30,000, deemed cost 40%: lowBracketFactor = 1 - 0.30*0.60 = 0.82
    //   grossAtThreshold = 30000/0.60 = 50000; netAtThreshold = 50000*0.82 = 41000
    //   30000 < 41000 → low bracket only: gross = 30000/0.82 ≈ 36585
    const gross40 = grossUpAnnual(30000, 0.40);
    const gross20 = grossUpAnnual(30000, 0.20);
    expect(gross40).toBeLessThan(gross20);
    expect(gross40).toBeCloseTo(36585, 0);
  });
});

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

  it('Phase 1A gross withdrawal applies 20% deemed cost then progressive 30/34% tax', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    // net annual = €54,000 (above the €28,500 net-at-threshold), so the 34% bracket
    // applies above €30k of taxable gain: gross = (54000 - 1200) / 0.728 ≈ €72,527/yr
    expect(phases[0]!.grossAnnual).toBeCloseTo(72527.47, 1);
    expect(phases[0]!.grossWithdrawal).toBeCloseTo(6043.96, 1);
  });

  it('Phase 1B gross withdrawal is correct', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    // net annual = €36,000, also above threshold: gross = (36000 - 1200) / 0.728 ≈ €47,802/yr
    expect(phases[1]!.grossAnnual).toBeCloseTo(47802.20, 1);
    expect(phases[1]!.grossWithdrawal).toBeCloseTo(3983.52, 1);
  });

  it('Phase 2 applies pension offset before gross-up', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    // shortfall = €3000 - €1580 = €1420/mo; net annual €17,040 is below the
    // €28,500 net-at-threshold, so only the 30% bracket applies: gross = 17040 / 0.76 ≈ €22,421/yr
    expect(phases[2]!.portfolioShortfall).toBeCloseTo(1420, 0);
    expect(phases[2]!.grossAnnual).toBeCloseTo(22421.05, 1);
    expect(phases[2]!.grossWithdrawal).toBeCloseTo(1868.42, 1);
  });

  it('Phase 2 pension offset is zero before pensionAge for phases 1A/1B', () => {
    const phases = computePhases(FIRE_DEFAULTS);
    expect(phases[0]!.pensionOffset).toBe(0);
    expect(phases[1]!.pensionOffset).toBe(0);
    expect(phases[2]!.pensionOffset).toBe(1580);
  });
});

describe('computeFireTarget', () => {
  it('returns ~965k for Finnish default config (pure FIRE)', () => {
    const target = computeFireTarget(FIRE_DEFAULTS, 0);
    expect(target).toBeGreaterThan(945_000);
    expect(target).toBeLessThan(985_000);
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
    // Starting portfolio large enough to comfortably reach the (now higher, tax-corrected)
    // FIRE target within the accumulation window.
    const years = computeYearsToFire(FIRE_DEFAULTS, 300_000, target);
    expect(years).not.toBeNull();
    expect(years!).toBeGreaterThan(0);
    expect(years!).toBeLessThan(12);
    expect(years!).toBeLessThanOrEqual(FIRE_DEFAULTS.retirementAge - computeCurrentAge(FIRE_DEFAULTS.dateOfBirth));
  });
});

describe('simulateProjection', () => {
  it('starts at current fractional age and ends at lifeExpectancy', () => {
    const pts = simulateProjection(FIRE_DEFAULTS, 82_000);
    expect(pts[0]!.age).toBeCloseTo(computeCurrentAge(FIRE_DEFAULTS.dateOfBirth), 1);
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
