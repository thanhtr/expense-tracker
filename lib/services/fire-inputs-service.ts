import { prisma } from '@/lib/db';
import { FIRE_RENTAL } from '@/lib/constants';
import { computeCurrentAge, type DerivedFireInputs, type StoredFireConfig } from '@/lib/services/fire-service';

// Employee contributions deducted from gross pay, 2026: TyEL pension 7.3% (tyoelake.fi)
// and unemployment insurance 0.89% (Työllisyysrahasto). The 30% income tax is the
// user's own flat estimate of withholding, not a sourced rate.
export const FI_EMPLOYEE_PENSION_CONTRIBUTION = 0.073;
export const FI_EMPLOYEE_UNEMPLOYMENT_CONTRIBUTION = 0.0089;
export const ASSUMED_INCOME_TAX_RATE = 0.30;

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
    const res = await fetch(EURIBOR_6M_URL, { next: { revalidate: 86_400 } } as RequestInit);
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
  fees: { merchant: string; share: number; paidMonthly: number; deductibleMonthly: number }[];
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

// Outstanding balance of an annuity loan, from its payment, rate and months left.
export function annuityBalance(paymentMonthly: number, annualRate: number, monthsLeft: number): number {
  if (monthsLeft <= 0 || paymentMonthly <= 0) return 0;
  const r = annualRate / 12;
  if (r === 0) return paymentMonthly * monthsLeft;
  return paymentMonthly * (1 - Math.pow(1 + r, -monthsLeft)) / r;
}

export async function deriveFireInputs(config: Pick<StoredFireConfig, 'dateOfBirth' | 'retirementAge' | 'mortgageEndAge'>, today = new Date()): Promise<DerivedInputsResult> {
  const since = new Date(today);
  since.setMonth(since.getMonth() - 12);

  const rentalRules = await prisma.incomeRule.findMany({
    where: { label: { startsWith: FIRE_RENTAL.incomeRuleLabelPrefix } },
  });
  const rentPatterns = rentalRules.map(r => r.merchantPattern).filter((p): p is string => !!p);

  const select = { date: true, amount: true } as const;
  const [salaryTxs, rentTxs, loanTxs, ...feeTxs] = await Promise.all([
    prisma.transaction.findMany({ where: { type: 'Income', category: 'Salary', date: { gte: since } }, select }),
    rentPatterns.length > 0
      ? prisma.transaction.findMany({
        where: { type: 'Income', date: { gte: since }, OR: rentPatterns.map(p => ({ merchant: { contains: p, mode: 'insensitive' as const } })) },
        select,
      })
      : Promise.resolve([] as Tx[]),
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

  const rent = monthlyAverage(rentTxs);
  const fees = FIRE_RENTAL.deductibleFees.map((f, i) => {
    const paidMonthly = monthlyAverage(feeTxs[i] ?? []).monthly;
    return { merchant: f.merchant, share: f.share, paidMonthly, deductibleMonthly: paidMonthly * f.share };
  });
  const netMonthly = rent.monthly - fees.reduce((sum, f) => sum + f.deductibleMonthly, 0);

  // The rental loan is an annuity ending at mortgageEndAge. Its deductible interest in
  // retirement is the exact average over retirement → loan end: payments made in that
  // window minus the principal they repay (the balance at retirement). Assumes today's
  // Euribor holds for the rest of the term.
  const euribor = await fetchEuribor6m();
  const loanRate = euribor.rate + FIRE_RENTAL.loanMargin;
  const loanPaymentMonthly = monthlyAverage(loanTxs).monthly;
  const currentAge = computeCurrentAge(config.dateOfBirth);
  const monthsLeft = Math.max(0, Math.round((config.mortgageEndAge - currentAge) * 12));
  const loanBalance = annuityBalance(loanPaymentMonthly, loanRate, monthsLeft);
  const monthsInRetirement = Math.max(0, Math.round((config.mortgageEndAge - Math.max(currentAge, config.retirementAge)) * 12));
  const balanceAtRetirement = annuityBalance(loanPaymentMonthly, loanRate, monthsInRetirement);
  const loanInterestMonthly = monthsInRetirement > 0
    ? (loanPaymentMonthly * monthsInRetirement - balanceAtRetirement) / monthsInRetirement
    : 0;

  return {
    inputs: {
      annualGrossEarnings: earnings.grossAnnual,
      rentalNetMonthly: netMonthly,
      rentalLoanInterestMonthly: loanInterestMonthly,
    },
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
