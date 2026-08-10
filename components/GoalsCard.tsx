'use client';

import { useEffect, useState } from 'react';

interface SavingsGoal {
  id: number;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
}

function fmtEUR(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n).replace(/ /g, ' ');
}

function daysRemaining(targetDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function GoalProgressBar({ current, target }: { current: number; target: number }) {
  if (target <= 0) return <div className="w-full h-[6px] bg-surface-2 rounded-full" />;
  const pct = Math.min((current / target) * 100, 100);
  const done = current >= target;
  const color = done ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-blue-400';
  return (
    <div className="w-full h-[6px] bg-surface-2 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function OnTrackBadge({ goal }: { goal: SavingsGoal }) {
  const days = daysRemaining(goal.targetDate);
  const remaining = goal.targetAmount - goal.currentAmount;

  if (remaining <= 0) {
    return <span className="text-[10px] px-[6px] py-[1px] rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-medium">Done</span>;
  }
  if (days <= 0) {
    return <span className="text-[10px] px-[6px] py-[1px] rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 font-medium">Overdue</span>;
  }

  // compute required monthly rate vs actual progress rate
  const monthsLeft = days / 30.44;
  // assume goal was created at currentAmount=0 at some point; we can only assess if on track by
  // checking if saving remaining/monthsLeft per month is feasible relative to what we already saved.
  // Simple heuristic: if >50% saved with >50% time left, or >75% saved, mark on track.
  const pct = goal.currentAmount / goal.targetAmount;
  if (pct >= 0.75 || (pct >= 0.5 && monthsLeft > 1)) {
    return <span className="text-[10px] px-[6px] py-[1px] rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 font-medium">On track</span>;
  }
  return null;
}

export function GoalsCard() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // form state
  const [newName, setNewName] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCurrent, setNewCurrent] = useState('');
  const [newDate, setNewDate] = useState('');

  // edit state
  const [editCurrent, setEditCurrent] = useState('');

  useEffect(() => {
    fetch('/api/goals')
      .then(r => r.ok ? r.json() : [])
      .then(setGoals)
      .catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!newName.trim() || !newTarget || !newDate) return;
    setSaving(true);
    try {
      const res = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          targetAmount: parseFloat(newTarget),
          currentAmount: newCurrent ? parseFloat(newCurrent) : 0,
          targetDate: newDate,
        }),
      });
      if (res.ok) {
        const g = await res.json() as SavingsGoal;
        setGoals(prev => [...prev, g].sort((a, b) => a.targetDate.localeCompare(b.targetDate)));
        setAdding(false);
        setNewName(''); setNewTarget(''); setNewCurrent(''); setNewDate('');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateCurrent = async (id: number) => {
    const amount = parseFloat(editCurrent);
    if (isNaN(amount) || amount < 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/goals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentAmount: amount }),
      });
      if (res.ok) {
        const g = await res.json() as SavingsGoal;
        setGoals(prev => prev.map(x => x.id === id ? g : x));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this savings goal?')) return;
    try {
      const res = await fetch(`/api/goals/${id}`, { method: 'DELETE' });
      if (res.ok) setGoals(prev => prev.filter(x => x.id !== id));
    } catch { /* leave unchanged */ }
  };

  return (
    <div className="dash-card">
      <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
        <div>
          <h3 className="text-[13px] font-semibold m-0">Savings Goals</h3>
          <div className="text-[12px] text-[var(--fg-3)]">Progress toward your targets</div>
        </div>
        {!adding && (
          <button onClick={() => setAdding(true)} className="btn-ghost text-[12px]">+ Add goal</button>
        )}
      </div>

      <div className="p-[0_20px_20px] space-y-[16px]">
        {goals.length === 0 && !adding && (
          <div className="text-[13px] text-[var(--fg-3)] py-2">
            No savings goals yet. Click &quot;+ Add goal&quot; to get started.
          </div>
        )}

        {goals.map(g => {
          const pctDone = g.targetAmount > 0 ? Math.min((g.currentAmount / g.targetAmount) * 100, 100) : 0;
          const days = daysRemaining(g.targetDate);
          const isEditing = editingId === g.id;

          return (
            <div key={g.id} className="space-y-[6px]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[6px]">
                    <span className="text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{g.name}</span>
                    <OnTrackBadge goal={g} />
                  </div>
                  <div className="text-[11px] text-[var(--fg-3)] mt-[1px]">
                    {days > 0
                      ? `${days} day${days === 1 ? '' : 's'} left · ${new Date(g.targetDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : days === 0 ? 'Due today' : `Overdue by ${Math.abs(days)} days`}
                  </div>
                </div>
                <div className="flex items-center gap-[8px] flex-shrink-0">
                  {isEditing ? (
                    <>
                      <span className="text-[12px] text-[var(--fg-3)]">€</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        aria-label="Current saved amount"
                        value={editCurrent}
                        onChange={e => setEditCurrent(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdateCurrent(g.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-[80px] px-[6px] py-[2px] border border-blue-400 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={() => handleUpdateCurrent(g.id)} disabled={saving}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium">Save</button>
                      <button onClick={() => setEditingId(null)}
                        className="text-[11px] text-[var(--fg-3)] hover:text-[var(--foreground)]">Cancel</button>
                    </>
                  ) : (
                    <>
                      <div className="text-right">
                        <span className="mono text-[12px] text-[var(--fg-2)]">
                          <button
                            onClick={() => { setEditingId(g.id); setEditCurrent(String(g.currentAmount)); }}
                            className="hover:underline cursor-pointer"
                            title="Click to update saved amount"
                          >{fmtEUR(g.currentAmount)}</button>
                          {' '}/ {fmtEUR(g.targetAmount)}
                        </span>
                        <div className="text-[11px] text-[var(--fg-3)]">{pctDone.toFixed(0)}%</div>
                      </div>
                      <button onClick={() => handleDelete(g.id)}
                        className="text-[var(--fg-3)] hover:text-red-500 transition-colors"
                        title="Remove goal"
                        aria-label={`Remove goal ${g.name}`}>
                        <svg className="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
              <GoalProgressBar current={g.currentAmount} target={g.targetAmount} />
            </div>
          );
        })}

        {adding && (
          <div className="space-y-[8px] pt-[4px]">
            <div className="flex items-center gap-[8px] flex-wrap">
              <input
                type="text"
                placeholder="Goal name (e.g. Vacation)"
                aria-label="Goal name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                className="flex-1 min-w-[140px] px-[8px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex items-center gap-[4px]">
                <span className="text-[12px] text-[var(--fg-3)]">Target €</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  aria-label="Target amount"
                  value={newTarget}
                  onChange={e => setNewTarget(e.target.value)}
                  placeholder="3000"
                  className="w-[80px] px-[6px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-[4px]">
                <span className="text-[12px] text-[var(--fg-3)]">Saved €</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  aria-label="Current saved amount"
                  value={newCurrent}
                  onChange={e => setNewCurrent(e.target.value)}
                  placeholder="0"
                  className="w-[72px] px-[6px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <input
                type="date"
                aria-label="Target date"
                value={newDate}
                onChange={e => setNewDate(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                className="px-[8px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-[8px]">
              <button
                onClick={handleAdd}
                disabled={saving || !newName.trim() || !newTarget || !newDate}
                className="px-[10px] py-[4px] bg-blue-600 text-white text-[12px] font-medium rounded hover:bg-blue-700 disabled:opacity-50"
              >Add</button>
              <button
                onClick={() => { setAdding(false); setNewName(''); setNewTarget(''); setNewCurrent(''); setNewDate(''); }}
                className="px-[10px] py-[4px] bg-surface-2 text-[var(--fg-2)] text-[12px] font-medium rounded hover:bg-[var(--border)]"
              >Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
