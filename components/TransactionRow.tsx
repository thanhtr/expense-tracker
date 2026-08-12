'use client';

import { memo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Transaction } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { TAGS, CATEGORIES } from '@/lib/constants';

interface Split {
  id?: number;
  category: string;
  amount: string;
}

interface TransactionRowProps {
  transaction: Transaction;
  categories: string[];
  onUpdate: (id: number, category: string) => void;
  onDelete: (id: number) => void;
  selected?: boolean;
  onSelect?: (id: number, checked: boolean, shiftKey: boolean) => void;
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
  const shiftPressedRef = useRef(false);

  // Note editing state
  const [note, setNote] = useState(transaction.note ?? '');
  const [editingNote, setEditingNote] = useState(false);
  const [noteInput, setNoteInput] = useState(transaction.note ?? '');

  // Split state
  const [splitOpen, setSplitOpen] = useState(false);
  const [splits, setSplits] = useState<Split[]>([]);
  const [splitLoading, setSplitLoading] = useState(false);
  const [hasSplits, setHasSplits] = useState(false);

  const openSplitEditor = async () => {
    setSplitLoading(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/splits`);
      const existing = res.ok ? await res.json() as { category: string; amount: number }[] : [];
      if (existing.length > 0) {
        setSplits(existing.map(s => ({ category: s.category, amount: String(s.amount) })));
      } else {
        setSplits([
          { category: transaction.category || '', amount: '' },
          { category: '', amount: '' },
        ]);
      }
      setSplitOpen(true);
    } finally {
      setSplitLoading(false);
    }
  };

  const saveSplits = async () => {
    const totalAmt = Math.abs(transaction.amount);
    const valid = splits.filter(s => s.category && s.amount && parseFloat(s.amount) > 0);
    if (valid.length < 2) {
      toast.error('Enter at least 2 split lines');
      return;
    }
    const sum = valid.reduce((acc, s) => acc + parseFloat(s.amount), 0);
    if (Math.abs(sum - totalAmt) > 0.01) {
      toast.error(`Split total €${sum.toFixed(2)} doesn't match transaction €${totalAmt.toFixed(2)}`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/splits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits: valid.map(s => ({ category: s.category, amount: parseFloat(s.amount) })) }),
      });
      if (!res.ok) throw new Error('Failed to save splits');
      setHasSplits(true);
      setSplitOpen(false);
      toast.success('Splits saved');
    } catch {
      toast.error('Failed to save splits');
    } finally {
      setSaving(false);
    }
  };

  const clearSplits = async () => {
    setSaving(true);
    try {
      await fetch(`/api/transactions/${transaction.id}/splits`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits: [] }),
      });
      setHasSplits(false);
      setSplitOpen(false);
      toast.success('Splits removed');
    } catch {
      toast.error('Failed to remove splits');
    } finally {
      setSaving(false);
    }
  };

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

  const saveNote = async () => {
    const trimmed = noteInput.trim();
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: trimmed }),
      });
      if (!res.ok) throw new Error();
      setNote(trimmed);
      setEditingNote(false);
      toast.success('Note saved');
    } catch {
      toast.error('Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const cancelNoteEdit = () => {
    setNoteInput(note);
    setEditingNote(false);
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

  const totalAmt = Math.abs(transaction.amount);
  const splitTotal = splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const splitRemaining = Math.max(0, totalAmt - splitTotal);

  return (
    <>
    <tr className={`border-b ${splitOpen ? '' : 'border-border-soft'} hover:bg-surface-2 ${selected ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}>
      {onSelect && (
        <td className="px-3 py-3">
          <input
            type="checkbox"
            aria-label={`Select ${transaction.merchant}`}
            checked={selected ?? false}
            onMouseDown={(e) => { if (e.button === 0) shiftPressedRef.current = e.shiftKey; }}
            onChange={(e) => { const shift = shiftPressedRef.current; shiftPressedRef.current = false; onSelect(transaction.id, e.target.checked, shift); }}
            className="w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500"
          />
        </td>
      )}
      <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(transaction.date)}</td>
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
      <td className="hidden md:table-cell px-4 py-3 text-sm">
        {editingNote ? (
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={noteInput}
              onChange={e => setNoteInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveNote();
                if (e.key === 'Escape') cancelNoteEdit();
              }}
              autoFocus
              maxLength={500}
              aria-label="Edit note"
              className="w-full px-2 py-0.5 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={saveNote}
              disabled={saving}
              aria-label="Save note"
              title="Save note"
              className="px-2 py-0.5 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >Save</button>
            <button
              type="button"
              onClick={cancelNoteEdit}
              aria-label="Cancel note edit"
              title="Cancel"
              className="px-2 py-0.5 text-[11px] bg-surface-2 text-fg-2 rounded hover:bg-[var(--border)] whitespace-nowrap"
            >Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-1 group">
            <button
              type="button"
              onClick={() => { setNoteInput(note); setEditingNote(true); }}
              title={note || 'Add note'}
              className="text-left text-fg-3 hover:text-foreground"
            >
              {note.substring(0, 30)}
              {note.length > 30 ? '…' : ''}
              {!note && <span className="italic opacity-50 text-xs">add note</span>}
            </button>
            <button
              type="button"
              onClick={() => { setNoteInput(note); setEditingNote(true); }}
              aria-label="Edit note"
              title="Edit note"
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-fg-3 hover:text-foreground transition-opacity"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 7.125L18 8.625" />
              </svg>
            </button>
          </div>
        )}
      </td>
      <td className="px-2 py-3 text-sm">
        <div className="flex items-center gap-1">
          {/* Split button */}
          {transaction.type === 'Expense' && (
            <button
              type="button"
              onClick={splitOpen ? () => setSplitOpen(false) : openSplitEditor}
              disabled={splitLoading}
              aria-label="Split transaction"
              title={hasSplits ? 'Edit splits' : 'Split transaction'}
              className={`p-1.5 rounded transition-colors ${splitOpen ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' : hasSplits ? 'text-blue-500 hover:bg-surface-2' : 'text-fg-3 hover:text-foreground hover:bg-surface-2'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 12m0 0 4.5-9M3 12h13.5m0 0L12 3m4.5 9-4.5 9" />
              </svg>
            </button>
          )}
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

    {/* Split editor inline row */}
    {splitOpen && (
      <tr className="border-b border-border-soft bg-blue-50/50 dark:bg-blue-950/10">
        <td colSpan={9} className="px-4 py-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[var(--fg-2)]">
                Split {formatCurrency(totalAmt)} across categories
              </span>
              <span className={`text-[12px] mono ${Math.abs(splitRemaining) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                Remaining: {formatCurrency(splitRemaining)}
              </span>
            </div>
            {splits.map((s, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={s.category}
                  onChange={e => setSplits(prev => prev.map((x, j) => j === i ? { ...x, category: e.target.value } : x))}
                  aria-label={`Split ${i + 1} category`}
                  className="flex-1 px-2 py-1 text-[12px] border border-border-soft rounded bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">Select category…</option>
                  {(CATEGORIES as readonly string[]).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={s.amount}
                  onChange={e => setSplits(prev => prev.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                  placeholder="0.00"
                  aria-label={`Split ${i + 1} amount`}
                  className="w-24 px-2 py-1 text-[12px] text-right border border-border-soft rounded bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {splits.length > 2 && (
                  <button
                    type="button"
                    onClick={() => setSplits(prev => prev.filter((_, j) => j !== i))}
                    aria-label="Remove split row"
                    className="text-fg-3 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setSplits(prev => [...prev, { category: '', amount: '' }])}
                className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >+ Add row</button>
              <div className="flex-1" />
              {hasSplits && (
                <button
                  type="button"
                  onClick={clearSplits}
                  disabled={saving}
                  className="px-2 py-1 text-[11px] text-red-500 hover:text-red-700 disabled:opacity-50"
                >Remove splits</button>
              )}
              <button
                type="button"
                onClick={() => setSplitOpen(false)}
                className="px-3 py-1 text-[11px] bg-surface-2 text-[var(--fg-2)] rounded hover:bg-[var(--border)]"
              >Cancel</button>
              <button
                type="button"
                onClick={saveSplits}
                disabled={saving}
                className="px-3 py-1 text-[11px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >Save splits</button>
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
});
