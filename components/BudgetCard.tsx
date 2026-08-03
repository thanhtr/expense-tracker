'use client';

import { useEffect, useState } from 'react';

interface Budget {
  id: number;
  category: string;
  monthlyLimit: number;
}

interface BudgetCardProps {
  spentByCategory: Record<string, number>;
  categories: string[];
}

function fmtEUR(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n).replace(/ /g, ' ');
}

function ProgressBar({ spent, limit }: { spent: number; limit: number }) {
  if (limit <= 0) {
    return <div className="w-full h-[6px] bg-gray-100 rounded-full" />;
  }
  const pct = Math.min((spent / limit) * 100, 100);
  const over = spent > limit;
  const warn = pct >= 70 && pct < 100;
  const color = over ? 'bg-red-500' : warn ? 'bg-amber-400' : 'bg-emerald-500';
  return (
    <div className="w-full h-[6px] bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${pct}%` }}
      />
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
        const b = await res.json();
        setBudgets(prev => {
          const without = prev.filter(x => x.category !== b.category);
          return [...without, b].sort((a, z) => a.category.localeCompare(z.category));
        });
        setNewCategory('');
        setNewLimit('');
        setAdding(false);
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
        const b = await res.json();
        setBudgets(prev => prev.map(x => x.id === id ? b : x));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this budget?')) return;
    const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
    if (res.ok) setBudgets(prev => prev.filter(x => x.id !== id));
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
          <button
            onClick={() => setAdding(true)}
            className="btn-ghost text-[12px]"
          >
            + Add budget
          </button>
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
          const pct = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
          const over = spent > b.monthlyLimit;
          const isEditing = editingId === b.id;

          return (
            <div key={b.id} className="space-y-[6px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap flex-1">{b.category}</span>
                <div className="flex items-center gap-[10px] flex-shrink-0">
                  {isEditing ? (
                    <>
                      <span className="text-[12px] text-[var(--fg-3)]">€</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={editLimit}
                        onChange={e => setEditLimit(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleEditSave(b.id, b.category);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-[72px] px-[6px] py-[2px] border border-blue-400 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleEditSave(b.id, b.category)}
                        disabled={saving}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-[11px] text-[var(--fg-3)] hover:text-[var(--foreground)]"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={`mono text-[12px] ${over ? 'text-red-600 font-semibold' : 'text-[var(--fg-2)]'}`}>
                        {fmtEUR(spent)} / <button
                          onClick={() => { setEditingId(b.id); setEditLimit(String(b.monthlyLimit)); }}
                          className="hover:underline cursor-pointer"
                          title="Click to edit limit"
                        >{fmtEUR(b.monthlyLimit)}</button>
                      </span>
                      <span className={`text-[11px] mono ${over ? 'text-red-600 font-semibold' : pct >= 70 ? 'text-amber-600' : 'text-[var(--fg-3)]'}`}>
                        {pct.toFixed(0)}%
                      </span>
                      <button
                        onClick={() => handleDelete(b.id)}
                        className="text-[var(--fg-3)] hover:text-red-500 transition-colors"
                        title="Remove budget"
                      >
                        <svg className="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <ProgressBar spent={spent} limit={b.monthlyLimit} />
            </div>
          );
        })}

        {adding && (
          <div className="flex items-center gap-[8px] pt-[4px] flex-wrap">
            <select
              value={newCategory}
              onChange={e => setNewCategory(e.target.value)}
              className="px-[8px] py-[4px] border border-gray-300 rounded text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                value={newLimit}
                onChange={e => setNewLimit(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                placeholder="limit"
                className="w-[72px] px-[6px] py-[4px] border border-gray-300 rounded text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !newCategory || !newLimit}
              className="px-[10px] py-[4px] bg-blue-600 text-white text-[12px] font-medium rounded hover:bg-blue-700 disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => { setAdding(false); setNewCategory(''); setNewLimit(''); }}
              className="px-[10px] py-[4px] bg-gray-100 text-[var(--fg-2)] text-[12px] font-medium rounded hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
