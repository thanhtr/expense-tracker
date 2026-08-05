'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { SuggestionGroup } from '@/app/api/transactions/suggestions/route';

type ActionState = 'idle' | 'saving' | 'done' | 'skipped';

interface GroupState {
  group: SuggestionGroup;
  action: ActionState;
  selectedCategory: string;
}

export function SuggestionReview() {
  const [groups, setGroups] = useState<GroupState[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [acceptingAll, setAcceptingAll] = useState(false);

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(d => setCategories(d.categories ?? []))
      .catch(() => {});
    fetch('/api/transactions/suggestions')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => {
        setGroups(data.suggestions.map((g: SuggestionGroup) => ({
          group: g,
          action: 'idle' as ActionState,
          selectedCategory: g.suggestedCategory,
        })));
      })
      .catch(() => { setError('Failed to load suggestions'); toast.error('Failed to load suggestions'); })
      .finally(() => setLoading(false));
  }, []);

  const applyGroup = async (idx: number, category: string) => {
    const g = groups[idx];
    setGroups(prev => prev.map((x, i) => i === idx ? { ...x, action: 'saving' } : x));
    try {
      const ids = g.group.transactions.map(t => t.id);
      const res = await fetch('/api/transactions/bulk-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, category }),
      });
      if (res.ok) {
        setGroups(prev => prev.map((x, i) => i === idx ? { ...x, action: 'done' } : x));
      } else {
        setGroups(prev => prev.map((x, i) => i === idx ? { ...x, action: 'idle' } : x));
      }
    } catch {
      setGroups(prev => prev.map((x, i) => i === idx ? { ...x, action: 'idle' } : x));
    }
  };

  const skipGroup = (idx: number) => {
    setGroups(prev => prev.map((x, i) => i === idx ? { ...x, action: 'skipped' } : x));
  };

  const handleAcceptAll = async () => {
    setAcceptingAll(true);
    for (let i = 0; i < groups.length; i++) {
      if (groups[i].action === 'idle') {
        await applyGroup(i, groups[i].selectedCategory);
      }
    }
    setAcceptingAll(false);
  };

  if (loading) {
    return <div className="text-center py-12 text-fg-3">Loading suggestions…</div>;
  }
  if (error) {
    return <div className="text-center py-8 text-red-600 dark:text-red-400">{error}</div>;
  }

  const pending = groups.filter(g => g.action === 'idle');
  const done = groups.filter(g => g.action === 'done');
  const skipped = groups.filter(g => g.action === 'skipped');

  if (groups.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border-soft p-12 text-center">
        <div className="text-4xl mb-4">✓</div>
        <p className="text-foreground font-medium text-lg">All transactions look good</p>
        <p className="text-fg-3 text-sm mt-2">No mis-categorized or uncategorized transactions found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-fg-2">
          {pending.length > 0
            ? <><span className="font-semibold text-foreground">{pending.length}</span> suggestion{pending.length !== 1 ? 's' : ''} pending</>
            : 'All reviewed'}
          {done.length > 0 && <span className="ml-3 text-pos">· {done.length} applied</span>}
          {skipped.length > 0 && <span className="ml-3 text-fg-3">· {skipped.length} skipped</span>}
        </div>
        {pending.length > 1 && (
          <button
            onClick={handleAcceptAll}
            disabled={acceptingAll}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {acceptingAll ? 'Applying…' : `Accept all ${pending.length} suggestions`}
          </button>
        )}
      </div>

      {/* Suggestion cards */}
      {groups.map((gs, idx) => {
        const { group, action, selectedCategory } = gs;
        const txCount = group.transactions.length;
        const totalAmount = group.transactions.reduce((s, t) => s + t.amount, 0);
        const uniqueCurrentCats = [...new Set(group.transactions.map(t => t.currentCategory || '⚠ Uncategorized'))];

        if (action === 'done') {
          return (
            <div key={idx} className="bg-surface rounded-lg border border-border-soft p-4 opacity-60">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-pos font-medium">✓ Applied</span>
                <span className="text-foreground font-medium">{group.merchant}</span>
                <span className="text-fg-3">→ {selectedCategory}</span>
                <span className="text-fg-3">({txCount} transaction{txCount !== 1 ? 's' : ''})</span>
              </div>
            </div>
          );
        }

        if (action === 'skipped') {
          return (
            <div key={idx} className="bg-surface rounded-lg border border-border-soft p-4 opacity-50">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-fg-3">— Skipped</span>
                <span className="text-foreground font-medium">{group.merchant}</span>
                <button
                  onClick={() => setGroups(prev => prev.map((x, i) => i === idx ? { ...x, action: 'idle' } : x))}
                  className="text-blue-600 dark:text-blue-400 text-xs hover:underline"
                >
                  Undo
                </button>
              </div>
            </div>
          );
        }

        return (
          <div key={idx} className="bg-surface rounded-lg border border-border-soft overflow-hidden">
            <div className="p-4 flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground">{group.merchant}</span>
                  <span className="dash-chip neutral">{txCount} tx</span>
                  <span className="dash-chip neutral">€{totalAmount.toFixed(0)} total</span>
                </div>
                <div className="text-sm text-fg-3 flex flex-wrap items-center gap-2">
                  <span>Current: <span className="text-fg-2">{uniqueCurrentCats.join(', ')}</span></span>
                  <span className="text-fg-3">→</span>
                  <span>Suggested: <span className="text-blue-600 dark:text-blue-400 font-medium">{group.suggestedCategory}</span></span>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <select
                  value={selectedCategory}
                  onChange={e => setGroups(prev => prev.map((x, i) => i === idx ? { ...x, selectedCategory: e.target.value } : x))}
                  className="px-2 py-1.5 border border-border-soft rounded bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {(categories.length > 0 ? categories : [group.suggestedCategory]).map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <button
                  onClick={() => applyGroup(idx, selectedCategory)}
                  disabled={action === 'saving'}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {action === 'saving' ? '…' : 'Accept'}
                </button>
                <button
                  onClick={() => skipGroup(idx)}
                  className="px-3 py-1.5 bg-surface-2 text-fg-2 text-sm font-medium rounded hover:bg-[var(--border)]"
                >
                  Skip
                </button>
              </div>
            </div>

            {/* Transaction list (collapsed to 3 rows) */}
            <div className="border-t border-border-soft bg-surface-2">
              {group.transactions.slice(0, 3).map(t => (
                <div key={t.id} className="px-4 py-2 flex items-center justify-between text-xs text-fg-3 border-b border-border-soft last:border-0">
                  <span>{t.date}</span>
                  <span className={t.currentCategory ? 'text-fg-2' : 'text-amber-600 dark:text-amber-400'}>
                    {t.currentCategory || '⚠ Uncategorized'}
                  </span>
                  <span className="mono">€{t.amount.toFixed(2)}</span>
                </div>
              ))}
              {txCount > 3 && (
                <div className="px-4 py-2 text-xs text-fg-3">
                  + {txCount - 3} more transaction{txCount - 3 !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
