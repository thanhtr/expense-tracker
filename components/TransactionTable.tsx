'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TransactionRow } from './TransactionRow';
import { useCategories } from '@/components/CategoriesProvider';
import { useHouseholdMembers } from '@/components/HouseholdMembersProvider';
import type { Transaction, TransactionFilterValues } from '@/lib/types';
import { buildTransactionFilterParams, formatDate } from '@/lib/utils';

const TAG_COLORS: Record<string, string> = {
  reimbursable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  work: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  holiday: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  shared: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'one-time': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  recurring: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

function tagColor(tag: string) {
  return TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  }).format(Math.abs(n));
}

interface MobileCardProps {
  transaction: Transaction;
  categories: string[];
  onUpdate: (id: number, category: string) => Promise<void>;
  onDelete: (id: number) => void;
  selected?: boolean;
  onSelect?: (id: number, checked: boolean, shiftKey: boolean) => void;
}

function TransactionMobileCard({ transaction, categories, onUpdate, onDelete, selected, onSelect }: MobileCardProps) {
  const { nameForSlug } = useHouseholdMembers();
  const [category, setCategory] = useState(transaction.category);
  const [saving, setSaving] = useState(false);
  const shiftRef = useRef(false);

  const isExpense = transaction.type === 'Expense' && transaction.amount < 0;
  const amountColor = isExpense
    ? 'text-red-600 dark:text-red-400'
    : 'text-green-600 dark:text-green-400';
  const amountPrefix = isExpense ? '−' : '+';

  const handleCategoryChange = async (newCategory: string) => {
    if (newCategory === category) return;
    const prev = category;
    setCategory(newCategory);
    setSaving(true);
    try {
      await onUpdate(transaction.id, newCategory);
    } catch {
      toast.error('Failed to update category');
      setCategory(prev);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      onDelete(transaction.id);
    }
  };

  const netAmount = Math.abs(transaction.amount) - (transaction.reimbursedAmount ?? 0);

  return (
    <div className={`border-b border-border-soft px-4 py-3 ${selected ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}>
      <div className="flex items-start gap-3">
        {onSelect && (
          <input
            type="checkbox"
            aria-label={`Select ${transaction.merchant}`}
            checked={selected ?? false}
            onMouseDown={(e) => { if (e.button === 0) shiftRef.current = e.shiftKey; }}
            onChange={(e) => { const shift = shiftRef.current; shiftRef.current = false; onSelect(transaction.id, e.target.checked, shift); }}
            className="mt-1 w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500 shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          {/* Merchant + amount */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{transaction.merchant}</div>
              <div className="text-xs text-fg-3 mt-0.5">
                {formatDate(transaction.date)}
                {transaction.paidBy && <span className="ml-2 text-fg-3">· {nameForSlug(transaction.paidBy)}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`font-semibold text-sm ${amountColor}`}>
                {amountPrefix}{fmtCurrency(transaction.amount)}
              </div>
              {!!transaction.reimbursedAmount && (
                <div className="text-[10px] text-fg-3">Net {fmtCurrency(netAmount)}</div>
              )}
            </div>
          </div>

          {/* Tags */}
          {(transaction.tags ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {(transaction.tags ?? []).map(t => (
                <span key={t} className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tagColor(t)}`}>
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Note */}
          {transaction.note && (
            <div className="text-xs text-fg-3 mt-1 truncate">{transaction.note}</div>
          )}

          {/* Category + actions */}
          <div className="flex items-center gap-2 mt-2">
            <select
              aria-label="Category"
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value)}
              disabled={saving}
              className={`flex-1 cursor-pointer rounded text-xs border border-border-soft px-2 py-1.5 bg-surface-2 focus:outline-none focus:ring-1 focus:ring-blue-500 ${saving ? 'opacity-50' : ''} ${!category ? 'text-amber-600 dark:text-amber-400' : ''}`}
            >
              {!category && <option value="">⚠ Uncategorized</option>}
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handleDelete}
              aria-label="Delete transaction"
              title="Delete transaction"
              className="p-1.5 rounded text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransactionTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="h-5 w-56 bg-[var(--border)] rounded animate-pulse" />
        <div className="h-9 w-28 bg-[var(--border)] rounded animate-pulse" />
      </div>
      <div className="hidden sm:block overflow-x-auto bg-surface rounded-lg border border-border-soft">
        <table className="w-full table-fixed" aria-hidden="true">
          <thead className="bg-surface-2 border-b border-border-soft animate-pulse">
            <tr>
              <th className="w-9 px-3 py-3"><div className="h-4 w-4 bg-[var(--border)] rounded" /></th>
              <th className="w-28 px-4 py-3"><div className="h-4 w-12 bg-[var(--border)] rounded" /></th>
              <th className="hidden md:table-cell w-28 px-4 py-3"><div className="h-4 w-14 bg-[var(--border)] rounded" /></th>
              <th className="px-4 py-3"><div className="h-4 w-20 bg-[var(--border)] rounded" /></th>
              <th className="w-24 px-4 py-3"><div className="h-4 w-14 bg-[var(--border)] rounded ml-auto" /></th>
              <th className="hidden sm:table-cell w-36 px-4 py-3"><div className="h-4 w-16 bg-[var(--border)] rounded" /></th>
              <th className="hidden md:table-cell w-20 px-4 py-3"><div className="h-4 w-12 bg-[var(--border)] rounded" /></th>
              <th className="hidden md:table-cell px-4 py-3"><div className="h-4 w-10 bg-[var(--border)] rounded" /></th>
              <th className="w-28 px-2 py-3" />
            </tr>
          </thead>
          <tbody className="animate-pulse">
            {[80, 55, 70, 40, 65, 50, 75, 45].map((w, i) => (
              <tr key={i} className="border-b border-border-soft">
                <td className="w-9 px-3 py-3"><div className="h-4 w-4 bg-[var(--border)] rounded" /></td>
                <td className="w-28 px-4 py-3"><div className="h-4 w-16 bg-[var(--border)] rounded" /></td>
                <td className="hidden md:table-cell w-28 px-4 py-3"><div className="h-4 w-18 bg-[var(--border)] rounded" /></td>
                <td className="px-4 py-3"><div className="h-4 bg-[var(--border)] rounded" style={{ width: `${w}%` }} /></td>
                <td className="w-24 px-4 py-3"><div className="h-4 w-14 bg-[var(--border)] rounded ml-auto" /></td>
                <td className="hidden sm:table-cell w-36 px-4 py-3"><div className="h-5 w-20 bg-[var(--border)] rounded-full" /></td>
                <td className="hidden md:table-cell w-20 px-4 py-3"><div className="h-4 w-10 bg-[var(--border)] rounded" /></td>
                <td className="hidden md:table-cell px-4 py-3"><div className="h-4 w-24 bg-[var(--border)] rounded" /></td>
                <td className="w-28 px-2 py-3" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile skeleton */}
      <div className="sm:hidden bg-surface rounded-lg border border-border-soft animate-pulse">
        {[90, 70, 80, 60, 75].map((w, i) => (
          <div key={i} className="border-b border-border-soft px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-[var(--border)] rounded" style={{ width: `${w}%` }} />
                <div className="h-3 w-24 bg-[var(--border)] rounded" />
              </div>
              <div className="h-4 w-16 bg-[var(--border)] rounded shrink-0" />
            </div>
            <div className="flex items-center gap-2 mt-3">
              <div className="h-7 flex-1 bg-[var(--border)] rounded" />
              <div className="h-7 w-7 bg-[var(--border)] rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface TransactionTableProps {
  filters?: TransactionFilterValues;
}

export function TransactionTable({ filters = {} }: TransactionTableProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const { categories } = useCategories();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkType, setBulkType] = useState('');
  const lastSelectedIndex = useRef<number | null>(null);
  const transactionsRef = useRef<Transaction[]>([]);
  const limit = 50;

  const handleSort = (field: 'date' | 'amount') => {
    if (sortBy === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setOffset(0);
  };

  const handleSelect = useCallback((id: number, checked: boolean, shiftKey: boolean) => {
    const txns = transactionsRef.current;
    const index = txns.findIndex(t => t.id === id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedIndex.current !== null && index !== -1) {
        const from = Math.min(lastSelectedIndex.current, index);
        const to = Math.max(lastSelectedIndex.current, index);
        for (let i = from; i <= to; i++) {
          if (checked) { next.add(txns[i]!.id); } else { next.delete(txns[i]!.id); }
        }
      } else {
        if (checked) { next.add(id); } else { next.delete(id); }
      }
      return next;
    });
    if (index !== -1 && !shiftKey) lastSelectedIndex.current = index;
  }, []);

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(transactions.map(t => t.id)) : new Set());
    lastSelectedIndex.current = null;
  };

  const handleBulkCategorize = async () => {
    if (!bulkCategory || selectedIds.size === 0) return;
    try {
      const res = await fetch('/api/transactions/bulk-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), category: bulkCategory }),
      });
      if (res.ok) {
        const { updated } = await res.json();
        setTransactions(prev =>
          prev.map(t => selectedIds.has(t.id) ? { ...t, category: bulkCategory } : t)
        );
        setSelectedIds(new Set());
        setBulkCategory('');
        toast.success(`Updated ${updated} transaction${updated === 1 ? '' : 's'}`);
      } else {
        toast.error('Failed to update');
      }
    } catch {
      toast.error('Failed to update');
    }
  };

  const handleBulkRetype = async () => {
    if (!bulkType || selectedIds.size === 0) return;
    try {
      const res = await fetch('/api/transactions/bulk-retype', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), type: bulkType }),
      });
      if (res.ok) {
        const { updated } = await res.json();
        setTransactions(prev =>
          prev.map(t => selectedIds.has(t.id) ? { ...t, type: bulkType } : t)
        );
        setSelectedIds(new Set());
        setBulkType('');
        toast.success(`Updated ${updated} transaction${updated === 1 ? '' : 's'}`);
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        toast.error(body.error ?? 'Failed to update type');
      }
    } catch {
      toast.error('Failed to update type');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} transaction${selectedIds.size === 1 ? '' : 's'}? This cannot be undone.`)) return;
    try {
      const res = await fetch('/api/transactions/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (res.ok) {
        const { deleted } = await res.json();
        setTransactions(prev => prev.filter(t => !selectedIds.has(t.id)));
        setTotal(prev => prev - deleted);
        setSelectedIds(new Set());
        toast.success(`Deleted ${deleted} transaction${deleted === 1 ? '' : 's'}`);
      } else {
        toast.error('Failed to delete');
      }
    } catch {
      toast.error('Failed to delete');
    }
  };

  useEffect(() => {
    setOffset(0);
    setSelectedIds(new Set());
    lastSelectedIndex.current = null;
  }, [filters]);

  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setSelectedIds(new Set());
    lastSelectedIndex.current = null;
  }, [offset, sortBy, sortOrder]);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const params = buildTransactionFilterParams(filters);
        params.set('limit', limit.toString());
        params.set('offset', offset.toString());
        params.set('sort_by', sortBy);
        params.set('order', sortOrder);

        const res = await fetch(`/api/transactions?${params}`);
        if (res.ok) {
          const data = await res.json();
          transactionsRef.current = data.transactions;
          setTransactions(data.transactions);
          setTotal(data.total);
        }
      } catch (error) {
        console.error('Failed to fetch transactions:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [offset, filters, limit, sortBy, sortOrder]);

  const handleUpdate = useCallback(async (id: number, category: string) => {
    const res = await fetch(`/api/transactions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? 'Failed to update category');
    }
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category } : t));
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setTransactions(prev => prev.filter(t => t.id !== id));
        setTotal(prev => prev - 1);
      }
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  }, []);

  const handleExport = async () => {
    const params = buildTransactionFilterParams(filters);
    const url = `/api/export?${params}`;
    window.open(url, '_blank');
  };

  if (loading && transactions.length === 0) {
    return <TransactionTableSkeleton />;
  }

  const maxPage = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-fg-2">
          {total === 0
            ? '0 transactions'
            : `Showing ${offset + 1} to ${Math.min(offset + limit, total)} of ${total} transactions`}
        </div>
        <button
          onClick={handleExport}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700"
        >
          Export CSV
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm">
          <span className="text-blue-700 dark:text-blue-300 font-medium">{selectedIds.size} selected</span>
          <select
            aria-label="Bulk category"
            value={bulkCategory}
            onChange={(e) => setBulkCategory(e.target.value)}
            className="px-2 py-1 border border-border-soft rounded bg-surface text-foreground text-sm"
          >
            <option value="">Choose category…</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button
            onClick={handleBulkCategorize}
            disabled={!bulkCategory}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
          <span className="border-l border-blue-300 dark:border-blue-700 h-5" />
          <select
            aria-label="Bulk type"
            value={bulkType}
            onChange={(e) => setBulkType(e.target.value)}
            className="px-2 py-1 border border-border-soft rounded bg-surface text-foreground text-sm"
          >
            <option value="">Set type…</option>
            <option value="Income">Income</option>
            <option value="Expense">Expense</option>
          </select>
          <button
            onClick={handleBulkRetype}
            disabled={!bulkType}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Set
          </button>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={() => { setSelectedIds(new Set()); setBulkType(''); setBulkCategory(''); }}
            className="px-3 py-1 bg-surface-2 text-fg-2 rounded text-sm font-medium hover:bg-[var(--border)]"
          >
            Deselect all
          </button>
        </div>
      )}

      {/* Mobile card list */}
      <div className="sm:hidden bg-surface rounded-lg border border-border-soft">
        {!loading && transactions.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-fg-3">
            {Object.values(filters).some(Boolean)
              ? 'No transactions match your filters'
              : <><span>No transactions yet — </span><a href="/upload" className="underline text-fg-2">upload a CSV to get started →</a></>}
          </div>
        ) : (
          transactions.map((transaction) => (
            <TransactionMobileCard
              key={transaction.id}
              transaction={transaction}
              categories={categories}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              selected={selectedIds.has(transaction.id)}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto bg-surface rounded-lg border border-border-soft">
        <table className="w-full table-fixed">
          <thead className="bg-surface-2 border-b border-border-soft">
            <tr>
              <th className="w-9 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all transactions"
                  checked={transactions.length > 0 && selectedIds.size === transactions.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="w-28 px-4 py-3 text-left text-xs font-medium text-fg-2 cursor-pointer select-none hover:bg-surface-2" onClick={() => handleSort('date')}>
                Date {sortBy === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : <span className="text-fg-3">↕</span>}
              </th>
              <th className="hidden md:table-cell w-28 px-4 py-3 text-left text-xs font-medium text-fg-2">Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-fg-2">Merchant</th>
              <th className="w-24 px-4 py-3 text-right text-xs font-medium text-fg-2 cursor-pointer select-none hover:bg-surface-2" onClick={() => handleSort('amount')}>
                Amount {sortBy === 'amount' ? (sortOrder === 'asc' ? '↑' : '↓') : <span className="text-fg-3">↕</span>}
              </th>
              <th className="hidden sm:table-cell w-36 px-4 py-3 text-left text-xs font-medium text-fg-2">Category</th>
              <th className="hidden md:table-cell w-20 px-4 py-3 text-left text-xs font-medium text-fg-2">Paid By</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-fg-2">Note</th>
              <th className="w-28 px-2 py-3 text-left text-xs font-medium text-fg-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!loading && transactions.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-fg-3">
                  {Object.values(filters).some(Boolean)
                    ? 'No transactions match your filters'
                    : <><span>No transactions yet — </span><a href="/upload" className="underline text-fg-2">upload a CSV to get started →</a></>}
                </td>
              </tr>
            ) : (
              transactions.map((transaction) => (
                <TransactionRow
                  key={transaction.id}
                  transaction={transaction}
                  categories={categories}
                  onUpdate={handleUpdate}
                  onDelete={handleDelete}
                  selected={selectedIds.has(transaction.id)}
                  onSelect={handleSelect}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-center gap-2">
        <button
          onClick={() => setOffset(Math.max(0, offset - limit))}
          disabled={offset === 0}
          className="px-4 py-2 bg-surface-2 text-fg-2 text-sm font-medium rounded-md hover:bg-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <div className="flex items-center gap-2">
          {Array.from({ length: Math.min(5, maxPage) }).map((_, i) => {
            const page = Math.max(1, currentPage - 2) + i;
            if (page > maxPage) return null;
            return (
              <button
                key={page}
                onClick={() => setOffset((page - 1) * limit)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  page === currentPage
                    ? 'bg-blue-600 text-white'
                    : 'bg-surface-2 text-fg-2 hover:bg-[var(--border)]'
                }`}
              >
                {page}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setOffset(offset + limit)}
          disabled={offset + limit >= total}
          className="px-4 py-2 bg-surface-2 text-fg-2 text-sm font-medium rounded-md hover:bg-[var(--border)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}
