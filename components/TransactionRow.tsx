'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import type { Transaction } from '@/lib/types';
import { formatDate } from '@/lib/utils';

interface TransactionRowProps {
  transaction: Transaction;
  categories: string[];
  onUpdate: (id: number, category: string) => void;
  onDelete: (id: number) => void;
  selected?: boolean;
  onSelect?: (id: number, checked: boolean) => void;
}

export function TransactionRow({ transaction, categories, onUpdate, onDelete, selected, onSelect }: TransactionRowProps) {
  const [category, setCategory] = useState(transaction.category);
  const [saving, setSaving] = useState(false);

  const handleCategoryChange = async (newCategory: string) => {
    if (newCategory === category) return;
    setCategory(newCategory);
    setSaving(true);
    try {
      await onUpdate(transaction.id, newCategory);
    } catch {
      toast.error('Failed to update category');
      setCategory(category);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await onDelete(transaction.id);
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(Math.abs(n));

  const amountColor = transaction.type === 'Expense' ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
  const amountPrefix = transaction.type === 'Expense' ? '−' : '+';

  const selectCls = [
    'cursor-pointer rounded text-sm border border-transparent px-2 py-1',
    'bg-surface-2 hover:bg-[var(--border)] focus:outline-none focus:ring-2 focus:ring-blue-500',
    saving ? 'opacity-50' : '',
    !category ? 'text-amber-600 dark:text-amber-400' : '',
  ].join(' ');

  return (
    <tr className={`border-b border-border-soft hover:bg-surface-2 ${selected ? 'bg-blue-50' : ''}`}>
      {onSelect && (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={(e) => onSelect(transaction.id, e.target.checked)}
            className="w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3 text-sm">{formatDate(transaction.date)}</td>
      <td className="hidden md:table-cell px-4 py-3 text-sm">{transaction.account}</td>
      <td className="px-4 py-3 text-sm truncate max-w-0" title={transaction.merchant}>{transaction.merchant}</td>
      <td className={`px-4 py-3 text-sm text-right font-medium ${amountColor}`}>
        {amountPrefix}{formatCurrency(transaction.amount)}
      </td>
      <td className="hidden sm:table-cell px-4 py-3 text-sm">
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          disabled={saving}
          className={selectCls}
        >
          {!category && <option value="">⚠ Uncategorized</option>}
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-sm">
        {transaction.paidBy === 'tung' ? 'Tung'
          : transaction.paidBy === 'thuy' ? 'Thuy'
          : '—'}
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-sm text-fg-3" title={transaction.note || undefined}>
        {transaction.note?.substring(0, 30)}
        {transaction.note?.length > 30 ? '…' : ''}
      </td>
      <td className="px-4 py-3 text-sm">
        <button
          onClick={handleDelete}
          title="Delete transaction"
          className="p-1.5 rounded text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
