'use client';

import { useEffect, useState } from 'react';
import { fmtEUR } from '@/lib/utils';

interface Budget {
  id: number;
  category: string;
  monthlyLimit: number;
  rollover: boolean;
  rolloverAmount: number;
  effectiveLimit: number;
}

interface BudgetCardProps {
  spentByCategory: Record<string, number>;
  categories: string[];
}

function ProgressBar({ spent, limit }: { spent: number; limit: number }) {
  if (limit <= 0) return <div className="w-full h-[6px] bg-surface-2 rounded-full" />;
  const pct = Math.min((spent / limit) * 100, 100);
  const over = spent > limit;
  const warn = pct >= 70 && pct < 100;
  const color = over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="w-full h-[6px] bg-surface-2 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function BudgetCard({ spentByCategory, categories }: BudgetCardProps) {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [adding, setAdding] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [newLimit, setNewLimit] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLimit, setEditLimit] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/budgets')
      .then(r => r.ok ? r.json() : [])
      .then(setBudgets)
      .catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!newCategory || !newLimit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory, monthlyLimit: parseFloat(newLimit) }),
      });
      if (res.ok) {
        const b = await res.json() as Budget;
        setBudgets(prev => {
          const without = prev.filter(x => x.category !== b.category);
          return [...without, b].sort((a, z) => a.category.localeCompare(z.category));
        });
        setNewCategory(''); setNewLimit(''); setAdding(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEditSave = async (id: number, category: string) => {
    const limit = parseFloat(editLimit);
    if (isNaN(limit) || limit < 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, monthlyLimit: limit }),
      });
      if (res.ok) {
        const b = await res.json() as Budget;
        setBudgets(prev => prev.map(x => x.id === id ? b : x));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRollover = async (b: Budget) => {
    const next = !b.rollover;
    // Optimistic update
    setBudgets(prev => prev.map(x => x.id === b.id ? { ...x, rollover: next } : x));
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: b.category, monthlyLimit: b.monthlyLimit, rollover: next }),
      });
      if (res.ok) {
        // Re-fetch to get updated rolloverAmount / effectiveLimit
        const fresh = await fetch('/api/budgets').then(r => r.ok ? r.json() : null);
        if (fresh) setBudgets(fresh);
      } else {
        // revert
        setBudgets(prev => prev.map(x => x.id === b.id ? { ...x, rollover: b.rollover } : x));
      }
    } catch {
      setBudgets(prev => prev.map(x => x.id === b.id ? { ...x, rollover: b.rollover } : x));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this budget?')) return;
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
      if (res.ok) setBudgets(prev => prev.filter(x => x.id !== id));
    } catch { /* leave unchanged */ }
  };

  const unusedCategories = categories.filter(c => !budgets.find(b => b.category === c));

  return (
    <div className="dash-card">
      <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
        <div>
          <h3 className="text-[13px] font-semibold m-0">Budgets</h3>
          <div className="text-[12px] text-[var(--fg-3)]">Monthly limits by category</div>
        </div>
        {!adding && unusedCategories.length > 0 && (
          <button onClick={() => setAdding(true)} className="btn-ghost text-[12px]">+ Add budget</button>
        )}
      </div>

      <div className="p-[0_20px_20px] space-y-[14px]">
        {budgets.length === 0 && !adding && (
          <div className="text-[13px] text-[var(--fg-3)] py-2">
            No budgets set. Click &quot;+ Add budget&quot; to set monthly limits.
          </div>
        )}

        {budgets.map(b => {
          const spent = spentByCategory[b.category] ?? 0;
          const effective = b.effectiveLimit;
          const pct = effective > 0 ? (spent / effective) * 100 : 0;
          const over = spent > effective;
          const isEditing = editingId === b.id;

          return (
            <div key={b.id} className="space-y-[6px]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-[6px] flex-1 min-w-0">
                  <span className="min-w-0 text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{b.category}</span>
                  {/* Rollover toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleRollover(b)}
                    title={b.rollover ? 'Rollover enabled — click to disable' : 'Enable rollover of unused budget'}
                    className={`shrink-0 text-[10px] px-[5px] py-[1px] rounded-full border transition-colors ${
                      b.rollover
                        ? 'bg-blue-100 text-blue-600 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700'
                        : 'bg-surface-2 text-[var(--fg-3)] border-[var(--border)] hover:border-blue-300'
                    }`}
                  >
                    rollover
                  </button>
                </div>
                <div className="flex items-center gap-[10px] flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                  {isEditing ? (
                    <>
                      <span className="text-[12px] text-[var(--fg-3)]">€</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        aria-label="Budget limit"
                        value={editLimit}
                        onChange={e => setEditLimit(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleEditSave(b.id, b.category);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-[72px] px-[6px] py-[2px] border border-blue-400 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={() => handleEditSave(b.id, b.category)} disabled={saving}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">Save</button>
                      <button onClick={() => setEditingId(null)}
                        className="text-[11px] text-[var(--fg-3)] hover:text-[var(--foreground)]">Cancel</button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <span className={`mono text-[12px] ${over ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[var(--fg-2)]'}`}>
                          {fmtEUR(spent)} / <button
                            onClick={() => { setEditingId(b.id); setEditLimit(String(b.monthlyLimit)); }}
                            className="hover:underline cursor-pointer"
                            title="Click to edit limit"
                          >{fmtEUR(effective)}</button>
                        </span>
                        {b.rollover && b.rolloverAmount > 0 && (
                          <div className="text-[10px] text-blue-500 dark:text-blue-400">
                            +{fmtEUR(b.rolloverAmount)} rollover
                          </div>
                        )}
                      </div>
                      <span className={`text-[11px] mono ${over ? 'text-red-600 dark:text-red-400 font-semibold' : pct >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--fg-3)]'}`}>
                        {pct.toFixed(0)}%
                      </span>
                      <button onClick={() => handleDelete(b.id)}
                        className="text-[var(--fg-3)] hover:text-red-500 transition-colors"
                        title="Remove budget"
                        aria-label={`Remove ${b.category} budget`}>
                        <svg className="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <ProgressBar spent={spent} limit={effective} />
            </div>
          );
        })}

        {adding && (
          <div className="flex items-center gap-[8px] pt-[4px] flex-wrap">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              aria-label="New budget category"
              className="px-[8px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select category…</option>
              {unusedCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="flex items-center gap-[4px]">
              <span className="text-[12px] text-[var(--fg-3)]">€</span>
              <input
                type="number"
                min="0"
                step="1"
                aria-label="Monthly budget limit"
                value={newLimit}
                onChange={e => setNewLimit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                placeholder="limit"
                className="w-[72px] px-[6px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button onClick={handleAdd} disabled={saving || !newCategory || !newLimit}
              className="px-[10px] py-[4px] bg-blue-600 text-white text-[12px] font-medium rounded hover:bg-blue-700 disabled:opacity-50">Add</button>
            <button onClick={() => { setAdding(false); setNewCategory(''); setNewLimit(''); }}
              className="px-[10px] py-[4px] bg-surface-2 text-[var(--fg-2)] text-[12px] font-medium rounded hover:bg-[var(--border)]">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
