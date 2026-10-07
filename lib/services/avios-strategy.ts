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
import { monthsBetween, type PointsFlightProgress, type PointsGoalProgress } from './points-goal-service';

export interface AviosStrategyConversion {
  flightId: number;
  flightLabel: string;
  neededBy: string;
  shortfallPoints: number;
  /** Divide any *Total figure by this to get a per-month amount, if needed. */
  monthsUntil: number;
  eurTotal: number;
  mrPoints: number;
  visaSpendBasicTotal: number;
  visaSpendSilverTotal: number;
  amexSpendTotal: number;
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
  const monthsUntil = Math.max(monthsBetween(today, flight.neededBy), 0);

  const mrPoints = aviosToMrPoints(shortfallPoints);

  return {
    flightId: flight.id,
    flightLabel: flight.label,
    neededBy: flight.neededBy,
    shortfallPoints,
    monthsUntil,
    eurTotal: shortfallPoints * SUBSCRIPTION_EUR_PER_AVIOS,
    mrPoints,
    visaSpendBasicTotal: shortfallPoints / VISA_AVIOS_PER_EUR.basic,
    visaSpendSilverTotal: shortfallPoints / VISA_AVIOS_PER_EUR.silver,
    // Amex earns MR, not Avios directly — spend enough to generate the MR needed, then transfer.
    amexSpendTotal: mrPoints / AMEX_MR_PER_EUR,
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
