'use client';

import { useEffect, useState } from 'react';
import { TransactionRow } from './TransactionRow';
import type { TransactionFilterValues } from './TransactionFilters';

interface Transaction {
  id: number;
  date: string | Date;
  account: string;
  merchant: string;
  amount: number;
  type: string;
  category: string;
  note: string;
  paidBy: 'tung' | 'thuy' | 'other';
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
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkStatus, setBulkStatus] = useState('');
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

  const handleSelect = (id: number, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) { next.add(id); } else { next.delete(id); }
      return next;
    });
  };

  const handleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(transactions.map(t => t.id)) : new Set());
  };

  const handleBulkCategorize = async () => {
    if (!bulkCategory || selectedIds.size === 0) return;
    setBulkStatus('Saving…');
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
        setBulkStatus(`Updated ${updated} transaction${updated === 1 ? '' : 's'}`);
        setTimeout(() => setBulkStatus(''), 3000);
      } else {
        setBulkStatus('Failed to update');
        setTimeout(() => setBulkStatus(''), 3000);
      }
    } catch {
      setBulkStatus('Failed to update');
      setTimeout(() => setBulkStatus(''), 3000);
    }
  };

  // Fetch the category list once so rows can show a dropdown
  useEffect(() => {
    fetch('/api/categories')
      .then((r) => r.ok ? r.json() : { categories: [] })
      .then((data) => setCategories(data.categories ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setOffset(0);
    setSelectedIds(new Set());
  }, [filters]);

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', limit.toString());
        params.set('offset', offset.toString());
        params.set('sort_by', sortBy);
        params.set('order', sortOrder);

        if (filters.dateFrom) params.set('date_from', filters.dateFrom);
        if (filters.dateTo) params.set('date_to', filters.dateTo);
        if (filters.account) params.set('account', filters.account);
        if (filters.category) params.set('category', filters.category);
        if (filters.merchant) params.set('merchant', filters.merchant);
        if (filters.type) params.set('type', filters.type);
        if (filters.paidBy) params.set('paid_by', filters.paidBy);
        if (filters.amountMin) params.set('amount_min', filters.amountMin);
        if (filters.amountMax) params.set('amount_max', filters.amountMax);

        const res = await fetch(`/api/transactions?${params}`);
        if (res.ok) {
          const data = await res.json();
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

  const handleUpdate = async (id: number, category: string) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });

      if (res.ok) {
        setTransactions(transactions.map(t => t.id === id ? { ...t, category } : t));
      }
    } catch (error) {
      console.error('Failed to update transaction:', error);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        setTransactions(transactions.filter(t => t.id !== id));
        setTotal(total - 1);
      }
    } catch (error) {
      console.error('Failed to delete transaction:', error);
    }
  };

  const handleExport = async () => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('date_from', filters.dateFrom);
    if (filters.dateTo) params.set('date_to', filters.dateTo);
    if (filters.account) params.set('account', filters.account);
    if (filters.category) params.set('category', filters.category);
    if (filters.merchant) params.set('merchant', filters.merchant);
    if (filters.type) params.set('type', filters.type);
    if (filters.paidBy) params.set('paid_by', filters.paidBy);

    const url = `/api/export?${params}`;
    window.open(url, '_blank');
  };

  if (loading && transactions.length === 0) {
    return <div className="text-center py-8">Loading...</div>;
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
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <span className="text-blue-700 font-medium">{selectedIds.size} selected</span>
          <select
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
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1 bg-surface-2 text-fg-2 rounded text-sm font-medium hover:bg-[var(--border)]"
          >
            Deselect all
          </button>
          {bulkStatus && <span className="text-green-700 font-medium">{bulkStatus}</span>}
        </div>
      )}
      {!selectedIds.size && bulkStatus && (
        <div className="text-sm text-green-700 font-medium px-1">{bulkStatus}</div>
      )}

      <div className="overflow-x-auto bg-surface rounded-lg border border-border-soft">
        <table className="w-full">
          <thead className="bg-surface-2 border-b border-border-soft">
            <tr>
              <th className="px-3 py-3">
                <input
                  type="checkbox"
                  checked={transactions.length > 0 && selectedIds.size === transactions.length}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                  className="w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-fg-2 cursor-pointer select-none hover:bg-surface-2" onClick={() => handleSort('date')}>
                Date {sortBy === 'date' ? (sortOrder === 'asc' ? '↑' : '↓') : <span className="text-fg-3">↕</span>}
              </th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-fg-2">Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-fg-2">Merchant</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-fg-2 cursor-pointer select-none hover:bg-surface-2" onClick={() => handleSort('amount')}>
                Amount {sortBy === 'amount' ? (sortOrder === 'asc' ? '↑' : '↓') : <span className="text-fg-3">↕</span>}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-fg-2">Category</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-fg-2">Paid By</th>
              <th className="hidden md:table-cell px-4 py-3 text-left text-xs font-medium text-fg-2">Note</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-fg-2">Actions</th>
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
