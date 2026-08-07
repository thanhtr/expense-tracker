'use client';

import { useState, useEffect, useRef } from 'react';
import { ACCOUNT_NAMES, TAGS } from '@/lib/constants';
import type { TransactionFilterValues } from '@/lib/types';

export type { TransactionFilterValues };

interface TransactionFiltersProps {
  onFilter: (filters: TransactionFilterValues) => void;
  initialFilters?: TransactionFilterValues;
}

export function TransactionFilters({ onFilter, initialFilters }: TransactionFiltersProps) {
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom ?? '');
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo ?? '');
  const [account, setAccount] = useState(initialFilters?.account ?? '');
  const [category, setCategory] = useState(initialFilters?.category ?? '');
  const [merchant, setMerchant] = useState(initialFilters?.merchant ?? '');
  const [type, setType] = useState(initialFilters?.type ?? '');
  const [paidBy, setPaidBy] = useState(initialFilters?.paidBy ?? '');
  const [amountMin, setAmountMin] = useState(initialFilters?.amountMin ?? '');
  const [amountMax, setAmountMax] = useState(initialFilters?.amountMax ?? '');
  const [tag, setTag] = useState(initialFilters?.tag ?? '');
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Debounced versions of text/number inputs
  const [debouncedMerchant, setDebouncedMerchant] = useState(initialFilters?.merchant ?? '');
  const [debouncedAmountMin, setDebouncedAmountMin] = useState(initialFilters?.amountMin ?? '');
  const [debouncedAmountMax, setDebouncedAmountMax] = useState(initialFilters?.amountMax ?? '');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedMerchant(merchant), 300);
    return () => clearTimeout(t);
  }, [merchant]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmountMin(amountMin), 300);
    return () => clearTimeout(t);
  }, [amountMin]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedAmountMax(amountMax), 300);
    return () => clearTimeout(t);
  }, [amountMax]);

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(data => setCategories(data.categories ?? []))
      .catch(() => {})
      .finally(() => setCategoriesLoading(false));
  }, []);

  // Keep a stable ref to onFilter so it never needs to be a dep
  const onFilterRef = useRef(onFilter);
  useEffect(() => { onFilterRef.current = onFilter; });

  // Skip the initial render so we don't duplicate the TransactionTable's own mount fetch
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    onFilterRef.current({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      account: account || undefined,
      category: uncategorizedOnly ? '__uncategorized__' : (category || undefined),
      merchant: debouncedMerchant || undefined,
      type: type || undefined,
      paidBy: paidBy || undefined,
      amountMin: debouncedAmountMin || undefined,
      amountMax: debouncedAmountMax || undefined,
      tag: tag || undefined,
    });
  }, [dateFrom, dateTo, account, type, category, paidBy, uncategorizedOnly, debouncedMerchant, debouncedAmountMin, debouncedAmountMax, tag]);

  const handleReset = () => {
    setDateFrom('');
    setDateTo('');
    setAccount('');
    setCategory('');
    setMerchant('');
    setType('');
    setPaidBy('');
    setAmountMin('');
    setAmountMax('');
    setTag('');
    setUncategorizedOnly(false);
    onFilter({});
  };

  const activeCount = [dateFrom, dateTo, account, type, category, paidBy, merchant, amountMin, amountMax, tag, uncategorizedOnly ? 'x' : ''].filter(Boolean).length;

  return (
    <div className="bg-surface rounded-lg border border-border-soft p-4 mb-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div>
          <label htmlFor="filter-date-from" className="block text-xs font-medium text-fg-2 mb-1">Date From</label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="filter-date-to" className="block text-xs font-medium text-fg-2 mb-1">Date To</label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="filter-account" className="block text-xs font-medium text-fg-2 mb-1">Account</label>
          <select
            id="filter-account"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {ACCOUNT_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="filter-type" className="block text-xs font-medium text-fg-2 mb-1">Type</label>
          <select
            id="filter-type"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="Income">Income</option>
            <option value="Expense">Expense</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-category" className="block text-xs font-medium text-fg-2 mb-1">Category</label>
          <select
            id="filter-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            disabled={categoriesLoading || uncategorizedOnly}
          >
            <option value="">All</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-paid-by" className="block text-xs font-medium text-fg-2 mb-1">Paid By</label>
          <select
            id="filter-paid-by"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="tung">Tung</option>
            <option value="thuy">Thuy</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-merchant" className="block text-xs font-medium text-fg-2 mb-1">Merchant</label>
          <input
            id="filter-merchant"
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Filter merchant..."
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="filter-amount-min" className="block text-xs font-medium text-fg-2 mb-1">Min amount €</label>
          <input
            id="filter-amount-min"
            type="number"
            min="0"
            step="0.01"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            placeholder="e.g. 10"
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="filter-amount-max" className="block text-xs font-medium text-fg-2 mb-1">Max amount €</label>
          <input
            id="filter-amount-max"
            type="number"
            min="0"
            step="0.01"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            placeholder="e.g. 200"
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="filter-tag" className="block text-xs font-medium text-fg-2 mb-1">Tag</label>
          <select
            id="filter-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="w-full px-3 py-2 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-fg-2 cursor-pointer">
          <input
            type="checkbox"
            checked={uncategorizedOnly}
            onChange={(e) => setUncategorizedOnly(e.target.checked)}
            className="w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500"
          />
          Uncategorized only
        </label>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-surface-2 text-fg-2 text-sm font-medium rounded-md hover:bg-[var(--border)]"
        >
          {activeCount > 0 ? `Reset (${activeCount})` : 'Reset'}
        </button>
      </div>
    </div>
  );
}
