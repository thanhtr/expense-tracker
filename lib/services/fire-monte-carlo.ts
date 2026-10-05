import {
  type FireConfig,
  computeCurrentAge,
  monthlyRate,
  computePhaseGrossWithdrawals,
} from './fire-service';

export interface MonteCarloBand {
  age: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface MonteCarloResult {
  trials: number;
  // Fraction of trials whose portfolio never ran out (stayed ≥ 0) from retirement
  // through lifeExpectancy, evaluated against the same path the deterministic model
  // uses (same contributions, same withdrawal schedule) — only the annual return is
  // randomized. Does not drive the FIRE target; purely descriptive.
  successProbability: number;
  bands: MonteCarloBand[];
}

// Deterministic PRNG (mulberry32), so results are stable across reloads/tests for a
// given seed, with no external dependency.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box-Muller.
function randNormal(rng: () => number): number {
  const u1 = Math.max(rng(), Number.EPSILON);
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Draws an annual real return from a lognormal distribution, moment-matched so that
// E[1 + r] = 1 + mean and Var[1 + r] = vol^2 — i.e. `mean` and `vol` describe the
// simple (not log) return's mean and standard deviation. Lognormal keeps 1 + r > 0
// (can't lose more than the whole portfolio in a year), unlike a plain normal draw.
function drawAnnualReturn(rng: () => number, mean: number, vol: number): number {
  if (vol <= 0) return mean;
  const m = 1 + mean;
  const sigma2 = Math.log(1 + (vol * vol) / (m * m));
  const sigma = Math.sqrt(sigma2);
  const mu = Math.log(m) - sigma2 / 2;
  return Math.exp(mu + sigma * randNormal(rng)) - 1;
}

// One random trial: walks year by year from today to lifeExpectancy, drawing one
// annual return per calendar year (resampled each 12 months) and applying it monthly
// via the same monthlyRate() conversion the deterministic model uses, so a trial with
// zero volatility reproduces simulateProjection's numbers exactly. Withdrawal amounts
// come from the same computePhaseGrossWithdrawals the deterministic target uses, so
// only the return path is randomized. Once the portfolio hits 0 during retirement it
// stays at 0 (no further withdrawals from an empty account) and the trial is marked
// failed.
function simulateTrial(
  config: FireConfig,
  currentPortfolio: number,
  activeIncomeMonthly: number,
  rng: () => number,
  startAge: number,
  endAge: number,
  withdrawals: { gross1a: number; gross1b: number; gross2: number },
): { success: boolean; path: number[] } {
  const { retirementAge, mortgageEndAge, pensionAge, monthlyContribution, accumulationReturn, drawdownReturn, returnVolatility } = config;

  let portfolio = currentPortfolio;
  let depleted = false;
  const path: number[] = [portfolio];

  for (let age = startAge; age < endAge; age++) {
    const isAccumulationYear = age < retirementAge;
    const annualReturn = drawAnnualReturn(
      rng,
      isAccumulationYear ? accumulationReturn : drawdownReturn,
      returnVolatility,
    );
    const mRate = monthlyRate(annualReturn);

    for (let m = 0; m < 12; m++) {
      const exactAge = age + m / 12;
      if (exactAge < retirementAge) {
        portfolio = portfolio * (1 + mRate) + monthlyContribution;
        continue;
      }
      if (depleted) continue; // stays pinned at 0, see below

      const gross = exactAge < mortgageEndAge ? withdrawals.gross1a
        : exactAge < pensionAge ? withdrawals.gross1b
        : withdrawals.gross2;
      portfolio = portfolio * (1 + mRate) - gross;
      if (portfolio < 0) {
        portfolio = 0;
        depleted = true;
      }
    }

    path.push(portfolio);
  }

  return { success: !depleted, path };
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)));
  return sorted[idx]!;
}

// Evaluates (doesn't solve) the plan under return volatility: runs `trials` random
// paths using the config's existing phases/withdrawals/contributions, and reports what
// fraction last to lifeExpectancy plus a 10/50/90th percentile band per age. A fixed
// seed keeps results stable across reloads for the same config.
export function runMonteCarlo(
  config: FireConfig,
  currentPortfolio: number,
  activeIncomeMonthly = 0,
  trials = 1000,
  seed = 20261005,
): MonteCarloResult {
  const currentAge = computeCurrentAge(config.dateOfBirth);
  const startAge = Math.floor(currentAge);
  const endAge = Math.max(startAge, Math.ceil(config.lifeExpectancy));
  const withdrawals = computePhaseGrossWithdrawals(config, activeIncomeMonthly);

  const rng = mulberry32(seed);
  const numPoints = endAge - startAge + 1;
  const byAge: number[][] = Array.from({ length: numPoints }, () => []);

  let successes = 0;
  for (let t = 0; t < trials; t++) {
    const { success, path } = simulateTrial(config, currentPortfolio, activeIncomeMonthly, rng, startAge, endAge, withdrawals);
    if (success) successes++;
    for (let i = 0; i < path.length; i++) byAge[i]!.push(path[i]!);
  }

  const bands: MonteCarloBand[] = byAge.map((values, i) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      age: startAge + i,
      p10: percentile(sorted, 0.10),
      p50: percentile(sorted, 0.50),
      p90: percentile(sorted, 0.90),
    };
  });

  return { trials, successProbability: successes / trials, bands };
}
