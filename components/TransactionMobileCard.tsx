'use client';

import { memo, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Transaction } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { TAGS, CATEGORIES } from '@/lib/constants';
import { useHouseholdMembers } from '@/components/HouseholdMembersProvider';

interface Split {
  id?: number;
  category: string;
  amount: string;
}

interface LinkedReimbursement {
  id: number;
  reimbursementTransaction: { id: number; date: string | Date; merchant: string; amount: number };
}

interface Props {
  transaction: Transaction;
  categories: string[];
  onUpdate: (id: number, category: string) => Promise<void>;
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

function tagColor(tag: string) {
  return TAG_COLORS[tag] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency: 'EUR', minimumFractionDigits: 2,
  }).format(Math.abs(n));
}

export const TransactionMobileCard = memo(function TransactionMobileCard({
  transaction, categories, onUpdate, onDelete, selected, onSelect,
}: Props) {
  const { nameForSlug } = useHouseholdMembers();
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState(transaction.category);
  const [txType, setTxType] = useState(transaction.type);
  const [tags, setTags] = useState<string[]>(transaction.tags ?? []);
  const [saving, setSaving] = useState(false);
  const shiftRef = useRef(false);

  // Note
  const [note, setNote] = useState(transaction.note ?? '');
  const [editingNote, setEditingNote] = useState(false);
  const [noteInput, setNoteInput] = useState(transaction.note ?? '');

  // Splits
  const [splitOpen, setSplitOpen] = useState(false);
  const [splits, setSplits] = useState<Split[]>([]);
  const [splitLoading, setSplitLoading] = useState(false);
  const [hasSplits, setHasSplits] = useState(false);

  // Linked reimbursements
  const [linksOpen, setLinksOpen] = useState(false);
  const [links, setLinks] = useState<LinkedReimbursement[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkResults, setLinkResults] = useState<Transaction[]>([]);
  const [searching, setSearching] = useState(false);

  const isExpense = txType === 'Expense' && transaction.amount < 0;
  const isReimb = txType === 'Expense' && transaction.amount > 0;
  const amountColor = isExpense ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
  const amountPrefix = isExpense ? '−' : '+';
  const totalAmt = Math.abs(transaction.amount);
  const netAmount = totalAmt - (transaction.reimbursedAmount ?? 0);
  const splitTotal = splits.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
  const splitRemaining = Math.max(0, totalAmt - splitTotal);

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

  const handleTypeChange = async (newType: string) => {
    if (newType === txType) return;
    const prev = txType;
    setTxType(newType);
    setSaving(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? 'Failed to update type');
      }
      toast.success(`Type changed to ${newType}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update type');
      setTxType(prev);
    } finally {
      setSaving(false);
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

  const openSplitEditor = async () => {
    setSplitLoading(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/splits`);
      const existing = res.ok ? await res.json() as { category: string; amount: number }[] : [];
      setSplits(existing.length > 0
        ? existing.map(s => ({ category: s.category, amount: String(s.amount) }))
        : [{ category: transaction.category || '', amount: '' }, { category: '', amount: '' }]
      );
      setSplitOpen(true);
    } finally {
      setSplitLoading(false);
    }
  };

  const saveSplits = async () => {
    const valid = splits.filter(s => s.category && s.amount && parseFloat(s.amount) > 0);
    if (valid.length < 2) { toast.error('Enter at least 2 split lines'); return; }
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
      if (!res.ok) throw new Error();
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

  const openLinksEditor = async () => {
    setLinksLoading(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/links`);
      const data = res.ok ? await res.json() as { links: LinkedReimbursement[] } : { links: [] };
      setLinks(data.links);
      setLinksOpen(true);
    } finally {
      setLinksLoading(false);
    }
  };

  useEffect(() => {
    if (!linksOpen || !linkSearch.trim()) { setLinkResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/transactions?merchant=${encodeURIComponent(linkSearch)}&positive_only=1&limit=10`);
        if (cancelled || !res.ok) return;
        const data = await res.json() as { transactions: Transaction[] };
        if (cancelled) return;
        const linkedIds = new Set(links.map(l => l.reimbursementTransaction.id));
        setLinkResults(data.transactions.filter(t => t.id !== transaction.id && !linkedIds.has(t.id)));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [linkSearch, linksOpen, links, transaction.id]);

  const addLink = async (candidate: Transaction) => {
    setLinking(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursementTransactionId: candidate.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? 'Failed to link');
      setLinks(prev => [...prev, {
        id: (body as { id: number }).id,
        reimbursementTransaction: { id: candidate.id, date: candidate.date, merchant: candidate.merchant, amount: candidate.amount },
      }]);
      setLinkResults(prev => prev.filter(t => t.id !== candidate.id));
      setLinkSearch('');
      toast.success('Reimbursement linked');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link');
    } finally {
      setLinking(false);
    }
  };

  const removeLink = async (reimbursementTransactionId: number) => {
    setLinking(true);
    try {
      const res = await fetch(`/api/transactions/${transaction.id}/links`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursementTransactionId }),
      });
      if (!res.ok) throw new Error();
      setLinks(prev => prev.filter(l => l.reimbursementTransaction.id !== reimbursementTransactionId));
      toast.success('Reimbursement unlinked');
    } catch {
      toast.error('Failed to unlink');
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className={`border-b border-border-soft ${selected ? 'bg-blue-50 dark:bg-blue-950/20' : ''}`}>
      {/* Main row */}
      <div className="px-4 py-3">
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
                <div className="font-medium text-sm line-clamp-2">{transaction.merchant}</div>
                <div className="text-xs text-fg-3 mt-0.5">
                  {formatDate(transaction.date)}
                  {transaction.paidBy && <span className="ml-2">· {nameForSlug(transaction.paidBy)}</span>}
                  {transaction.account && <span className="ml-2">· {transaction.account}</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`font-semibold text-sm ${amountColor}`}>
                  {amountPrefix}{fmtCurrency(transaction.amount)}
                </div>
                {!!transaction.reimbursedAmount && (
                  <div className="text-[10px] text-fg-3">
                    Net {netAmount < 0 ? '−' : ''}{fmtCurrency(netAmount)}
                  </div>
                )}
              </div>
            </div>

            {/* Tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {tags.map(t => (
                  <span key={t} className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tagColor(t)}`}>
                    {t}
                  </span>
                ))}
              </div>
            )}

            {/* Note preview (collapsed only) */}
            {!expanded && note && (
              <div className="text-xs text-fg-3 mt-1 line-clamp-2 italic">{note}</div>
            )}

            {/* Category + expand toggle */}
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
              <button
                onClick={() => setExpanded(e => !e)}
                aria-label={expanded ? 'Collapse' : 'Expand'}
                title={expanded ? 'Collapse' : 'More options'}
                className="p-1.5 rounded text-fg-3 hover:text-foreground hover:bg-surface-2 transition-colors shrink-0"
              >
                <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border-soft bg-surface-2/40">
          {/* Type selector */}
          {(txType === 'Income' || isReimb) && (
            <div className="pt-3">
              <div className="text-[11px] font-medium text-fg-3 mb-1">Type</div>
              <select
                value={txType}
                onChange={e => handleTypeChange(e.target.value)}
                disabled={saving}
                aria-label="Transaction type"
                className="w-full cursor-pointer rounded text-xs border border-border-soft px-2 py-1.5 bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              >
                <option value="Income">Income</option>
                <option value="Expense">Expense (reimb.)</option>
              </select>
            </div>
          )}

          {/* Tags */}
          <div className={txType === 'Income' || isReimb ? '' : 'pt-3'}>
            <div className="text-[11px] font-medium text-fg-3 mb-1.5">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    tags.includes(tag)
                      ? tagColor(tag) + ' border-transparent'
                      : 'border-border-soft text-fg-3 hover:text-foreground'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <div className="text-[11px] font-medium text-fg-3 mb-1">Note</div>
            {editingNote ? (
              <div className="space-y-1.5">
                <textarea
                  value={noteInput}
                  onChange={e => setNoteInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') { setNoteInput(note); setEditingNote(false); } }}
                  autoFocus
                  rows={2}
                  maxLength={500}
                  aria-label="Edit note"
                  className="w-full px-2 py-1.5 text-xs border border-border-soft rounded bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveNote}
                    disabled={saving}
                    className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >Save</button>
                  <button
                    type="button"
                    onClick={() => { setNoteInput(note); setEditingNote(false); }}
                    className="flex-1 py-1.5 text-xs bg-surface text-fg-2 rounded border border-border-soft hover:bg-surface-2"
                  >Cancel</button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { setNoteInput(note); setEditingNote(true); }}
                className="w-full text-left px-2 py-1.5 text-xs rounded border border-border-soft bg-surface text-fg-2 hover:bg-surface-2 min-h-[32px]"
              >
                {note || <span className="italic opacity-50">Add a note…</span>}
              </button>
            )}
          </div>

          {/* Split + Link reimbursements (expense only) */}
          {transaction.type === 'Expense' && transaction.amount < 0 && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={splitOpen ? () => setSplitOpen(false) : openSplitEditor}
                disabled={splitLoading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded border transition-colors disabled:opacity-50 ${
                  splitOpen ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-300 dark:border-blue-700' : hasSplits ? 'text-blue-500 border-blue-200 dark:border-blue-800 hover:bg-surface-2' : 'border-border-soft text-fg-2 hover:bg-surface-2'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 12m0 0 4.5-9M3 12h13.5m0 0L12 3m4.5 9-4.5 9" />
                </svg>
                {hasSplits ? 'Edit splits' : 'Split'}
              </button>
              <button
                type="button"
                onClick={linksOpen ? () => setLinksOpen(false) : openLinksEditor}
                disabled={linksLoading}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs rounded border transition-colors disabled:opacity-50 ${
                  linksOpen ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 border-blue-300 dark:border-blue-700' : transaction.reimbursedAmount ? 'text-blue-500 border-blue-200 dark:border-blue-800 hover:bg-surface-2' : 'border-border-soft text-fg-2 hover:bg-surface-2'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                {transaction.reimbursedAmount ? 'Reimbursements' : 'Link reimb.'}
              </button>
            </div>
          )}

          {/* Split editor */}
          {splitOpen && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/10 p-3 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium text-fg-2">Split {fmtCurrency(totalAmt)}</span>
                <span className={`mono ${Math.abs(splitRemaining) < 0.01 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  Remaining: {fmtCurrency(splitRemaining)}
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
                    className="w-20 px-2 py-1 text-[12px] text-right border border-border-soft rounded bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  {splits.length > 2 && (
                    <button type="button" onClick={() => setSplits(prev => prev.filter((_, j) => j !== i))} aria-label="Remove split" className="text-fg-3 hover:text-red-500">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={() => setSplits(prev => [...prev, { category: '', amount: '' }])} className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline">+ Add row</button>
                <div className="flex-1" />
                {hasSplits && (
                  <button type="button" onClick={clearSplits} disabled={saving} className="px-2 py-1 text-[11px] text-red-500 disabled:opacity-50">Remove splits</button>
                )}
                <button type="button" onClick={() => setSplitOpen(false)} className="px-2 py-1 text-[11px] bg-surface text-fg-2 rounded border border-border-soft">Cancel</button>
                <button type="button" onClick={saveSplits} disabled={saving} className="px-2 py-1 text-[11px] bg-blue-600 text-white rounded disabled:opacity-50">Save</button>
              </div>
            </div>
          )}

          {/* Link reimbursements editor */}
          {linksOpen && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10 p-3 space-y-2">
              <div className="flex items-center justify-between text-[12px]">
                <span className="font-medium text-fg-2">Linked reimbursements</span>
                {links.length > 0 && (
                  <span className="mono text-emerald-600 dark:text-emerald-400">
                    {fmtCurrency(links.reduce((acc, l) => acc + l.reimbursementTransaction.amount, 0))} reimbursed
                  </span>
                )}
              </div>
              {links.length > 0 && (
                <ul className="space-y-1">
                  {links.map(l => (
                    <li key={l.id} className="flex items-center justify-between text-[12px] bg-surface border border-border-soft rounded px-2 py-1">
                      <span className="truncate">{formatDate(l.reimbursementTransaction.date)} · {l.reimbursementTransaction.merchant}</span>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="mono text-emerald-600 dark:text-emerald-400">{fmtCurrency(l.reimbursementTransaction.amount)}</span>
                        <button type="button" onClick={() => removeLink(l.reimbursementTransaction.id)} disabled={linking} aria-label="Unlink" className="text-fg-3 hover:text-red-500 disabled:opacity-50">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="relative">
                <input
                  type="text"
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Search merchant to link…"
                  aria-label="Search reimbursement transactions"
                  className="w-full px-2 py-1.5 text-[12px] border border-border-soft rounded bg-surface focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {linkSearch.trim() && (
                  <div className="mt-1 border border-border-soft rounded bg-surface max-h-36 overflow-y-auto">
                    {searching && <div className="px-2 py-1 text-[11px] text-fg-3">Searching…</div>}
                    {!searching && linkResults.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-fg-3">No matching transactions</div>
                    )}
                    {linkResults.map(candidate => (
                      <button key={candidate.id} type="button" onClick={() => addLink(candidate)} disabled={linking}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-[12px] hover:bg-surface-2 disabled:opacity-50"
                      >
                        <span className="truncate">{formatDate(candidate.date)} · {candidate.merchant}</span>
                        <span className="mono text-emerald-600 dark:text-emerald-400 ml-2 shrink-0">{fmtCurrency(candidate.amount)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => setLinksOpen(false)} className="px-3 py-1 text-[11px] bg-surface text-fg-2 rounded border border-border-soft">Close</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
