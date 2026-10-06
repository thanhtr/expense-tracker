import {
  type FireConfig,
  computeCurrentAge,
  monthlyRate,
  computePhaseGrossWithdrawals,
} from './fire-service';
import { mulberry32, randNormal, percentile } from './stats';

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

// One random trial: walks month by month from the exact (fractional) current age to
// lifeExpectancy — the same total month count the deterministic model uses
// ((lifeExpectancy - currentAge) * 12) — drawing one annual return every 12 *elapsed*
// months (not tied to calendar-year boundaries) and applying it via the same
// monthlyRate() conversion the deterministic model uses. Withdrawal amounts come from
// the same computePhaseGrossWithdrawals the deterministic target uses, so only the
// return path is randomized. Once the portfolio hits 0 during retirement it stays at 0
// (no further withdrawals from an empty account) and the trial is marked failed.
// Returns one path point per integer age crossed, plus a first point at the exact
// starting age (matching simulateProjection's own point convention) so the chart band
// has data right at "today", not just from the next whole year.
function simulateTrial(
  config: FireConfig,
  currentPortfolio: number,
  rng: () => number,
  currentAge: number,
  withdrawals: { gross1a: number; gross1b: number; gross2: number },
): { success: boolean; path: { age: number; portfolio: number }[] } {
  const { retirementAge, mortgageEndAge, pensionAge, lifeExpectancy, monthlyContribution, accumulationReturn, drawdownReturn, returnVolatility } = config;

  let portfolio = currentPortfolio;
  let depleted = false;
  const path: { age: number; portfolio: number }[] = [{ age: currentAge, portfolio }];
  let lastRecordedAge = Math.floor(currentAge);

  const totalMonths = Math.max(0, Math.round((lifeExpectancy - currentAge) * 12));
  let mRate = 0;

  for (let m = 0; m < totalMonths; m++) {
    const age = currentAge + m / 12;
    if (m % 12 === 0) {
      const isAccumulation = age < retirementAge;
      const annualReturn = drawAnnualReturn(rng, isAccumulation ? accumulationReturn : drawdownReturn, returnVolatility);
      mRate = monthlyRate(annualReturn);
    }

    if (age < retirementAge) {
      portfolio = portfolio * (1 + mRate) + monthlyContribution;
    } else if (!depleted) {
      const gross = age < mortgageEndAge ? withdrawals.gross1a
        : age < pensionAge ? withdrawals.gross1b
        : withdrawals.gross2;
      portfolio = portfolio * (1 + mRate) - gross;
      if (portfolio < 0) {
        portfolio = 0;
        depleted = true;
      }
    }

    const nextAge = currentAge + (m + 1) / 12;
    if (Math.floor(nextAge) > lastRecordedAge) {
      lastRecordedAge = Math.floor(nextAge);
      path.push({ age: lastRecordedAge, portfolio });
    }
  }

  return { success: !depleted, path };
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
  // Rounded to ~32-second precision: it's used as the key for the first path point
  // below, and computeCurrentAge is wall-clock-dependent (Date.now()), so two calls a
  // few milliseconds apart would otherwise produce a different float and silently fail
  // to line up with each other (or with the deterministic projection's own point) when
  // merged by age.
  const currentAge = Math.round(computeCurrentAge(config.dateOfBirth) * 1e6) / 1e6;
  const withdrawals = computePhaseGrossWithdrawals(config, activeIncomeMonthly);

  const rng = mulberry32(seed);
  // Keyed by age (the first point is the exact fractional currentAge, every later one a
  // whole age), not by array position — every trial visits the same age sequence, so
  // this is equivalent to indexing but self-documenting and order-independent.
  const byAge = new Map<number, number[]>();

  let successes = 0;
  for (let t = 0; t < trials; t++) {
    const { success, path } = simulateTrial(config, currentPortfolio, rng, currentAge, withdrawals);
    if (success) successes++;
    for (const point of path) {
      const values = byAge.get(point.age) ?? [];
      values.push(point.portfolio);
      byAge.set(point.age, values);
    }
  }

  const bands: MonteCarloBand[] = [...byAge.entries()]
    .sort(([a], [b]) => a - b)
    .map(([age, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return {
        age,
        p10: percentile(sorted, 0.10),
        p50: percentile(sorted, 0.50),
        p90: percentile(sorted, 0.90),
      };
    });

  return { trials, successProbability: successes / trials, bands };
}
