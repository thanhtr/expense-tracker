// Pure computation (no DB) for the expected-vs-observed Avios/MR earn reconciliation. Reads
// card-spend classification from user-maintained `CardEarnRule` rows (see
// lib/services/income-rules-service.ts for the exact same merchant-matching convention this
// mirrors) instead of hardcoding which merchants are bonus-rate or excluded — the official rules
// (Amex's bonus-partner list, what counts as a "bill payment" or "cash withdrawal") aren't
// reliably identifiable from a category or always from the source's own wording, so this is a
// tool to maintain as real examples are noticed, not a guess.
//
// Flight-earned Avios (6-7/€, tied to actually completing a flight with a linked Finnair Plus
// number) are never modelled here — they don't depend on which card paid, so no merchant rule
// could capture them either. See AviosExplainer.tsx for this stated limitation.

import {
  AMEX_BONUS_MR_PER_EUR,
  AMEX_MR_PER_EUR,
  TIER_POINTS_MONTHLY_SPEND_THRESHOLD_EUR,
  TIER_POINTS_PER_QUALIFYING_MONTH,
  VISA_AVIOS_PER_EUR,
  type FinnairTier,
} from '@/lib/avios-facts';
import { monthString } from './stats';

export type EarnClassification = 'normal' | 'bonus' | 'excluded';

export interface CardEarnRuleInput {
  account: string;
  merchantPattern: string;
  classification: EarnClassification;
}

export interface CardTransactionInput {
  account: string;
  merchant: string;
  amount: number;
  date: Date | string;
}

export interface AviosEarnReconciliation {
  expectedAviosPerMonth: number;
  expectedMrPerMonth: number;
  qualifyingTierPointMonths: number;
  monthsInWindow: number;
  expectedTierPoints: number;
}

/** Classifies one transaction's merchant against the account-scoped rules. Case-insensitive
 * substring match, same convention as income-rules-service.ts's matchesAnyIncomeRule. When
 * multiple rules match, the longest matching pattern wins (same longest-match tie-break the
 * categorizer already uses, documented in PROJECT_SUMMARY.md). No match -> 'normal'. */
export function classifyTransaction(
  merchant: string,
  account: string,
  rules: CardEarnRuleInput[],
): EarnClassification {
  const merchantUpper = merchant.toUpperCase();
  let best: { classification: EarnClassification; patternLength: number } | null = null;

  for (const rule of rules) {
    if (rule.account !== account) continue;
    if (!merchantUpper.includes(rule.merchantPattern.toUpperCase())) continue;
    if (best === null || rule.merchantPattern.length > best.patternLength) {
      best = { classification: rule.classification, patternLength: rule.merchantPattern.length };
    }
  }

  return best?.classification ?? 'normal';
}

function absAmount(amount: number): number {
  return Math.abs(amount);
}

export function computeAviosEarnReconciliation(input: {
  transactions: CardTransactionInput[];
  rules: CardEarnRuleInput[];
  tier: FinnairTier;
  months: string[];
}): AviosEarnReconciliation {
  const { transactions, rules, tier, months } = input;

  let visaEarningSpend = 0; // 'normal' + 'bonus' classified Visa spend (bonus has no distinct Visa rate today)
  let amexNormalSpend = 0;
  let amexBonusSpend = 0;
  const visaSpendByMonth = new Map<string, number>();

  for (const tx of transactions) {
    const classification = classifyTransaction(tx.merchant, tx.account, rules);
    if (classification === 'excluded') continue;

    const amount = absAmount(tx.amount);
    if (tx.account === 'Finnair Visa') {
      visaEarningSpend += amount;
      const m = monthString(tx.date instanceof Date ? tx.date : new Date(tx.date));
      visaSpendByMonth.set(m, (visaSpendByMonth.get(m) ?? 0) + amount);
    } else if (tx.account === 'Amex') {
      if (classification === 'bonus') amexBonusSpend += amount;
      else amexNormalSpend += amount;
    }
  }

  const monthsInWindow = months.length;
  const expectedAviosPerMonth =
    monthsInWindow > 0 ? (visaEarningSpend * VISA_AVIOS_PER_EUR[tier]) / monthsInWindow : 0;
  const expectedMrPerMonth =
    monthsInWindow > 0
      ? (amexNormalSpend * AMEX_MR_PER_EUR + amexBonusSpend * AMEX_BONUS_MR_PER_EUR) / monthsInWindow
      : 0;

  const qualifyingTierPointMonths = months.filter(
    (m) => (visaSpendByMonth.get(m) ?? 0) >= TIER_POINTS_MONTHLY_SPEND_THRESHOLD_EUR,
  ).length;
  const expectedTierPoints = qualifyingTierPointMonths * TIER_POINTS_PER_QUALIFYING_MONTH;

  return {
    expectedAviosPerMonth,
    expectedMrPerMonth,
    qualifyingTierPointMonths,
    monthsInWindow,
    expectedTierPoints,
  };
}
