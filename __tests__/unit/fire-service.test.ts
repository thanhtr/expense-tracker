import { describe, it, expect } from 'vitest';
import {
  FIRE_DEFAULTS,
  type FireConfig,
  computeCurrentAge,
  computeFireTarget,
  computePhases,
  computeEarliestFire,
  computePension,
  simulateProjection,
  baristaVariants,
  runFireCalculation,
  grossUpAnnual,
  capitalIncomeTax,
} from '@/lib/services/fire-service';

// Hand-checkable config: single taxpayer, 20% deemed cost, no rent, and a pension that
// nets exactly €1,580/mo (no future accrual, coefficient 1, no tax).
const MATH_CONFIG: FireConfig = {
  ...FIRE_DEFAULTS,
  retirementAge: 50,
  mortgageEndAge: 60,
  pensionAge: 65,
  deemedCostPct: 0.20,
  taxpayers: 1,
  phase1aNetMonthly: 4500,
  phase1bNetMonthly: 3000,
  phase2NetMonthly: 3000,
  pensionAccruedMonthly: 1580,
  annualGrossEarnings: 0,
  lifeExpectancyCoef: 1,
  pensionTaxRate: 0,
  rentalNetMonthly: 0,
};

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

  it('splitting across two taxpayers keeps more of the gain in the 30% bracket', () => {
    // net €54,000 @ 40%: single = (54000 - 1200) / 0.796 ≈ 66332; two × (27000 / 0.82) ≈ 65854
    const single = grossUpAnnual(54000, 0.40);
    const couple = grossUpAnnual(54000, 0.40, { taxpayers: 2 });
    expect(single).toBeCloseTo(66331.66, 1);
    expect(couple).toBeCloseTo(65853.66, 1);
  });

  it('two taxpayers never need more gross than one', () => {
    for (const net of [10_000, 40_000, 80_000, 150_000]) {
      expect(grossUpAnnual(net, 0.40, { taxpayers: 2 })).toBeLessThanOrEqual(grossUpAnnual(net, 0.40) + 1e-6);
    }
  });

  it('rental income offsets the need but uses up the threshold', () => {
    // €12k rent nets €8,400 at 30%; the sale covers the remaining €21,600 at the low rate
    const gross = grossUpAnnual(30000, 0.40, { otherCapitalIncome: 12000 });
    expect(gross).toBeCloseTo((30000 - 12000 * 0.7) / 0.82, 1);
    // Round-trip: sale + rent − tax on the combined taxable income == need
    const tax = capitalIncomeTax(gross * 0.6 + 12000);
    expect(gross + 12000 - tax).toBeCloseTo(30000, 1);
  });

  it('rent pushing taxable income over the threshold round-trips through the 34% bracket', () => {
    const gross = grossUpAnnual(60000, 0.40, { otherCapitalIncome: 24000 });
    const tax = capitalIncomeTax(gross * 0.6 + 24000);
    expect(gross + 24000 - tax).toBeCloseTo(60000, 1);
  });

  it('returns 0 when after-tax rent alone covers the need', () => {
    expect(grossUpAnnual(8000, 0.40, { otherCapitalIncome: 12000 })).toBe(0);
  });
});

describe('computePension', () => {
  it('with no earnings, equals accrued × coefficient, then taxed', () => {
    const p = computePension({ ...FIRE_DEFAULTS, pensionAccruedMonthly: 1000, annualGrossEarnings: 0, lifeExpectancyCoef: 0.9, pensionTaxRate: 0.2 });
    expect(p.futureAccrualMonthly).toBe(0);
    expect(p.grossMonthly).toBeCloseTo(900, 6);
    expect(p.netMonthly).toBeCloseTo(720, 6);
  });

  it('accrues 1.5% of gross earnings per year until retirement', () => {
    const cfg = { ...FIRE_DEFAULTS, annualGrossEarnings: 100_000 };
    const years = cfg.retirementAge - computeCurrentAge(cfg.dateOfBirth);
    const p = computePension(cfg);
    expect(p.futureAccrualMonthly).toBeCloseTo(100_000 * 0.015 / 12 * years, 6);
  });

  it('retiring later accrues a larger pension', () => {
    const cfg = { ...FIRE_DEFAULTS, annualGrossEarnings: 100_000 };
    expect(computePension({ ...cfg, retirementAge: 55 }).netMonthly)
      .toBeGreaterThan(computePension({ ...cfg, retirementAge: 50 }).netMonthly);
  });
});

describe('computePhases', () => {
  it('returns 3 phases with correct age boundaries', () => {
    const phases = computePhases(MATH_CONFIG);
    expect(phases).toHaveLength(3);
    expect(phases[0]!.ageFrom).toBe(MATH_CONFIG.retirementAge);
    expect(phases[0]!.ageTo).toBe(MATH_CONFIG.mortgageEndAge);
    expect(phases[1]!.ageFrom).toBe(MATH_CONFIG.mortgageEndAge);
    expect(phases[1]!.ageTo).toBe(MATH_CONFIG.pensionAge);
    expect(phases[2]!.ageFrom).toBe(MATH_CONFIG.pensionAge);
    expect(phases[2]!.ageTo).toBe(MATH_CONFIG.lifeExpectancy);
  });

  it('Phase 1A gross withdrawal applies 20% deemed cost then progressive 30/34% tax', () => {
    const phases = computePhases(MATH_CONFIG);
    // net annual = €54,000 (above the €28,500 net-at-threshold), so the 34% bracket
    // applies above €30k of taxable gain: gross = (54000 - 1200) / 0.728 ≈ €72,527/yr
    expect(phases[0]!.grossAnnual).toBeCloseTo(72527.47, 1);
    expect(phases[0]!.grossWithdrawal).toBeCloseTo(6043.96, 1);
  });

  it('Phase 1B gross withdrawal is correct', () => {
    const phases = computePhases(MATH_CONFIG);
    // net annual = €36,000, also above threshold: gross = (36000 - 1200) / 0.728 ≈ €47,802/yr
    expect(phases[1]!.grossAnnual).toBeCloseTo(47802.20, 1);
    expect(phases[1]!.grossWithdrawal).toBeCloseTo(3983.52, 1);
  });

  it('Phase 2 applies pension offset before gross-up', () => {
    const phases = computePhases(MATH_CONFIG);
    // shortfall = €3000 - €1580 = €1420/mo; net annual €17,040 is below the
    // €28,500 net-at-threshold, so only the 30% bracket applies: gross = 17040 / 0.76 ≈ €22,421/yr
    expect(phases[2]!.portfolioShortfall).toBeCloseTo(1420, 0);
    expect(phases[2]!.grossAnnual).toBeCloseTo(22421.05, 1);
    expect(phases[2]!.grossWithdrawal).toBeCloseTo(1868.42, 1);
  });

  it('rental income lowers every phase\'s gross withdrawal', () => {
    const base = computePhases(MATH_CONFIG);
    const withRent = computePhases({ ...MATH_CONFIG, rentalNetMonthly: 500 });
    withRent.forEach((p, i) => expect(p.grossWithdrawal).toBeLessThan(base[i]!.grossWithdrawal));
  });

  it('Phase 2 pension offset is zero before pensionAge for phases 1A/1B', () => {
    const phases = computePhases(MATH_CONFIG);
    expect(phases[0]!.pensionOffset).toBe(0);
    expect(phases[1]!.pensionOffset).toBe(0);
    expect(phases[2]!.pensionOffset).toBe(1580);
  });
});

describe('computeFireTarget', () => {
  it('returns ~965k for MATH_CONFIG (4500/3000/3000 spending)', () => {
    const target = computeFireTarget(MATH_CONFIG, 0);
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

  it('a later pension age raises the FIRE target', () => {
    expect(computeFireTarget({ ...MATH_CONFIG, pensionAge: 68 }))
      .toBeGreaterThan(computeFireTarget(MATH_CONFIG));
  });

  it('40% deemed cost and two taxpayers lower the FIRE target', () => {
    const base = computeFireTarget(MATH_CONFIG);
    const fifo = computeFireTarget({ ...MATH_CONFIG, deemedCostPct: 0.40 });
    const couple = computeFireTarget({ ...MATH_CONFIG, deemedCostPct: 0.40, taxpayers: 2 });
    expect(fifo).toBeLessThan(base);
    expect(couple).toBeLessThanOrEqual(fifo);
  });

  it('higher drawdown return reduces FIRE target', () => {
    const low = computeFireTarget({ ...FIRE_DEFAULTS, drawdownReturn: 0.03 }, 0);
    const high = computeFireTarget({ ...FIRE_DEFAULTS, drawdownReturn: 0.05 }, 0);
    expect(high).toBeLessThan(low);
  });
});

describe('computeEarliestFire', () => {
  it('returns 0 years when the portfolio already covers retiring today', () => {
    const currentAge = computeCurrentAge(FIRE_DEFAULTS.dateOfBirth);
    const targetNow = computeFireTarget({ ...FIRE_DEFAULTS, deemedCostPct: 0.20, retirementAge: currentAge });
    const result = computeEarliestFire(FIRE_DEFAULTS, targetNow * 1.01);
    expect(result).not.toBeNull();
    expect(result!.yearsToFire).toBe(0);
  });

  it('returns null when the target cannot be reached before pension age', () => {
    expect(computeEarliestFire({ ...FIRE_DEFAULTS, monthlyContribution: 0 }, 0)).toBeNull();
  });

  it('target equals the FIRE target for retiring at the found age', () => {
    const result = computeEarliestFire(MATH_CONFIG, 300_000)!;
    expect(result).not.toBeNull();
    const direct = computeFireTarget({ ...MATH_CONFIG, retirementAge: result.retirementAge });
    expect(result.fireTarget).toBeCloseTo(direct, 0);
  });

  it('retiring before the configured age needs more than the configured-age target', () => {
    const result = computeEarliestFire(MATH_CONFIG, 300_000)!;
    expect(result.retirementAge).toBeLessThan(MATH_CONFIG.retirementAge);
    expect(result.fireTarget).toBeGreaterThan(computeFireTarget(MATH_CONFIG));
  });

  it('is the first month the projected portfolio covers that month\'s target', () => {
    const cfg = MATH_CONFIG;
    const result = computeEarliestFire(cfg, 300_000)!;
    const currentAge = computeCurrentAge(cfg.dateOfBirth);
    const r = Math.pow(1 + cfg.accumulationReturn, 1 / 12) - 1;
    const portfolioAt = (m: number) => 300_000 * Math.pow(1 + r, m) + cfg.monthlyContribution * (Math.pow(1 + r, m) - 1) / r;
    const m = Math.round(result.yearsToFire * 12);
    const targetBefore = computeFireTarget({ ...cfg, retirementAge: currentAge + (m - 1) / 12 });
    expect(portfolioAt(m)).toBeGreaterThanOrEqual(result.fireTarget);
    expect(portfolioAt(m - 1)).toBeLessThan(targetBefore);
  });

  it('uses at most 20% deemed cost for candidate ages under 10 years away', () => {
    const currentAge = computeCurrentAge(MATH_CONFIG.dateOfBirth);
    const cfg = { ...MATH_CONFIG, deemedCostPct: 0.40, retirementAge: Math.ceil(currentAge + 15), mortgageEndAge: Math.ceil(currentAge + 16) };
    const result = computeEarliestFire(cfg, 2_000_000)!;
    expect(result.yearsToFire).toBeLessThan(10);
    const at20 = computeFireTarget({ ...cfg, deemedCostPct: 0.20, retirementAge: result.retirementAge });
    expect(result.fireTarget).toBeCloseTo(at20, 0);
  });

  it('finds the first funded month even when funded-ness is not monotonic', () => {
    // Drawdown return above accumulation return: target can grow with age
    const cfg = { ...MATH_CONFIG, accumulationReturn: 0.01, drawdownReturn: 0.08, monthlyContribution: 500 };
    const result = computeEarliestFire(cfg, 400_000);
    if (result) {
      const currentAge = computeCurrentAge(cfg.dateOfBirth);
      const m = Math.round(result.yearsToFire * 12);
      const r = Math.pow(1.01, 1 / 12) - 1;
      const portfolioAt = (k: number) => 400_000 * Math.pow(1 + r, k) + 500 * (Math.pow(1 + r, k) - 1) / r;
      const deemed = (k: number) => (k < 120 ? 0.20 : cfg.deemedCostPct);
      expect(portfolioAt(m)).toBeGreaterThanOrEqual(result.fireTarget);
      for (let k = 0; k < m; k++) {
        const t = computeFireTarget({ ...cfg, deemedCostPct: deemed(k), retirementAge: currentAge + k / 12 });
        expect(portfolioAt(k)).toBeLessThan(t);
      }
    }
  });

  it('can land after the configured retirement age instead of giving up', () => {
    const result = computeEarliestFire({ ...MATH_CONFIG, monthlyContribution: 1500 }, 50_000);
    expect(result).not.toBeNull();
    expect(result!.retirementAge).toBeGreaterThan(MATH_CONFIG.retirementAge);
    expect(result!.retirementAge).toBeLessThanOrEqual(MATH_CONFIG.pensionAge);
  });
});

describe('simulateProjection', () => {
  it('starts at current fractional age and ends at lifeExpectancy', () => {
    const pts = simulateProjection(MATH_CONFIG, 82_000);
    expect(pts[0]!.age).toBeCloseTo(computeCurrentAge(MATH_CONFIG.dateOfBirth), 1);
    expect(pts[pts.length - 1]!.age).toBe(MATH_CONFIG.lifeExpectancy);
  });

  it('portfolio grows during accumulation phase', () => {
    const pts = simulateProjection(MATH_CONFIG, 82_000);
    const atRetirement = pts.find(p => p.age === MATH_CONFIG.retirementAge)!;
    const atStart = pts[0]!;
    expect(atRetirement.portfolio).toBeGreaterThan(atStart.portfolio);
  });

  it('under-funded portfolio depletes to negative by lifeExpectancy', () => {
    // €0 start can never reach FIRE target — drawdown phase runs out of money
    const pts = simulateProjection(MATH_CONFIG, 0);
    const atEnd = pts[pts.length - 1]!;
    expect(atEnd.portfolio).toBeLessThan(0);
  });

  it('over-funded portfolio stays positive throughout', () => {
    const target = computeFireTarget(MATH_CONFIG, 0);
    const pts = simulateProjection(MATH_CONFIG, target * 3);
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

  it('warns when pension has no earnings input', () => {
    const result = runFireCalculation({ ...FIRE_DEFAULTS, annualGrossEarnings: 0 }, 82_000);
    expect(result.warnings.some(w => w.includes('earnings'))).toBe(true);
  });

  it('warns about the 40% deemed cost when retirement is under 10 years away', () => {
    const currentAge = computeCurrentAge(FIRE_DEFAULTS.dateOfBirth);
    const soon = runFireCalculation({ ...FIRE_DEFAULTS, retirementAge: Math.ceil(currentAge + 5) }, 82_000);
    const far = runFireCalculation({ ...FIRE_DEFAULTS, retirementAge: Math.ceil(currentAge + 15) }, 82_000);
    expect(soon.warnings.some(w => w.includes('deemed'))).toBe(true);
    expect(far.warnings.some(w => w.includes('deemed'))).toBe(false);
  });

  it('uses the 20% deemed cost for the headline target and phases when retirement is under 10 years away', () => {
    const currentAge = computeCurrentAge(FIRE_DEFAULTS.dateOfBirth);
    const cfg = { ...FIRE_DEFAULTS, deemedCostPct: 0.40, retirementAge: Math.ceil(currentAge + 5), mortgageEndAge: Math.ceil(currentAge + 8) };
    const result = runFireCalculation(cfg, 82_000);
    expect(result.fireTarget).toBeCloseTo(computeFireTarget({ ...cfg, deemedCostPct: 0.20 }), 0);
    expect(result.phases[0]!.grossWithdrawal).toBeCloseTo(computePhases({ ...cfg, deemedCostPct: 0.20 })[0]!.grossWithdrawal, 6);
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
