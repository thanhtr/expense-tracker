// What-if: project each planned flight's Avios coverage under two forward paces — "keep Amex"
// (today's combined Visa + Amex MR earn continues indefinitely) vs "cancel Amex" (MR earn stops
// at a given date, after converting whatever MR balance exists at that point). Pure function, no
// DB access; the caller supplies the expected per-card rates already computed by
// avios-earn-service.ts's computeAviosEarnReconciliation, since that's the steadier, card-spend-
// based pace — the observed pace mixes in flight-earned Avios and lumps that can't be split by
// card. See PROJECT_SUMMARY.md "Avios goal tracking" and AviosExplainer.tsx for context.

import {
  AMEX_PLATINUM_MONTHLY_FEE_EUR,
  AVIOS_PER_TRANSFER_UNIT,
  MR_PER_TRANSFER_UNIT,
  SALE_EUR_PER_AVIOS,
  mrToAvios,
} from '@/lib/avios-facts';
import { monthsBetween, type PointsFlightProgress, type PointsGoalProgress } from './points-goal-service';

export interface AmexScenarioFlight {
  id: number;
  label: string;
  neededBy: string;
  cumulativeNeeded: number;
  /** Projected total available Avios at neededBy if Amex is kept indefinitely. */
  projectedKeep: number;
  /** Projected total available Avios at neededBy if Amex is cancelled on cancelDate. */
  projectedCancel: number;
  shortfallKeep: number;
  shortfallCancel: number;
  /** How much worse the shortfall gets purely because of the cancellation (>= 0). */
  extraShortfall: number;
  /** Cost of closing the cancel-scenario shortfall at the sale price. */
  eurToCloseCancel: number;
  /** Amex Platinum fee saved between the cancellation date and this flight's neededBy (0 if
   * neededBy is before the cancellation date). */
  feeSavedByDate: number;
}

export interface AmexScenarioResult {
  cancelDate: string;
  /** The Amex MR balance (and its Avios equivalent) that needs transferring before closing the
   * card — it's forfeited otherwise. Reflects growth up to the cancellation date, clamped to not
   * go before today's actual balance. */
  mrToTransferAtCancel: number;
  mrToTransferAviosEquivalent: number;
  organicAviosPerYearKeep: number;
  organicAviosPerYearCancel: number;
  flights: AmexScenarioFlight[];
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

export function computeAmexCancelScenario(input: {
  progress: PointsGoalProgress;
  expectedAviosPerMonth: number;
  expectedMrPerMonth: number;
  cancelDate: Date | string;
  today?: Date;
}): AmexScenarioResult {
  const { progress, expectedAviosPerMonth, expectedMrPerMonth, cancelDate } = input;
  const today = input.today ?? new Date();
  const cancelDateObj = toDate(cancelDate);

  // The latest reading's pure Avios balance, with the MR-converted portion stripped back out —
  // MR is projected forward separately below and re-converted, so it isn't counted twice.
  const aviosPart = progress.availableBalance - progress.amexMrAviosEquivalent;
  const latestAmexMr = progress.latestAmexMr;

  function projectAvios(target: Date, cancelAt: Date | null): number {
    const visaMonths = Math.max(monthsBetween(today, target), 0);
    const mrEnd = cancelAt !== null && cancelAt.getTime() < target.getTime() ? cancelAt : target;
    const mrMonths = Math.max(monthsBetween(today, mrEnd), 0);
    const projectedMr = latestAmexMr + expectedMrPerMonth * mrMonths;
    return aviosPart + expectedAviosPerMonth * visaMonths + mrToAvios(projectedMr);
  }

  const mrMonthsToCancel = Math.max(monthsBetween(today, cancelDateObj), 0);
  const mrToTransferAtCancel = latestAmexMr + expectedMrPerMonth * mrMonthsToCancel;

  const avgAviosPerMr = AVIOS_PER_TRANSFER_UNIT / MR_PER_TRANSFER_UNIT;
  const organicAviosPerYearKeep = (expectedAviosPerMonth + expectedMrPerMonth * avgAviosPerMr) * 12;
  const organicAviosPerYearCancel = expectedAviosPerMonth * 12;

  const planned = progress.flights.filter(
    (f): f is PointsFlightProgress & { status: 'planned' } => f.status === 'planned',
  );

  const flights: AmexScenarioFlight[] = planned.map((f) => {
    const neededByDate = toDate(f.neededBy);
    const projectedKeep = projectAvios(neededByDate, null);
    const projectedCancel = projectAvios(neededByDate, cancelDateObj);
    const shortfallKeep = Math.max(f.cumulativeNeeded - projectedKeep, 0);
    const shortfallCancel = Math.max(f.cumulativeNeeded - projectedCancel, 0);
    const feeSavedByDate = AMEX_PLATINUM_MONTHLY_FEE_EUR * Math.max(monthsBetween(cancelDateObj, neededByDate), 0);

    return {
      id: f.id,
      label: f.label,
      neededBy: f.neededBy,
      cumulativeNeeded: f.cumulativeNeeded,
      projectedKeep,
      projectedCancel,
      shortfallKeep,
      shortfallCancel,
      extraShortfall: Math.max(shortfallCancel - shortfallKeep, 0),
      eurToCloseCancel: shortfallCancel * SALE_EUR_PER_AVIOS,
      feeSavedByDate,
    };
  });

  return {
    cancelDate: cancelDateObj.toISOString().slice(0, 10),
    mrToTransferAtCancel,
    mrToTransferAviosEquivalent: mrToAvios(mrToTransferAtCancel),
    organicAviosPerYearKeep,
    organicAviosPerYearCancel,
    flights,
  };
}
