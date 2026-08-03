'use client';

import { useState, useEffect, useRef } from 'react';
import { ACCOUNT_NAMES } from '@/lib/constants';

export interface TransactionFilterValues {
  dateFrom?: string;
  dateTo?: string;
  account?: string;
  type?: string;
  category?: string;
  paidBy?: string;
  merchant?: string;
  amountMin?: string;
  amountMax?: string;
}

interface TransactionFiltersProps {
  onFilter: (filters: TransactionFilterValues) => void;
}

export function TransactionFilters({ onFilter }: TransactionFiltersProps) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [merchant, setMerchant] = useState('');
  const [type, setType] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [uncategorizedOnly, setUncategorizedOnly] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Debounced versions of text/number inputs
  const [debouncedMerchant, setDebouncedMerchant] = useState('');
  const [debouncedAmountMin, setDebouncedAmountMin] = useState('');
  const [debouncedAmountMax, setDebouncedAmountMax] = useState('');

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

  // Skip the initial render so we don't duplicate the TransactionTable's own mount fetch
  const isInitialRender = useRef(true);
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    onFilter({
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      account: account || undefined,
      category: uncategorizedOnly ? '__uncategorized__' : (category || undefined),
      merchant: debouncedMerchant || undefined,
      type: type || undefined,
      paidBy: paidBy || undefined,
      amountMin: debouncedAmountMin || undefined,
      amountMax: debouncedAmountMax || undefined,
    });
  }, [dateFrom, dateTo, account, type, category, paidBy, uncategorizedOnly, debouncedMerchant, debouncedAmountMin, debouncedAmountMax, onFilter]);

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
    setUncategorizedOnly(false);
    onFilter({});
  };

  const activeCount = [dateFrom, dateTo, account, type, category, paidBy, merchant, amountMin, amountMax, uncategorizedOnly ? 'x' : ''].filter(Boolean).length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Date To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Account</label>
          <select
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            {ACCOUNT_NAMES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="Income">Income</option>
            <option value="Expense">Expense</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
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
          <label className="block text-xs font-medium text-gray-700 mb-1">Paid By</label>
          <select
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="tung">Tung</option>
            <option value="thuy">Thuy</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Merchant</label>
          <input
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Filter merchant..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Min amount €</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            placeholder="e.g. 10"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Max amount €</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            placeholder="e.g. 200"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={uncategorizedOnly}
            onChange={(e) => setUncategorizedOnly(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          Uncategorized only
        </label>
        <button
          onClick={handleReset}
          className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-300"
        >
          {activeCount > 0 ? `Reset (${activeCount})` : 'Reset'}
        </button>
      </div>
    </div>
  );
}
