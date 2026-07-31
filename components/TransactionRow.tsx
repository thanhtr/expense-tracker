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
  const [isEditing, setIsEditing] = useState(false);
  const [category, setCategory] = useState(transaction.category);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(transaction.id, category);
      setSaved(true);
      setIsEditing(false);
      setTimeout(() => setSaved(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setCategory(transaction.category);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      await onDelete(transaction.id);
    }
  };

  const formatDate = (date: string | Date) => {
    if (typeof date === 'string') {
      return date.split('T')[0];
    }
    return date.toISOString().split('T')[0];
  };

  const formatCurrency = (n: number) => {
    return new Intl.NumberFormat('fi-FI', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(Math.abs(n));
  };

  const amountColor = transaction.type === 'Expense' ? 'text-red-600' : 'text-green-600';
  const amountPrefix = transaction.type === 'Expense' ? '−' : '+';

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
      <td className="px-4 py-3 text-sm">{transaction.account}</td>
      <td className="px-4 py-3 text-sm">{transaction.merchant}</td>
      <td className={`px-4 py-3 text-sm text-right font-medium ${amountColor}`}>
        {amountPrefix}{formatCurrency(transaction.amount)}
      </td>
      <td className="px-4 py-3 text-sm">
        {isEditing ? (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            autoFocus
            className="w-full px-2 py-1 border border-gray-300 rounded text-sm bg-white"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        ) : saved ? (
          <span className="inline-block bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-medium">
            {category} ✓
          </span>
        ) : (
          <span
            onClick={() => setIsEditing(true)}
            title={category ? `Click to edit: ${category}` : 'Click to set category'}
            className="inline-block cursor-pointer bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded text-sm"
          >
            {category || <span className="text-amber-600" title="No category assigned">⚠ Uncategorized</span>}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {transaction.paidBy === 'tung' ? 'Tung'
          : transaction.paidBy === 'thuy' ? 'Thuy'
          : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500" title={transaction.note || undefined}>
        {transaction.note?.substring(0, 30)}
        {transaction.note?.length > 30 ? '…' : ''}
      </td>
      <td className="px-4 py-3 text-sm">
        {isEditing ? (
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-green-600 hover:text-green-800 font-medium text-xs disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="text-gray-500 hover:text-gray-700 font-medium text-xs disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="text-red-600 hover:text-red-800 font-medium text-xs"
          >
            Delete
          </button>
        )}
      </td>
    </tr>
  );
}
