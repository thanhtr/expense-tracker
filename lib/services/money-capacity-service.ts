// Derives how much real cash the household can put toward Avios-goal flights, entirely from
// transactions and assets — never from a manually-maintained goal record. SavingsGoal/GoalsCard
// were retired (see PROJECT_SUMMARY.md, PR #98) and are not read here; "can we afford this
// flight" is answered purely by observed income/spend/invest behavior and existing bank balances.

import { computeInvestableCash } from './buffer-service';

export interface MoneyCapacityInput {
  /** Net income over the trailing 12 months (income - expenses), from getDashboardStats. */
  netTwelveMonths: number;
  /** Trailing-12-month Investments-category outflow, from the same getDashboardStats call —
   * stands in for "committed savings": money the household already, observably, sets aside each
   * month, without needing a separately maintained goal/target to say so. */
  investmentsTwelveMonths: number;
  /** Sum of Asset rows with type 'bank'. */
  bankTotal: number;
  /** Trailing-12-month average monthly income, from getDashboardStats — same basis FIRE uses
   * for its own emergency-fund buffer. */
  avgMonthlyIncome: number;
  /** The household's own configured buffer size (FireConfig.emergencyFundMonths), so both pages
   * agree on how much bank cash is a safety net rather than spare. */
  emergencyFundMonths: number;
}

export interface MoneyCapacity {
  /** Rolling-12mo net income minus the household's observed ongoing investing — what's left over
   * each month, on average, after real life and real investing both happened. Can be negative. */
  monthlyDiscretionary: number;
  /** Bank cash above the emergency-fund buffer — a one-time pool, not monthly flow, that can
   * close a near-term gap a few months of discretionary income alone wouldn't reach. */
  liquidBufferAvailable: number;
}

export function deriveMoneyCapacity(input: MoneyCapacityInput): MoneyCapacity {
  const monthlyDiscretionary = input.netTwelveMonths / 12 - input.investmentsTwelveMonths / 12;
  const { investableCash } = computeInvestableCash({
    bankTotal: input.bankTotal,
    avgMonthlyIncome: input.avgMonthlyIncome,
    emergencyFundMonths: input.emergencyFundMonths,
  });

  return { monthlyDiscretionary, liquidBufferAvailable: investableCash };
}
