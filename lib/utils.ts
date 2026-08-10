import type { TransactionFilterValues } from './types';

/** Format a number as euros (Finnish locale). Default: whole euros. Pass { cents: true } for 2 decimal places. */
export function fmtEUR(n: number, opts: { cents?: boolean } = {}): string {
  const digits = opts.cents ? 2 : 0;
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(n).replace(/ /g, ' ');
}

/** Returns today as YYYY-MM-DD string */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function buildTransactionFilterParams(filters: TransactionFilterValues): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('date_from', filters.dateFrom);
  if (filters.dateTo) params.set('date_to', filters.dateTo);
  if (filters.account) params.set('account', filters.account);
  if (filters.category) params.set('category', filters.category);
  if (filters.merchant) params.set('merchant', filters.merchant);
  if (filters.type) params.set('type', filters.type);
  if (filters.paidBy) params.set('paid_by', filters.paidBy);
  if (filters.amountMin) params.set('amount_min', filters.amountMin);
  if (filters.amountMax) params.set('amount_max', filters.amountMax);
  if (filters.tag) params.set('tag', filters.tag);
  return params;
}

export function formatDate(date: string | Date): string {
  if (typeof date === 'string') return date.slice(0, 10);
  return date.toISOString().slice(0, 10);
}
