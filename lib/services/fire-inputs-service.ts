import { prisma } from '@/lib/db';
import { FIRE_RENTAL } from '@/lib/constants';
import { matchesAnyIncomeRule } from '@/lib/services/income-rules-service';
import {
  ASSUMED_INCOME_TAX_RATE,
  FI_EMPLOYEE_PENSION_CONTRIBUTION,
  FI_EMPLOYEE_UNEMPLOYMENT_CONTRIBUTION,
  annuityBalance,
  computeCurrentAge,
  rentalLoanInterestInRetirement,
  type DerivedFireInputs,
  type StoredFireConfig,
} from '@/lib/services/fire-service';

// Server-only: reads transactions through Prisma. Client components must import
// constants from fire-service (DB-free) and only *types* from here.

// ECB Data Portal: 6-month Euribor, monthly average. Fallback is the August 2026 value
// (2.713%) from the same series, used if the API is unreachable.
const EURIBOR_6M_URL = 'https://data-api.ecb.europa.eu/service/data/FM/M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA?lastNObservations=1&format=csvdata';
const EURIBOR_6M_FALLBACK = { rate: 0.027133, period: '2026-08', live: false };

export interface EuriborQuote {
  rate: number;
  period: string;
  live: boolean;
}

export async function fetchEuribor6m(): Promise<EuriborQuote> {
  try {
    const res = await fetch(EURIBOR_6M_URL, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(3000) } as RequestInit);
    if (!res.ok) return EURIBOR_6M_FALLBACK;
    const [header, row] = (await res.text()).trim().split('\n');
    const cols = header!.split(',');
    const values = row!.split(',');
    const pct = parseFloat(values[cols.indexOf('OBS_VALUE')] ?? '');
    const period = values[cols.indexOf('TIME_PERIOD')] ?? '';
    if (!Number.isFinite(pct)) return EURIBOR_6M_FALLBACK;
    return { rate: pct / 100, period, live: true };
  } catch {
    return EURIBOR_6M_FALLBACK;
  }
}

interface Tx { date: Date; amount: number }

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

// Average per month over the months that actually have a payment, so a history
// shorter than 12 months isn't diluted.
function monthlyAverage(txs: Tx[]): { monthly: number; months: number } {
  const months = new Set(txs.map(t => monthKey(t.date))).size;
  const total = txs.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return { monthly: months > 0 ? total / months : 0, months };
}

export interface EarningsBreakdown {
  netMonthly: number;
  months: number;
  grossAnnual: number;
}

export interface RentalBreakdown {
  rentMonthly: number;
  rentMonths: number;
  fees: { merchant: string; share: number; cash: boolean; paidMonthly: number; deductibleMonthly: number }[];
  netMonthly: number;
  loanPaymentMonthly: number;
  loanRate: number;
  euribor: EuriborQuote;
  loanBalance: number;
  loanInterestMonthly: number;
}

export interface DerivedInputsResult {
  inputs: DerivedFireInputs;
  earnings: EarningsBreakdown;
  rental: RentalBreakdown;
}

export function grossFromNet(netAnnual: number): number {
  return netAnnual / (1 - ASSUMED_INCOME_TAX_RATE - FI_EMPLOYEE_PENSION_CONTRIBUTION - FI_EMPLOYEE_UNEMPLOYMENT_CONTRIBUTION);
}

export async function deriveFireInputs(config: Pick<StoredFireConfig, 'dateOfBirth' | 'retirementAge' | 'mortgageEndAge'>, today = new Date()): Promise<DerivedInputsResult> {
  const since = new Date(today);
  since.setMonth(since.getMonth() - 12);

  const rentalRules = await prisma.incomeRule.findMany({
    where: { label: { startsWith: FIRE_RENTAL.incomeRuleLabelPrefix } },
  });

  const select = { date: true, amount: true } as const;
  const [salaryTxs, incomeTxs, loanTxs, ...feeTxs] = await Promise.all([
    prisma.transaction.findMany({ where: { type: 'Income', category: 'Salary', date: { gte: since } }, select }),
    rentalRules.length > 0
      ? prisma.transaction.findMany({
        where: { type: 'Income', date: { gte: since } },
        select: { ...select, merchant: true, category: true },
      })
      : Promise.resolve([] as (Tx & { merchant: string; category: string })[]),
    prisma.transaction.findMany({ where: { type: 'Expense', date: { gte: since }, merchant: { contains: FIRE_RENTAL.loanPayee } }, select }),
    ...FIRE_RENTAL.deductibleFees.map(f =>
      prisma.transaction.findMany({ where: { type: 'Expense', date: { gte: since }, merchant: { contains: f.merchant, mode: 'insensitive' } }, select })),
  ]);

  const salary = monthlyAverage(salaryTxs);
  const earnings: EarningsBreakdown = {
    netMonthly: salary.monthly,
    months: salary.months,
    grossAnnual: grossFromNet(salary.monthly * 12),
  };

  // Same matching as elsewhere: a rule's merchant pattern and category must both match.
  const rent = monthlyAverage(incomeTxs.filter(t => matchesAnyIncomeRule(t, rentalRules)));
  const fees = FIRE_RENTAL.deductibleFees.map((f, i) => {
    const paidMonthly = monthlyAverage(feeTxs[i] ?? []).monthly;
    return { merchant: f.merchant, share: f.share, cash: f.cash, paidMonthly, deductibleMonthly: paidMonthly * f.share };
  });
  const sumFees = (cash: boolean) => fees.filter(f => f.cash === cash).reduce((sum, f) => sum + f.deductibleMonthly, 0);
  const netMonthly = rent.monthly - sumFees(true);

  // The rental loan is an annuity ending at mortgageEndAge. Assumes today's Euribor
  // holds for the rest of the term.
  const euribor = await fetchEuribor6m();
  const loanRate = euribor.rate + FIRE_RENTAL.loanMargin;
  const loanPaymentMonthly = monthlyAverage(loanTxs).monthly;
  const monthsLeft = Math.max(0, Math.round((config.mortgageEndAge - computeCurrentAge(config.dateOfBirth)) * 12));
  const loanBalance = annuityBalance(loanPaymentMonthly, loanRate, monthsLeft);

  const inputs: DerivedFireInputs = {
    annualGrossEarnings: earnings.grossAnnual,
    rentalNetMonthly: netMonthly,
    rentalTaxOnlyDeductionsMonthly: sumFees(false),
    rentalLoanPaymentMonthly: loanPaymentMonthly,
    rentalLoanRate: loanRate,
  };
  // For display at the saved retirement age; the model recomputes it per age tested.
  const loanInterestMonthly = rentalLoanInterestInRetirement({ ...config, ...inputs });

  return {
    inputs,
    earnings,
    rental: {
      rentMonthly: rent.monthly,
      rentMonths: rent.months,
      fees,
      netMonthly,
      loanPaymentMonthly,
      loanRate,
      euribor,
      loanBalance,
      loanInterestMonthly,
    },
  };
}
