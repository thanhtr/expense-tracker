// Converts an Avios shortfall into real acquisition options, using only the verified rates in
// lib/avios-facts.ts — no transaction data, no unsourced assumptions. See cash-plan-service.ts
// for the separate, transaction-based "can I actually afford this" check.

import {
  AMEX_MR_PER_EUR,
  PURCHASE_CAP_PER_YEAR,
  SUBSCRIPTION_EUR_PER_AVIOS,
  VISA_AVIOS_PER_EUR,
  aviosToMrPoints,
} from '@/lib/avios-facts';
import type { PointsFlightProgress, PointsGoalProgress } from './points-goal-service';

const AVG_DAYS_PER_MONTH = 30.4375;

export interface AviosStrategyConversion {
  flightId: number;
  flightLabel: string;
  neededBy: string;
  shortfallPoints: number;
  monthsUntil: number;
  eurTotal: number;
  eurPerMonth: number;
  mrPoints: number;
  mrPerMonth: number;
  visaSpendBasicTotal: number;
  visaSpendBasicPerMonth: number;
  visaSpendSilverTotal: number;
  visaSpendSilverPerMonth: number;
  amexSpendTotal: number;
  amexSpendPerMonth: number;
  overCap: boolean;
}

export interface AviosStrategyResult {
  allCovered: boolean;
  /** The soonest planned flight that isn't fully covered by the current balance. */
  nextAtRisk: AviosStrategyConversion | null;
  /** The combined shortfall across every planned flight, by the furthest neededBy date — only
   * present when it differs from nextAtRisk (i.e. more than one flight is short). */
  combined: AviosStrategyConversion | null;
}

function convert(flight: PointsFlightProgress, today: Date): AviosStrategyConversion {
  // The projected shortfall (accounting for observed earn pace) when available; otherwise the
  // cumulative gap as of today — everything due by this date minus what's already accrued — is
  // the conservative, pace-agnostic fallback. This is cumulative, not just this flight's own
  // remainingNow, so a later flight's conversion reflects the full commitment up to its date.
  const shortfallPoints = flight.shortfallAtDate ?? flight.remainingCumulative;
  const neededByDate = new Date(flight.neededBy);
  const monthsUntil = Math.max((neededByDate.getTime() - today.getTime()) / 86_400_000 / AVG_DAYS_PER_MONTH, 0);
  const divisor = monthsUntil > 0 ? monthsUntil : 1;

  const eurTotal = shortfallPoints * SUBSCRIPTION_EUR_PER_AVIOS;
  const mrPoints = aviosToMrPoints(shortfallPoints);
  const visaSpendBasicTotal = shortfallPoints / VISA_AVIOS_PER_EUR.basic;
  const visaSpendSilverTotal = shortfallPoints / VISA_AVIOS_PER_EUR.silver;
  // Amex earns MR, not Avios directly — spend enough to generate the MR needed, then transfer.
  const amexSpendTotal = mrPoints / AMEX_MR_PER_EUR;

  return {
    flightId: flight.id,
    flightLabel: flight.label,
    neededBy: flight.neededBy,
    shortfallPoints,
    monthsUntil,
    eurTotal,
    eurPerMonth: eurTotal / divisor,
    mrPoints,
    mrPerMonth: mrPoints / divisor,
    visaSpendBasicTotal,
    visaSpendBasicPerMonth: visaSpendBasicTotal / divisor,
    visaSpendSilverTotal,
    visaSpendSilverPerMonth: visaSpendSilverTotal / divisor,
    amexSpendTotal,
    amexSpendPerMonth: amexSpendTotal / divisor,
    overCap: shortfallPoints > PURCHASE_CAP_PER_YEAR,
  };
}

export function computeAviosStrategy(
  progress: PointsGoalProgress,
  today: Date = new Date(),
): AviosStrategyResult {
  const uncovered = progress.flights.filter((f) => f.remainingNow > 0);
  if (uncovered.length === 0) {
    return { allCovered: true, nextAtRisk: null, combined: null };
  }

  const first = uncovered[0]!;
  const last = uncovered[uncovered.length - 1]!;
  const nextAtRisk = convert(first, today);
  const combined = last.id !== first.id ? convert(last, today) : null;

  return { allCovered: false, nextAtRisk, combined };
}
