// Derives how much real cash the household can put toward Avios-goal flights, entirely from
// transactions and assets — never from a manually-maintained goal record. SavingsGoal/GoalsCard
// were retired (see PROJECT_SUMMARY.md, PR #98) and are not read here.
//
// A flight is paid for out of the monthly *surplus* (income minus spending), not out of raw net
// income minus every investment outflow: a one-off investment lump funded from existing savings
// (an Internal Transfer drawing down an asset, not that month's income) is a balance-sheet move,
// not a recurring monthly commitment, and treating it as one made "can I afford it?" read as
// permanently, deeply negative for a household that was, in reality, running a healthy surplus.
// See PROJECT_SUMMARY.md, "Can I afford it? rebuilt around surplus..." for the full reasoning.

import { computeInvestableCash } from './buffer-service';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export interface MoneyCapacityInput {
  /** Income minus expenses, summed over `monthCount` completed calendar months (never including
   * a partial current month) — same income/expense basis as getDashboardStats. */
  netOverWindow: number;
  /** Number of completed months netOverWindow spans: a rolling 12, or fewer if less history
   * exists (pre-2026 data was deleted — see PROJECT_SUMMARY.md). */
  monthCount: number;
  /** One Investments-category total per month in the window, zero-filled for a month with none.
   * The median of these is the "regular" investing baseline — insensitive to a one-off lump that
   * was funded from existing savings rather than that month's income. */
  monthlyInvestments: number[];
  /** Sum of Asset rows with type 'bank'. */
  bankTotal: number;
  /** Sum of Asset rows with type in LIQUID_ASSET_TYPES (bank + investment + crypto) — the
   * ceiling for a flight that has to draw on existing wealth. */
  liquidAssetTotal: number;
  /** Average monthly income over the same window — same basis FIRE uses for its own
   * emergency-fund buffer, so both pages agree on what counts as a safety net. */
  avgMonthlyIncome: number;
  /** The household's own configured buffer size (FireConfig.emergencyFundMonths). */
  emergencyFundMonths: number;
}

export interface MoneyCapacity {
  /** Average monthly surplus (income - expenses) over the window. Can be negative. */
  monthlySurplus: number;
  /** Median monthly Investments-category spend — the household's observed "regular" ongoing
   * investing, not skewed by one-off lumps. */
  regularInvesting: number;
  /** monthlySurplus - regularInvesting: what's left each month after real life and regular
   * investing both happen, before touching the investing habit itself or existing wealth. Can
   * be negative. */
  freeMonthlyFlow: number;
  /** Bank cash above the emergency-fund buffer — a one-time pool. */
  liquidBufferAvailable: number;
  /** Bank + investment + crypto assets — context, and the ceiling for a flight that draws on
   * existing wealth rather than monthly flow. */
  liquidNetWorth: number;
}

export function deriveMoneyCapacity(input: MoneyCapacityInput): MoneyCapacity {
  const monthlySurplus = input.monthCount > 0 ? input.netOverWindow / input.monthCount : 0;
  const regularInvesting = median(input.monthlyInvestments);
  const freeMonthlyFlow = monthlySurplus - regularInvesting;
  const { investableCash } = computeInvestableCash({
    bankTotal: input.bankTotal,
    avgMonthlyIncome: input.avgMonthlyIncome,
    emergencyFundMonths: input.emergencyFundMonths,
  });

  return {
    monthlySurplus,
    regularInvesting,
    freeMonthlyFlow,
    liquidBufferAvailable: investableCash,
    liquidNetWorth: input.liquidAssetTotal,
  };
}
