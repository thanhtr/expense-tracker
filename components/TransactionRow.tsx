'use client';

import { memo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Transaction } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { TAGS } from '@/lib/constants';

interface TransactionRowProps {
  transaction: Transaction;
  categories: string[];
  onUpdate: (id: number, category: string) => void;
  onDelete: (id: number) => void;
  selected?: boolean;
  onSelect?: (id: number, checked: boolean) => void;
}

const TAG_COLORS: Record<string, string> = {
  reimbursable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  work: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  holiday: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  shared: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'one-time': 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  recurring: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300',
};

function defaultTagColor(tag: string) {
  return TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

export const TransactionRow = memo(function TransactionRow({
  transaction, categories, onUpdate, onDelete, selected, onSelect,
}: TransactionRowProps) {
  const [category, setCategory] = useState(transaction.category);
  const [tags, setTags] = useState<string[]>(transaction.tags ?? []);
  const [saving, setSaving] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const tagBtnRef = useRef<HTMLButtonElement>(null);

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

  const toggleTag = async (tag: string) => {
    const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
    setTags(next);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to update tags');
      setTags(tags);
    }
  };

  const formatCurrency = (n: number) =>
    new Intl.NumberFormat('fi-FI', {
      style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
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
    <tr className={`border-b border-border-soft hover:bg-surface-2 ${selected ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}>
      {onSelect && (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            aria-label={`Select ${transaction.merchant}`}
            checked={selected ?? false}
            onChange={(e) => onSelect(transaction.id, e.target.checked)}
            className="w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3 text-sm">{formatDate(transaction.date)}</td>
      <td className="hidden md:table-cell px-4 py-3 text-sm">{transaction.account}</td>
      <td className="px-4 py-3 text-sm truncate max-w-0" title={transaction.merchant}>
        <div className="truncate">{transaction.merchant}</div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {tags.map(t => (
              <span key={t} className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${defaultTagColor(t)}`}>
                {t}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className={`px-4 py-3 text-sm text-right font-medium ${amountColor}`}>
        {amountPrefix}{formatCurrency(transaction.amount)}
      </td>
      <td className="hidden sm:table-cell px-4 py-3 text-sm">
        <select
          aria-label="Category"
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
        {transaction.note && transaction.note.length > 30 ? '…' : ''}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-1">
          {/* Tag picker */}
          <div className="relative">
            <button
              ref={tagBtnRef}
              type="button"
              onClick={() => setTagPickerOpen(o => !o)}
              aria-label="Edit tags"
              title="Edit tags"
              className="p-1.5 rounded text-fg-3 hover:text-foreground hover:bg-surface-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
            </button>
            {tagPickerOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTagPickerOpen(false)} aria-hidden="true" />
                <div className="absolute right-0 z-20 mt-1 w-40 bg-surface border border-border rounded-lg shadow-lg py-1">
                  {TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] hover:bg-surface-2 text-left"
                    >
                      <span className={`w-2 h-2 rounded-full ${tags.includes(tag) ? 'bg-blue-500' : 'bg-[var(--border)]'}`} />
                      {tag}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleDelete}
            aria-label="Delete transaction"
            title="Delete transaction"
            className="p-1.5 rounded text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
});
