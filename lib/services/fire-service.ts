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
  capitalGainsTaxRate: number;
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
  capitalGainsTaxRate: 0.20,
  phase1aNetMonthly: 4500,
  phase1bNetMonthly: 3000,
  phase2NetMonthly: 3000,
  pensionNetMonthly: 1580,
};

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

// Simulates drawdown from retirementAge to lifeExpectancy.
// Returns the portfolio value at lifeExpectancy (positive = surplus, negative = depleted).
function simulateDrawdown(config: FireConfig, startPortfolio: number, activeIncomeMonthly: number): number {
  const { retirementAge, mortgageEndAge, pensionAge, lifeExpectancy, capitalGainsTaxRate,
    phase1aNetMonthly, phase1bNetMonthly, phase2NetMonthly, pensionNetMonthly, drawdownReturn } = config;

  const mRate = monthlyRate(drawdownReturn);
  let portfolio = startPortfolio;
  const totalMonths = (lifeExpectancy - retirementAge) * 12;

  for (let m = 0; m < totalMonths; m++) {
    const currentAge = retirementAge + m / 12;
    let netSpend: number;

    if (currentAge < mortgageEndAge) {
      // Phase 1A: high spend, barista income offsets
      netSpend = Math.max(0, phase1aNetMonthly - activeIncomeMonthly);
    } else if (currentAge < pensionAge) {
      // Phase 1B: mortgage cleared
      netSpend = phase1bNetMonthly;
    } else {
      // Phase 2: pension offset
      netSpend = Math.max(0, phase2NetMonthly - pensionNetMonthly);
    }

    const grossWithdrawal = netSpend / (1 - capitalGainsTaxRate);
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
    capitalGainsTaxRate, phase1aNetMonthly, phase1bNetMonthly, phase2NetMonthly, pensionNetMonthly } = config;

  const phase1aShortfall = phase1aNetMonthly;
  const phase1bShortfall = phase1bNetMonthly;
  const phase2Shortfall = Math.max(0, phase2NetMonthly - pensionNetMonthly);

  return [
    {
      label: 'Phase 1A',
      ageFrom: retirementAge,
      ageTo: mortgageEndAge,
      netMonthly: phase1aNetMonthly,
      pensionOffset: 0,
      portfolioShortfall: phase1aShortfall,
      grossWithdrawal: phase1aShortfall / (1 - capitalGainsTaxRate),
      grossAnnual: (phase1aShortfall / (1 - capitalGainsTaxRate)) * 12,
      durationYears: mortgageEndAge - retirementAge,
    },
    {
      label: 'Phase 1B',
      ageFrom: mortgageEndAge,
      ageTo: pensionAge,
      netMonthly: phase1bNetMonthly,
      pensionOffset: 0,
      portfolioShortfall: phase1bShortfall,
      grossWithdrawal: phase1bShortfall / (1 - capitalGainsTaxRate),
      grossAnnual: (phase1bShortfall / (1 - capitalGainsTaxRate)) * 12,
      durationYears: pensionAge - mortgageEndAge,
    },
    {
      label: 'Phase 2',
      ageFrom: pensionAge,
      ageTo: lifeExpectancy,
      netMonthly: phase2NetMonthly,
      pensionOffset: pensionNetMonthly,
      portfolioShortfall: phase2Shortfall,
      grossWithdrawal: phase2Shortfall / (1 - capitalGainsTaxRate),
      grossAnnual: (phase2Shortfall / (1 - capitalGainsTaxRate)) * 12,
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
    monthlyContribution, accumulationReturn, drawdownReturn, capitalGainsTaxRate,
    phase1aNetMonthly, phase1bNetMonthly, phase2NetMonthly, pensionNetMonthly } = config;

  const currentAge = computeCurrentAge(dateOfBirth);
  const currentYear = new Date().getFullYear();
  const points: ProjectionPoint[] = [];

  // Record starting point
  points.push({ age: currentAge, year: currentYear, portfolio: currentPortfolio });

  // Accumulation phase
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
  // Ensure retirementAge is recorded
  if (lastRecordedAge < retirementAge) {
    points.push({ age: retirementAge, year: currentYear + Math.round(retirementAge - currentAge), portfolio });
    lastRecordedAge = retirementAge;
  }

  // Drawdown phase
  const drawRate = monthlyRate(drawdownReturn);
  const drawdownMonths = (lifeExpectancy - retirementAge) * 12;

  for (let m = 1; m <= drawdownMonths; m++) {
    const age = retirementAge + m / 12;
    let netSpend: number;

    if (age < mortgageEndAge) {
      netSpend = Math.max(0, phase1aNetMonthly - activeIncomeMonthly);
    } else if (age < pensionAge) {
      netSpend = phase1bNetMonthly;
    } else {
      netSpend = Math.max(0, phase2NetMonthly - pensionNetMonthly);
    }

    const grossWithdrawal = netSpend / (1 - capitalGainsTaxRate);
    portfolio = portfolio * (1 + drawRate) - grossWithdrawal;

    if (Math.floor(age) > lastRecordedAge) {
      const intAge = Math.floor(age);
      points.push({ age: intAge, year: currentYear + Math.round(intAge - currentAge), portfolio });
      lastRecordedAge = intAge;
    }
  }

  // Ensure lifeExpectancy is recorded
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
