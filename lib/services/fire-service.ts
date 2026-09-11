export function computeCurrentAge(dateOfBirth: string): number {
  return (Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

export interface FireConfig {
  dateOfBirth: string;
  retirementAge: number;
  mortgageEndAge: number;
  pensionAge: number;
  lifeExpectancy: number;
  monthlyContribution: number;
  accumulationReturn: number;
  drawdownReturn: number;
  deemedCostPct: number;
  phase1aNetMonthly: number;
  phase1bNetMonthly: number;
  phase2NetMonthly: number;
  pensionNetMonthly: number;
}

export const FIRE_DEFAULTS: FireConfig = {
  dateOfBirth: '1990-05-15',
  retirementAge: 50,
  mortgageEndAge: 60,
  pensionAge: 65,
  lifeExpectancy: 95,
  monthlyContribution: 3000,
  accumulationReturn: 0.06,
  drawdownReturn: 0.04,
  // Worst-case hankintameno-olettama: 20% deemed acquisition cost applies to any
  // holding period; the more generous 40% requires 10+ years and is never assumed
  // (no per-lot cost-basis tracking exists to prove it). See FI_CAPITAL_TAX_* below
  // for the actual progressive tax applied to the resulting taxable gain.
  deemedCostPct: 0.20,
  phase1aNetMonthly: 6500,
  phase1bNetMonthly: 4100,
  phase2NetMonthly: 4100,
  pensionNetMonthly: 1580,
};

// Finnish capital income tax (pääomatulovero), 2026 rates — update if vero.fi changes.
// 30% up to the annual threshold of taxable capital income, 34% above it.
// Source: vero.fi / Veronmaksajain Keskusliitto. Applied here to the taxable *gain*
// after the deemed-cost reduction above, not to the gross withdrawal — a flat "20%
// tax rate" (as this model used to assume) understates the real liability by
// conflating the deemed-cost percentage with the tax rate itself.
export const FI_CAPITAL_TAX_THRESHOLD = 30_000; // € annual taxable-gain threshold
export const FI_CAPITAL_TAX_RATE_LOW = 0.30;    // rate on gain up to threshold
export const FI_CAPITAL_TAX_RATE_HIGH = 0.34;   // rate on gain above threshold

// Grosses up a desired net annual withdrawal into the pre-tax amount that must be
// sold, given a deemed-cost percentage and Finland's two-bracket progressive rate
// on the resulting taxable gain. Assumes the full withdrawal is realized gain
// (no proof of a higher cost basis) and that all of it is taxed as a single
// taxpayer's capital income for the year (no benefit assumed from splitting
// withdrawals across spouses' individual €30k thresholds).
export function grossUpAnnual(netAnnual: number, deemedCostPct: number): number {
  if (netAnnual <= 0) return 0;

  const taxableFraction = 1 - deemedCostPct;
  const lowBracketFactor = 1 - FI_CAPITAL_TAX_RATE_LOW * taxableFraction;
  const grossAtThreshold = FI_CAPITAL_TAX_THRESHOLD / taxableFraction;
  const netAtThreshold = grossAtThreshold * lowBracketFactor;

  if (netAnnual <= netAtThreshold) {
    return netAnnual / lowBracketFactor;
  }

  const highBracketFactor = 1 - FI_CAPITAL_TAX_RATE_HIGH * taxableFraction;
  const bracketIntercept = FI_CAPITAL_TAX_THRESHOLD * (FI_CAPITAL_TAX_RATE_HIGH - FI_CAPITAL_TAX_RATE_LOW);
  return (netAnnual - bracketIntercept) / highBracketFactor;
}

export interface ProjectionPoint {
  age: number;
  year: number;
  portfolio: number;
}

export interface PhaseInfo {
  label: string;
  ageFrom: number;
  ageTo: number;
  netMonthly: number;
  pensionOffset: number;
  portfolioShortfall: number;
  grossWithdrawal: number;
  grossAnnual: number;
  durationYears: number;
}

export interface BaristaVariant {
  label: string;
  activeIncomeMonthly: number;
  fireTarget: number;
  yearsToFire: number | null;
  projectedRetirementAge: number | null;
  projection: ProjectionPoint[];
  portfolioAtDeath: number;
}

export interface FireCalculationResult {
  fireTarget: number;
  currentPortfolio: number;
  progressPct: number;
  yearsToFire: number | null;
  projectedRetirementAge: number | null;
  phases: PhaseInfo[];
  pureFire: BaristaVariant;
  barista33: BaristaVariant;
  barista50: BaristaVariant;
  projection: ProjectionPoint[];
}

function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

// Pre-computes the monthly gross withdrawal for each spending phase.
// Net spend is constant within a phase, so this only needs to run once per simulation.
function computePhaseGrossWithdrawals(
  config: Pick<FireConfig, 'deemedCostPct' | 'phase1aNetMonthly' | 'phase1bNetMonthly' | 'phase2NetMonthly' | 'pensionNetMonthly'>,
  activeIncomeMonthly: number,
): { gross1a: number; gross1b: number; gross2: number } {
  const { deemedCostPct, phase1aNetMonthly, phase1bNetMonthly, phase2NetMonthly, pensionNetMonthly } = config;
  return {
    gross1a: grossUpAnnual(Math.max(0, phase1aNetMonthly - activeIncomeMonthly) * 12, deemedCostPct) / 12,
    gross1b: grossUpAnnual(phase1bNetMonthly * 12, deemedCostPct) / 12,
    gross2: grossUpAnnual(Math.max(0, phase2NetMonthly - pensionNetMonthly) * 12, deemedCostPct) / 12,
  };
}

// Simulates drawdown from retirementAge to lifeExpectancy.
// Returns the portfolio value at lifeExpectancy (positive = surplus, negative = depleted).
function simulateDrawdown(config: FireConfig, startPortfolio: number, activeIncomeMonthly: number): number {
  const { retirementAge, mortgageEndAge, pensionAge, lifeExpectancy, drawdownReturn } = config;

  const mRate = monthlyRate(drawdownReturn);
  let portfolio = startPortfolio;
  const totalMonths = (lifeExpectancy - retirementAge) * 12;

  const { gross1a, gross1b, gross2 } = computePhaseGrossWithdrawals(config, activeIncomeMonthly);

  for (let m = 0; m < totalMonths; m++) {
    const currentAge = retirementAge + m / 12;
    let grossWithdrawal: number;

    if (currentAge < mortgageEndAge) {
      // Phase 1A: high spend, barista income offsets
      grossWithdrawal = gross1a;
    } else if (currentAge < pensionAge) {
      // Phase 1B: mortgage cleared
      grossWithdrawal = gross1b;
    } else {
      // Phase 2: pension offset
      grossWithdrawal = gross2;
    }

    portfolio = portfolio * (1 + mRate) - grossWithdrawal;
  }

  return portfolio;
}

// Binary search: find starting portfolio at retirementAge that depletes to ~0 at lifeExpectancy.
export function computeFireTarget(config: FireConfig, activeIncomeMonthly = 0): number {
  let lo = 0;
  let hi = 50_000_000;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const endValue = simulateDrawdown(config, mid, activeIncomeMonthly);
    if (endValue > 0) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return (lo + hi) / 2;
}

export function computePhases(config: FireConfig): PhaseInfo[] {
  const { retirementAge, mortgageEndAge, pensionAge, lifeExpectancy,
    deemedCostPct, phase1aNetMonthly, phase1bNetMonthly, phase2NetMonthly, pensionNetMonthly } = config;

  const phase1aShortfall = phase1aNetMonthly;
  const phase1bShortfall = phase1bNetMonthly;
  const phase2Shortfall = Math.max(0, phase2NetMonthly - pensionNetMonthly);

  const phase1aGrossAnnual = grossUpAnnual(phase1aShortfall * 12, deemedCostPct);
  const phase1bGrossAnnual = grossUpAnnual(phase1bShortfall * 12, deemedCostPct);
  const phase2GrossAnnual = grossUpAnnual(phase2Shortfall * 12, deemedCostPct);

  return [
    {
      label: 'Phase 1A',
      ageFrom: retirementAge,
      ageTo: mortgageEndAge,
      netMonthly: phase1aNetMonthly,
      pensionOffset: 0,
      portfolioShortfall: phase1aShortfall,
      grossWithdrawal: phase1aGrossAnnual / 12,
      grossAnnual: phase1aGrossAnnual,
      durationYears: mortgageEndAge - retirementAge,
    },
    {
      label: 'Phase 1B',
      ageFrom: mortgageEndAge,
      ageTo: pensionAge,
      netMonthly: phase1bNetMonthly,
      pensionOffset: 0,
      portfolioShortfall: phase1bShortfall,
      grossWithdrawal: phase1bGrossAnnual / 12,
      grossAnnual: phase1bGrossAnnual,
      durationYears: pensionAge - mortgageEndAge,
    },
    {
      label: 'Phase 2',
      ageFrom: pensionAge,
      ageTo: lifeExpectancy,
      netMonthly: phase2NetMonthly,
      pensionOffset: pensionNetMonthly,
      portfolioShortfall: phase2Shortfall,
      grossWithdrawal: phase2GrossAnnual / 12,
      grossAnnual: phase2GrossAnnual,
      durationYears: lifeExpectancy - pensionAge,
    },
  ];
}

export function simulateProjection(
  config: FireConfig,
  currentPortfolio: number,
  activeIncomeMonthly = 0,
): ProjectionPoint[] {
  const { dateOfBirth, retirementAge, mortgageEndAge, pensionAge, lifeExpectancy,
    monthlyContribution, accumulationReturn, drawdownReturn } = config;

  const currentAge = computeCurrentAge(dateOfBirth);
  const currentYear = new Date().getFullYear();
  const points: ProjectionPoint[] = [];

  points.push({ age: currentAge, year: currentYear, portfolio: currentPortfolio });

  const accRate = monthlyRate(accumulationReturn);
  let portfolio = currentPortfolio;
  let lastRecordedAge = currentAge;

  const accumulationMonths = (retirementAge - currentAge) * 12;
  for (let m = 1; m <= accumulationMonths; m++) {
    portfolio = portfolio * (1 + accRate) + monthlyContribution;
    const age = currentAge + m / 12;
    if (Math.floor(age) > lastRecordedAge) {
      const intAge = Math.floor(age);
      points.push({ age: intAge, year: currentYear + Math.round(intAge - currentAge), portfolio });
      lastRecordedAge = intAge;
    }
  }
  if (lastRecordedAge < retirementAge) {
    points.push({ age: retirementAge, year: currentYear + Math.round(retirementAge - currentAge), portfolio });
    lastRecordedAge = retirementAge;
  }

  const drawRate = monthlyRate(drawdownReturn);
  const drawdownMonths = (lifeExpectancy - retirementAge) * 12;

  const { gross1a, gross1b, gross2 } = computePhaseGrossWithdrawals(config, activeIncomeMonthly);

  for (let m = 1; m <= drawdownMonths; m++) {
    const age = retirementAge + m / 12;
    let grossWithdrawal: number;

    if (age < mortgageEndAge) {
      grossWithdrawal = gross1a;
    } else if (age < pensionAge) {
      grossWithdrawal = gross1b;
    } else {
      grossWithdrawal = gross2;
    }

    portfolio = portfolio * (1 + drawRate) - grossWithdrawal;

    if (Math.floor(age) > lastRecordedAge) {
      const intAge = Math.floor(age);
      points.push({ age: intAge, year: currentYear + Math.round(intAge - currentAge), portfolio });
      lastRecordedAge = intAge;
    }
  }

  if (lastRecordedAge < lifeExpectancy) {
    points.push({ age: lifeExpectancy, year: currentYear + Math.round(lifeExpectancy - currentAge), portfolio });
  }

  return points;
}

export function computeYearsToFire(
  config: FireConfig,
  currentPortfolio: number,
  fireTarget: number,
): number | null {
  const { dateOfBirth, retirementAge, accumulationReturn, monthlyContribution } = config;
  const currentAge = computeCurrentAge(dateOfBirth);
  const accRate = monthlyRate(accumulationReturn);
  let portfolio = currentPortfolio;
  const maxMonths = (retirementAge - currentAge) * 12;

  if (portfolio >= fireTarget) return 0;

  for (let m = 1; m <= maxMonths; m++) {
    portfolio = portfolio * (1 + accRate) + monthlyContribution;
    if (portfolio >= fireTarget) {
      return m / 12;
    }
  }

  return null;
}

export function baristaVariants(config: FireConfig, currentPortfolio: number): {
  pure: BaristaVariant;
  barista33: BaristaVariant;
  barista50: BaristaVariant;
} {
  const variants = [
    { label: 'Pure FIRE', activeIncomeMonthly: 0 },
    { label: 'Barista 33%', activeIncomeMonthly: config.phase1aNetMonthly * 0.33 },
    { label: 'Barista 50%', activeIncomeMonthly: config.phase1aNetMonthly * 0.50 },
  ];

  const [pure, barista33, barista50] = variants.map(({ label, activeIncomeMonthly }) => {
    const fireTarget = computeFireTarget(config, activeIncomeMonthly);
    const yearsToFire = computeYearsToFire(config, currentPortfolio, fireTarget);
    const projectedRetirementAge = yearsToFire !== null
      ? computeCurrentAge(config.dateOfBirth) + yearsToFire
      : null;
    const projection = simulateProjection(config, currentPortfolio, activeIncomeMonthly);
    const portfolioAtDeath = projection[projection.length - 1]?.portfolio ?? 0;

    return { label, activeIncomeMonthly, fireTarget, yearsToFire, projectedRetirementAge, projection, portfolioAtDeath };
  });

  return { pure: pure!, barista33: barista33!, barista50: barista50! };
}

export function runFireCalculation(config: FireConfig, currentPortfolio: number): FireCalculationResult {
  const phases = computePhases(config);
  const { pure, barista33, barista50 } = baristaVariants(config, currentPortfolio);

  const fireTarget = pure.fireTarget;
  const progressPct = fireTarget > 0 ? Math.min(100, (currentPortfolio / fireTarget) * 100) : 0;
  const yearsToFire = pure.yearsToFire;
  const projectedRetirementAge = pure.projectedRetirementAge;

  return {
    fireTarget,
    currentPortfolio,
    progressPct,
    yearsToFire,
    projectedRetirementAge,
    phases,
    pureFire: pure,
    barista33,
    barista50,
    projection: pure.projection,
  };
}
