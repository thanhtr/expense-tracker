export function computeCurrentAge(dateOfBirth: string): number {
  return (Date.now() - new Date(dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

// Settings the user chooses and saves.
export interface StoredFireConfig {
  dateOfBirth: string;
  retirementAge: number;
  mortgageEndAge: number;
  pensionAge: number;
  lifeExpectancy: number;
  emergencyFundMonths: number;
  monthlyContribution: number;
  accumulationReturn: number;
  drawdownReturn: number;
  taxpayers: number;
  phase1aNetMonthly: number;
  phase1bNetMonthly: number;
  phase2NetMonthly: number;
  pensionAccruedMonthly: number;
  lifeExpectancyCoef: number;
  pensionTaxRate: number;
}

// Inputs derived from transaction data (see lib/services/fire-inputs-service.ts),
// not typed in: they are facts that can be read off the recorded history.
export interface DerivedFireInputs {
  annualGrossEarnings: number;
  // Rent received minus the rented flat's running costs, as cash per month.
  rentalNetMonthly: number;
  // Other deductible costs (e.g. share of own home's fee) that lower taxable rent only.
  rentalTaxOnlyDeductionsMonthly: number;
  // Rental-property annuity loan, ending at mortgageEndAge. Its interest lowers
  // taxable rent while it runs; repayments are already part of Phase 1A spending.
  rentalLoanPaymentMonthly: number;
  rentalLoanRate: number;
}

export type FireConfig = StoredFireConfig & DerivedFireInputs;

export const NO_DERIVED_INPUTS: DerivedFireInputs = {
  annualGrossEarnings: 0,
  rentalNetMonthly: 0,
  rentalTaxOnlyDeductionsMonthly: 0,
  rentalLoanPaymentMonthly: 0,
  rentalLoanRate: 0,
};

// Outstanding balance of an annuity loan, from its payment, rate and months left.
export function annuityBalance(paymentMonthly: number, annualRate: number, monthsLeft: number): number {
  if (monthsLeft <= 0 || paymentMonthly <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return paymentMonthly * monthsLeft;
  return paymentMonthly * (1 - Math.pow(1 + r, -monthsLeft)) / r;
}

// Average monthly interest on the rental loan between retirement and loan end: the
// payments made in that window minus the principal they repay (the balance at
// retirement). 0 if the loan ends before retirement.
export function rentalLoanInterestInRetirement(
  config: Pick<FireConfig, 'dateOfBirth' | 'retirementAge' | 'mortgageEndAge' | 'rentalLoanPaymentMonthly' | 'rentalLoanRate'>,
): number {
  const currentAge = computeCurrentAge(config.dateOfBirth);
  const months = Math.round((config.mortgageEndAge - Math.max(currentAge, config.retirementAge)) * 12);
  if (months <= 0) return 0;
  const balanceAtRetirement = annuityBalance(config.rentalLoanPaymentMonthly, config.rentalLoanRate, months);
  return (config.rentalLoanPaymentMonthly * months - balanceAtRetirement) / months;
}

export const FIRE_DEFAULTS: StoredFireConfig = {
  dateOfBirth: '1990-05-15',
  retirementAge: 55,
  mortgageEndAge: 58,
  // Lowest statutory retirement age is tied to cohort life expectancy for those born
  // 1965+; ETK's estimate for the 1990 cohort is 67y 9m, rounded up here.
  pensionAge: 68,
  lifeExpectancy: 95,
  emergencyFundMonths: 6,
  monthlyContribution: 3000,
  accumulationReturn: 0.06,
  drawdownReturn: 0.04,
  // Each spouse has their own capital-income bracket threshold.
  taxpayers: 2,
  phase1aNetMonthly: 4400,
  phase1bNetMonthly: 4100,
  phase2NetMonthly: 4100,
  pensionAccruedMonthly: 1330,
  // Confirmed coefficient for the 1964 cohort is 0.94643 (STM, 2026) and keeps
  // falling for later cohorts; 0.90 is a conservative estimate for the 1990 cohort.
  lifeExpectancyCoef: 0.90,
  pensionTaxRate: 0.20,
};

// Finnish capital income tax (pääomatulovero), 2026 rates — update if vero.fi changes.
// 30% up to the annual threshold of taxable capital income, 34% above it, per taxpayer.
export const FI_CAPITAL_TAX_THRESHOLD = 30_000; // € annual taxable capital income threshold
export const FI_CAPITAL_TAX_RATE_LOW = 0.30;    // rate up to threshold
export const FI_CAPITAL_TAX_RATE_HIGH = 0.34;   // rate above threshold

// TyEL accrual from 2026: 1.5% of gross annual earnings, at any age (tyoelake.fi).
export const FI_TYEL_ACCRUAL_RATE = 0.015;

// Employee contributions deducted from gross pay, 2026: TyEL pension 7.3% (tyoelake.fi)
// and unemployment insurance 0.89% (Työllisyysrahasto). The 30% income tax is the
// user's own flat estimate of withholding, not a sourced rate. Used to derive gross
// earnings from net salary (fire-inputs-service).
export const FI_EMPLOYEE_PENSION_CONTRIBUTION = 0.073;
export const FI_EMPLOYEE_UNEMPLOYMENT_CONTRIBUTION = 0.0089;
export const ASSUMED_INCOME_TAX_RATE = 0.30;

// Hankintameno-olettama (vero.fi): 20% of the sale price for shares held under 10
// years, 40% for 10+ years. FIFO is mandatory within a securities account, so sales in
// retirement come from the oldest lots: when retirement is 10+ years away, those are
// held 10+ years. Closer than that, early sales may hit younger lots, so use 20%.
export const FI_DEEMED_COST_SHORT_HOLD = 0.20;
export const FI_DEEMED_COST_LONG_HOLD = 0.40;

export function deemedCostPct(config: Pick<FireConfig, 'dateOfBirth' | 'retirementAge'>): number {
  const yearsAway = config.retirementAge - computeCurrentAge(config.dateOfBirth);
  // Tolerance of ~30 s absorbs clock drift between separate computeCurrentAge calls,
  // so a candidate exactly 10 years out doesn't flip between rates.
  return yearsAway >= 10 - 1e-6 ? FI_DEEMED_COST_LONG_HOLD : FI_DEEMED_COST_SHORT_HOLD;
}

export function capitalIncomeTax(taxable: number): number {
  if (taxable <= 0) return 0;
  const low = Math.min(taxable, FI_CAPITAL_TAX_THRESHOLD);
  const high = Math.max(0, taxable - FI_CAPITAL_TAX_THRESHOLD);
  return FI_CAPITAL_TAX_RATE_LOW * low + FI_CAPITAL_TAX_RATE_HIGH * high;
}

export interface GrossUpOptions {
  taxpayers?: number;
  // Other annual capital income (e.g. net rent) received as cash alongside the sale;
  // it offsets the need.
  otherCapitalIncome?: number;
  // Taxable part of that income, if different from the cash (e.g. rent after loan
  // interest, which is deductible but already paid out of spending). Defaults to the cash.
  otherCapitalIncomeTaxable?: number;
}

// Grosses up a desired net annual cash need into the portfolio sale required, given a
// deemed-cost percentage and Finland's two-bracket rate on taxable capital income.
// Need and other income are split evenly across taxpayers, each with their own
// threshold. Solves per taxpayer: sale + cash − tax((1 − deemed) × sale + taxable) = need.
export function grossUpAnnual(netAnnual: number, deemedCostPct: number, opts: GrossUpOptions = {}): number {
  if (netAnnual <= 0) return 0;

  const taxpayers = Math.max(1, opts.taxpayers ?? 1);
  const need = netAnnual / taxpayers;
  const cash = (opts.otherCapitalIncome ?? 0) / taxpayers;
  const taxable = (opts.otherCapitalIncomeTaxable ?? opts.otherCapitalIncome ?? 0) / taxpayers;
  if (need <= cash - capitalIncomeTax(taxable)) return 0;

  const taxableFraction = 1 - deemedCostPct;

  // A deductible loss (taxable < 0) first absorbs gains tax-free.
  if (taxable < 0) {
    const untaxedSale = -taxable / taxableFraction;
    if (need - cash <= untaxedSale) return (need - cash) * taxpayers;
  }

  const low = (need - cash + FI_CAPITAL_TAX_RATE_LOW * taxable) / (1 - FI_CAPITAL_TAX_RATE_LOW * taxableFraction);
  if (taxableFraction * low + taxable <= FI_CAPITAL_TAX_THRESHOLD) return low * taxpayers;

  const bracketIntercept = FI_CAPITAL_TAX_THRESHOLD * (FI_CAPITAL_TAX_RATE_HIGH - FI_CAPITAL_TAX_RATE_LOW);
  const high = (need - cash + FI_CAPITAL_TAX_RATE_HIGH * taxable - bracketIntercept) / (1 - FI_CAPITAL_TAX_RATE_HIGH * taxableFraction);
  return high * taxpayers;
}

export interface PensionEstimate {
  accruedMonthly: number;
  futureAccrualMonthly: number;
  grossMonthly: number;
  netMonthly: number;
}

// Projects the combined TyEL pension in today's euros: what's accrued so far plus
// accrual on current earnings until retirementAge (none after), reduced by the
// life-expectancy coefficient and earned-income tax. Ignores the wage-index uplift
// on accrued pension before it starts (conservative).
export function computePension(config: FireConfig): PensionEstimate {
  const yearsWorked = Math.max(0, config.retirementAge - computeCurrentAge(config.dateOfBirth));
  const accrualPerYearMonthly = config.annualGrossEarnings * FI_TYEL_ACCRUAL_RATE / 12;
  const futureAccrualMonthly = accrualPerYearMonthly * yearsWorked;
  const grossMonthly = (config.pensionAccruedMonthly + futureAccrualMonthly) * config.lifeExpectancyCoef;
  return {
    accruedMonthly: config.pensionAccruedMonthly,
    futureAccrualMonthly,
    grossMonthly,
    netMonthly: grossMonthly * (1 - config.pensionTaxRate),
  };
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
  rentalIncome: number;
  portfolioShortfall: number;
  grossWithdrawal: number;
  grossAnnual: number;
  durationYears: number;
}

export interface EarliestFire {
  yearsToFire: number;
  retirementAge: number;
  fireTarget: number;
}

export interface BaristaVariant {
  label: string;
  activeIncomeMonthly: number;
  fireTarget: number;
  yearsToFire: number | null;
  projectedRetirementAge: number | null;
  earliestFireTarget: number | null;
  projection: ProjectionPoint[];
  portfolioAtDeath: number;
}

export interface FireCalculationResult {
  fireTarget: number;
  currentPortfolio: number;
  progressPct: number;
  yearsToFire: number | null;
  projectedRetirementAge: number | null;
  earliestFireTarget: number | null;
  pension: PensionEstimate;
  deemedCostPct: number;
  warnings: string[];
  phases: PhaseInfo[];
  pureFire: BaristaVariant;
  barista33: BaristaVariant;
  barista50: BaristaVariant;
  projection: ProjectionPoint[];
}

function monthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

// Taxable rent never goes below 0 here: a rental loss offsetting sale gains isn't modelled.
function grossUpMonthly(netMonthly: number, config: FireConfig, loanInterestMonthly = 0): number {
  const taxableRent = Math.max(0, config.rentalNetMonthly - config.rentalTaxOnlyDeductionsMonthly - loanInterestMonthly);
  return grossUpAnnual(netMonthly * 12, deemedCostPct(config), {
    taxpayers: config.taxpayers,
    otherCapitalIncome: config.rentalNetMonthly * 12,
    otherCapitalIncomeTaxable: taxableRent * 12,
  }) / 12;
}

// Pre-computes the monthly gross withdrawal for each spending phase.
// Net spend is constant within a phase, so this only needs to run once per simulation.
// The rental loan runs until mortgageEndAge, so its interest is deducted in Phase 1A only.
function computePhaseGrossWithdrawals(
  config: FireConfig,
  activeIncomeMonthly: number,
): { gross1a: number; gross1b: number; gross2: number } {
  const pension = computePension(config).netMonthly;
  return {
    gross1a: grossUpMonthly(Math.max(0, config.phase1aNetMonthly - activeIncomeMonthly), config, rentalLoanInterestInRetirement(config)),
    gross1b: grossUpMonthly(config.phase1bNetMonthly, config),
    gross2: grossUpMonthly(Math.max(0, config.phase2NetMonthly - pension), config),
  };
}

// Simulates drawdown from retirementAge to lifeExpectancy.
// Returns the portfolio value at lifeExpectancy (positive = surplus, negative = depleted).
function simulateDrawdown(
  config: FireConfig,
  startPortfolio: number,
  { gross1a, gross1b, gross2 }: { gross1a: number; gross1b: number; gross2: number },
): number {
  const { retirementAge, mortgageEndAge, pensionAge, lifeExpectancy, drawdownReturn } = config;

  const mRate = monthlyRate(drawdownReturn);
  let portfolio = startPortfolio;
  const totalMonths = (lifeExpectancy - retirementAge) * 12;

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
  const withdrawals = computePhaseGrossWithdrawals(config, activeIncomeMonthly);

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const endValue = simulateDrawdown(config, mid, withdrawals);
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
    phase1aNetMonthly, phase1bNetMonthly, phase2NetMonthly, rentalNetMonthly } = config;

  const pension = computePension(config).netMonthly;
  const phase1aShortfall = phase1aNetMonthly;
  const phase1bShortfall = phase1bNetMonthly;
  const phase2Shortfall = Math.max(0, phase2NetMonthly - pension);

  const { gross1a: phase1aGross, gross1b: phase1bGross, gross2: phase2Gross } = computePhaseGrossWithdrawals(config, 0);

  return [
    {
      label: 'Phase 1A',
      ageFrom: retirementAge,
      ageTo: mortgageEndAge,
      netMonthly: phase1aNetMonthly,
      pensionOffset: 0,
      rentalIncome: rentalNetMonthly,
      portfolioShortfall: phase1aShortfall,
      grossWithdrawal: phase1aGross,
      grossAnnual: phase1aGross * 12,
      durationYears: mortgageEndAge - retirementAge,
    },
    {
      label: 'Phase 1B',
      ageFrom: mortgageEndAge,
      ageTo: pensionAge,
      netMonthly: phase1bNetMonthly,
      pensionOffset: 0,
      rentalIncome: rentalNetMonthly,
      portfolioShortfall: phase1bShortfall,
      grossWithdrawal: phase1bGross,
      grossAnnual: phase1bGross * 12,
      durationYears: pensionAge - mortgageEndAge,
    },
    {
      label: 'Phase 2',
      ageFrom: pensionAge,
      ageTo: lifeExpectancy,
      netMonthly: phase2NetMonthly,
      pensionOffset: pension,
      rentalIncome: rentalNetMonthly,
      portfolioShortfall: phase2Shortfall,
      grossWithdrawal: phase2Gross,
      grossAnnual: phase2Gross * 12,
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

// Finds the earliest month at which the accumulated portfolio covers the FIRE target
// *for retiring at that age* — retiring earlier means a longer drawdown and less
// pension accrual, so the target itself moves with the candidate age (as does the
// deemed cost, via deemedCostPct). Funded-ness is usually monotonic in age but not guaranteed (e.g. a
// drawdown return above the accumulation return can make the target grow), so this
// scans year by year for the first funded year, then refines by month within it.
// Searches up to pensionAge; returns null if not reachable by then.
export function computeEarliestFire(
  config: FireConfig,
  currentPortfolio: number,
  activeIncomeMonthly = 0,
): EarliestFire | null {
  const currentAge = computeCurrentAge(config.dateOfBirth);
  const accRate = monthlyRate(config.accumulationReturn);
  const maxMonths = Math.floor((config.pensionAge - currentAge) * 12);
  if (maxMonths < 0) return null;

  const portfolioAt = (m: number) => {
    const growth = Math.pow(1 + accRate, m);
    const contributions = accRate > 0 ? config.monthlyContribution * (growth - 1) / accRate : config.monthlyContribution * m;
    return currentPortfolio * growth + contributions;
  };
  const targets = new Map<number, number>();
  const targetAt = (m: number) => {
    let t = targets.get(m);
    if (t === undefined) {
      t = computeFireTarget({ ...config, retirementAge: currentAge + m / 12 }, activeIncomeMonthly);
      targets.set(m, t);
    }
    return t;
  };
  const funded = (m: number) => portfolioAt(m) >= targetAt(m);
  const result = (m: number): EarliestFire => ({
    yearsToFire: m / 12,
    retirementAge: currentAge + m / 12,
    fireTarget: targetAt(m),
  });

  if (funded(0)) return result(0);

  let prev = 0;
  for (let m = 12; ; m += 12) {
    const year = Math.min(m, maxMonths);
    if (funded(year)) {
      for (let k = prev + 1; k < year; k++) if (funded(k)) return result(k);
      return result(year);
    }
    if (year === maxMonths) return null;
    prev = year;
  }
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
    const earliest = computeEarliestFire(config, currentPortfolio, activeIncomeMonthly);
    const projection = simulateProjection(config, currentPortfolio, activeIncomeMonthly);
    const portfolioAtDeath = projection[projection.length - 1]?.portfolio ?? 0;

    return {
      label,
      activeIncomeMonthly,
      fireTarget,
      yearsToFire: earliest?.yearsToFire ?? null,
      projectedRetirementAge: earliest?.retirementAge ?? null,
      earliestFireTarget: earliest?.fireTarget ?? null,
      projection,
      portfolioAtDeath,
    };
  });

  return { pure: pure!, barista33: barista33!, barista50: barista50! };
}

function computeWarnings(config: FireConfig): string[] {
  const warnings: string[] = [];
  if (config.annualGrossEarnings <= 0) {
    warnings.push(
      'No salary income found in the last 12 months, so the pension uses only what is accrued so far.',
    );
  }
  return warnings;
}

export function runFireCalculation(config: FireConfig, currentPortfolio: number): FireCalculationResult {
  const phases = computePhases(config);
  const { pure, barista33, barista50 } = baristaVariants(config, currentPortfolio);

  const fireTarget = pure.fireTarget;
  const progressPct = fireTarget > 0 ? Math.min(100, (currentPortfolio / fireTarget) * 100) : 0;

  return {
    fireTarget,
    currentPortfolio,
    progressPct,
    yearsToFire: pure.yearsToFire,
    projectedRetirementAge: pure.projectedRetirementAge,
    earliestFireTarget: pure.earliestFireTarget,
    pension: computePension(config),
    deemedCostPct: deemedCostPct(config),
    warnings: computeWarnings(config),
    phases,
    pureFire: pure,
    barista33,
    barista50,
    projection: pure.projection,
  };
}
