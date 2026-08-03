'use client';

import { useState } from 'react';

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
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const handleCategoryChange = async (newCategory: string) => {
    if (newCategory === category) return;
    setCategory(newCategory);
    setStatus('saving');
    try {
      await onUpdate(transaction.id, newCategory);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1500);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 2000);
    }
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await onDelete(transaction.id);
    }
  };

  const formatDate = (date: string | Date) => {
    if (typeof date === 'string') return date.split('T')[0];
    return date.toISOString().split('T')[0];
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2,
    }).format(Math.abs(n));

  const amountColor = transaction.type === 'Expense' ? 'text-red-600' : 'text-green-600';
  const amountPrefix = transaction.type === 'Expense' ? '−' : '+';

  const selectCls = [
    'cursor-pointer rounded text-sm border border-transparent px-2 py-1',
    'bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500',
    status === 'saving' ? 'opacity-50' : '',
    status === 'saved' ? 'bg-green-100 border-green-300 text-green-800' : '',
    status === 'error' ? 'bg-red-100 border-red-300 text-red-800' : '',
    !category ? 'text-amber-600' : '',
  ].join(' ');

  return (
    <tr className={`border-b border-gray-200 hover:bg-gray-50 ${selected ? 'bg-blue-50' : ''}`}>
      {onSelect && (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            checked={selected ?? false}
            onChange={(e) => onSelect(transaction.id, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3 text-sm">{formatDate(transaction.date)}</td>
      <td className="hidden md:table-cell px-4 py-3 text-sm">{transaction.account}</td>
      <td className="px-4 py-3 text-sm">{transaction.merchant}</td>
      <td className={`px-4 py-3 text-sm text-right font-medium ${amountColor}`}>
        {amountPrefix}{formatCurrency(transaction.amount)}
      </td>
      <td className="px-4 py-3 text-sm">
        <select
          value={category}
          onChange={(e) => handleCategoryChange(e.target.value)}
          disabled={status === 'saving'}
          className={selectCls}
        >
          {!category && <option value="">⚠ Uncategorized</option>}
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {status === 'saved' && <span className="ml-1 text-green-600 text-xs">✓</span>}
        {status === 'error' && <span className="ml-1 text-red-600 text-xs">✗</span>}
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-sm">
        {transaction.paidBy === 'tung' ? 'Tung'
          : transaction.paidBy === 'thuy' ? 'Thuy'
          : '—'}
      </td>
      <td className="hidden md:table-cell px-4 py-3 text-sm text-gray-500" title={transaction.note || undefined}>
        {transaction.note?.substring(0, 30)}
        {transaction.note?.length > 30 ? '…' : ''}
      </td>
      <td className="px-4 py-3 text-sm">
        <button
          onClick={handleDelete}
          title="Delete transaction"
          className="p-1.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </td>
    </tr>
  );
}
