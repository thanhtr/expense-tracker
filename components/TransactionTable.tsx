'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { TransactionRow } from './TransactionRow';
import { useCategories } from '@/components/CategoriesProvider';
import type { Transaction, TransactionFilterValues } from '@/lib/types';
import { buildTransactionFilterParams } from '@/lib/utils';

function TransactionTableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="h-5 w-56 bg-[var(--border)] rounded animate-pulse" />
        <div className="h-9 w-28 bg-[var(--border)] rounded animate-pulse" />
      </div>
      <div className="overflow-x-auto bg-surface rounded-lg border border-border-soft">
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
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });

      if (res.ok) {
        setTransactions(prev => prev.map(t => t.id === id ? { ...t, category } : t));
      }
    } catch (error) {
      console.error('Failed to update transaction:', error);
    }
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
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700"
          >
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 bg-surface-2 text-fg-2 rounded text-sm font-medium hover:bg-[var(--border)]"
          >
            Deselect all
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-surface rounded-lg border border-border-soft">
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
                    : 'No transactions yet — upload a CSV to get started'}
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
