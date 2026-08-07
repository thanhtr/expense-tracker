import type { TransactionFilterValues } from './types';

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
