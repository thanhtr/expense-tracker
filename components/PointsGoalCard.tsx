'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { today, fmtDateLong, fmtNumber } from '@/lib/utils';

interface Level {
  id: number;
  label: string;
  targetPoints: number;
}

interface LevelProgress extends Level {
  reached: boolean;
  pctOfTarget: number;
  remaining: number;
  expectedByToday: number;
  pointsPerMonthNeeded: number | null;
  onTrack: boolean | null;
}

interface Balance {
  id: number;
  balance: number;
  recordedAt: string;
  note: string;
}

interface Progress {
  latestBalance: number;
  latestRecordedAt: string | null;
  periodElapsedPct: number;
  monthsElapsed: number;
  monthsRemaining: number;
  observedPointsPerMonth: number | null;
  projectedEndBalance: number | null;
  levels: LevelProgress[];
}

interface PointsGoal {
  id: number;
  name: string;
  unit: string;
  periodStart: string;
  periodEnd: string;
  note: string;
  levels: Level[];
  balances: Balance[];
  progress: Progress;
}

function defaultForm() {
  const year = new Date().getFullYear() + 1;
  return {
    name: `Avios ${year}`,
    unit: 'Avios',
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    note: '',
    levels: [
      { label: 'Minimum — one-way ×2', targetPoints: '80000' },
      { label: 'Extended — return ×2', targetPoints: '160000' },
    ],
  };
}

function LevelRow({ level, unit }: { level: LevelProgress; unit: string }) {
  const pct = Math.min(level.pctOfTarget, 100);
  const color = level.reached ? 'bg-emerald-500' : level.onTrack === false ? 'bg-amber-400' : 'bg-blue-500';
  return (
    <div className="space-y-[6px]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[13px] font-medium">{level.label}</span>
        <span className="text-[12px] text-[var(--fg-3)] mono">
          {fmtNumber(level.targetPoints)} {unit}
        </span>
      </div>
      <div className="w-full h-[6px] bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-[var(--fg-3)]">
        <span>
          {level.pctOfTarget.toFixed(0)}% reached
          {level.reached ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium"> · goal reached</span>
          ) : (
            <> · {fmtNumber(level.remaining)} {unit} remaining</>
          )}
        </span>
        {!level.reached && level.pointsPerMonthNeeded !== null && (
          <span className={level.onTrack === false ? 'text-amber-600 dark:text-amber-400' : ''}>
            needs {fmtNumber(level.pointsPerMonthNeeded)}/mo
            {level.onTrack === true && ' · on track'}
            {level.onTrack === false && ' · behind pace'}
          </span>
        )}
      </div>
    </div>
  );
}

function GoalCard({
  goal,
  onUpdate,
  onRemove,
}: {
  goal: PointsGoal;
  onUpdate: (goal: PointsGoal) => void;
  onRemove: (id: number) => void;
}) {
  const [addingReading, setAddingReading] = useState(false);
  const [readingBalance, setReadingBalance] = useState('');
  const [readingDate, setReadingDate] = useState(today());
  const [readingNote, setReadingNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { progress } = goal;
  const highestTarget = Math.max(...goal.levels.map((l) => l.targetPoints), 1);
  const overallPct = Math.min((progress.latestBalance / highestTarget) * 100, 100);

  async function handleAddReading(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseInt(readingBalance, 10);
    if (isNaN(balance) || balance < 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/points-goals/${goal.id}/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance, recordedAt: readingDate, note: readingNote }),
      });
      if (res.ok) {
        const updated = await res.json() as PointsGoal;
        setReadingBalance('');
        setReadingNote('');
        setAddingReading(false);
        onUpdate(updated);
        toast.success('Balance reading added');
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to add reading');
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteReading(balanceId: number) {
    if (!window.confirm('Remove this reading?')) return;
    const res = await fetch(`/api/points-goals/${goal.id}/balances?balanceId=${balanceId}`, { method: 'DELETE' });
    if (res.ok) {
      onUpdate(await res.json() as PointsGoal);
    } else {
      toast.error('Failed to delete reading');
    }
  }

  async function handleDeleteGoal() {
    if (!window.confirm(`Delete goal "${goal.name}"? This also deletes its readings.`)) return;
    const res = await fetch(`/api/points-goals/${goal.id}`, { method: 'DELETE' });
    if (res.ok) {
      onRemove(goal.id);
      toast.success(`"${goal.name}" deleted`);
    } else {
      toast.error('Failed to delete goal');
    }
  }

  return (
    <div className="dash-card p-[16px_20px]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="text-[14px] font-semibold m-0">{goal.name}</h3>
          <div className="text-[11px] text-[var(--fg-3)]">
            {fmtDateLong(goal.periodStart)} – {fmtDateLong(goal.periodEnd)}
            {goal.note && <> · {goal.note}</>}
          </div>
        </div>
        <button
          onClick={() => void handleDeleteGoal()}
          className="text-[var(--fg-3)] hover:text-red-500 transition-colors text-[12px]"
          aria-label={`Delete goal ${goal.name}`}
        >
          ✕
        </button>
      </div>

      {/* Overall balance bar scaled to the highest level, with a tick per level */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-[12px] mb-[4px]">
          <span className="text-[var(--fg-2)]">
            Current balance: <span className="mono font-semibold">{fmtNumber(progress.latestBalance)} {goal.unit}</span>
          </span>
          {progress.latestRecordedAt && (
            <span className="text-[var(--fg-3)]">as of {fmtDateLong(progress.latestRecordedAt)}</span>
          )}
        </div>
        <div className="relative w-full h-[10px] bg-surface-2 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${overallPct}%` }} />
          {goal.levels.map((l) => {
            const tickPct = Math.min((l.targetPoints / highestTarget) * 100, 100);
            if (tickPct >= 99.5) return null; // avoid a tick right at the end
            return (
              <div
                key={l.id}
                className="absolute top-0 bottom-0 w-[2px] bg-[var(--surface)]"
                style={{ left: `${tickPct}%` }}
                title={`${l.label}: ${fmtNumber(l.targetPoints)}`}
              />
            );
          })}
        </div>
        <div className="text-[11px] text-[var(--fg-3)] mt-[4px]">
          {progress.periodElapsedPct.toFixed(0)}% of period elapsed
          {progress.observedPointsPerMonth !== null && (
            <> · observed pace {fmtNumber(progress.observedPointsPerMonth)}/mo</>
          )}
          {progress.projectedEndBalance !== null && (
            <> · projected end {fmtNumber(progress.projectedEndBalance)}</>
          )}
        </div>
      </div>

      {/* Per-level rows */}
      <div className="space-y-[14px] mb-4">
        {goal.levels
          .slice()
          .sort((a, b) => a.targetPoints - b.targetPoints)
          .map((l) => {
            const lp = progress.levels.find((p) => p.id === l.id);
            return lp ? <LevelRow key={l.id} level={lp} unit={goal.unit} /> : null;
          })}
      </div>

      {/* Readings history */}
      <div className="border-t border-[var(--border)] pt-3">
        <button
          onClick={() => setHistoryOpen((o) => !o)}
          className="text-[11px] text-[var(--fg-3)] hover:text-[var(--fg-2)] transition-colors"
          aria-expanded={historyOpen}
        >
          {historyOpen ? 'Hide' : 'Show'} readings ({goal.balances.length})
        </button>
        {historyOpen && (
          <ul className="mt-[8px] space-y-[4px]">
            {[...goal.balances].reverse().map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 text-[11px] text-[var(--fg-3)]">
                <span>
                  {fmtDateLong(b.recordedAt)}
                  {b.note && <span className="text-[var(--fg-3)]"> — {b.note}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="mono">{fmtNumber(b.balance)}</span>
                  <button
                    onClick={() => void handleDeleteReading(b.id)}
                    className="hover:text-red-500 transition-colors"
                    aria-label="Delete reading"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
            {goal.balances.length === 0 && <li className="text-[11px] text-[var(--fg-3)]">No readings yet</li>}
          </ul>
        )}
      </div>

      {/* Add reading */}
      <div className="pt-3">
        {addingReading ? (
          <form onSubmit={(e) => void handleAddReading(e)} className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col gap-[2px]">
              <span className="text-[10px] text-[var(--fg-2)]">Balance ({goal.unit})</span>
              <input
                type="number"
                className="date-input w-[120px]"
                value={readingBalance}
                onChange={(e) => setReadingBalance(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-[2px]">
              <span className="text-[10px] text-[var(--fg-2)]">Date</span>
              <input
                type="date"
                className="date-input"
                value={readingDate}
                onChange={(e) => setReadingDate(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-[2px] flex-1 min-w-[120px]">
              <span className="text-[10px] text-[var(--fg-2)]">Note (optional)</span>
              <input
                type="text"
                className="date-input"
                placeholder="e.g. Amex bonus transfer"
                value={readingNote}
                onChange={(e) => setReadingNote(e.target.value)}
              />
            </label>
            <button type="submit" disabled={saving} className="btn-ghost text-[12px] disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-ghost text-[12px] text-[var(--fg-3)]"
              onClick={() => setAddingReading(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </form>
        ) : (
          <button className="btn-ghost text-[12px]" onClick={() => { setReadingDate(today()); setAddingReading(true); }}>
            + Add reading
          </button>
        )}
      </div>
    </div>
  );
}

export function PointsGoalCard() {
  const [goals, setGoals] = useState<PointsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch('/api/points-goals')
      .then((r) => (r.ok ? r.json() : []))
      .then((d: PointsGoal[]) => setGoals(d))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function updateGoal(goal: PointsGoal) {
    setGoals((gs) => gs.map((g) => (g.id === goal.id ? goal : g)));
  }

  function removeGoal(id: number) {
    setGoals((gs) => gs.filter((g) => g.id !== id));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const levels = form.levels
      .map((l) => ({ label: l.label.trim(), targetPoints: parseInt(l.targetPoints, 10) }))
      .filter((l) => l.label && !isNaN(l.targetPoints) && l.targetPoints > 0);
    if (!form.name.trim() || levels.length === 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/points-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          unit: form.unit.trim() || 'Avios',
          periodStart: form.periodStart,
          periodEnd: form.periodEnd,
          note: form.note,
          levels,
        }),
      });
      if (res.ok) {
        const created = await res.json() as PointsGoal;
        setCreating(false);
        setForm(defaultForm());
        setGoals((gs) => [...gs, created]);
        toast.success('Goal created');
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to create goal');
      }
    } finally {
      setSaving(false);
    }
  }

  function updateLevel(i: number, patch: Partial<{ label: string; targetPoints: string }>) {
    setForm((p) => ({ ...p, levels: p.levels.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));
  }

  if (loading) {
    return <div className="dash-card h-[200px] animate-pulse bg-[var(--surface-2)]" />;
  }

  return (
    <div className="space-y-4">
      {goals.length === 0 && !creating && (
        <div className="dash-card p-8 text-center text-[13px] text-[var(--fg-3)] space-y-3">
          <div>No points goals yet.</div>
          <button className="btn-ghost" onClick={() => setCreating(true)}>+ Create goal</button>
        </div>
      )}

      {goals.map((goal) => (
        <GoalCard key={goal.id} goal={goal} onUpdate={updateGoal} onRemove={removeGoal} />
      ))}

      {creating ? (
        <form onSubmit={(e) => void handleCreate(e)} className="dash-card p-4 space-y-3">
          <div className="text-[13px] font-semibold mb-1">Create goal</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-[4px]">
              <span className="text-[11px] text-[var(--fg-2)]">Name</span>
              <input
                className="date-input"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </label>
            <label className="flex flex-col gap-[4px]">
              <span className="text-[11px] text-[var(--fg-2)]">Unit</span>
              <input
                className="date-input"
                value={form.unit}
                onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
              />
            </label>
            <label className="flex flex-col gap-[4px]">
              <span className="text-[11px] text-[var(--fg-2)]">Period start</span>
              <input
                type="date"
                className="date-input"
                value={form.periodStart}
                onChange={(e) => setForm((p) => ({ ...p, periodStart: e.target.value }))}
                required
              />
            </label>
            <label className="flex flex-col gap-[4px]">
              <span className="text-[11px] text-[var(--fg-2)]">Period end</span>
              <input
                type="date"
                className="date-input"
                value={form.periodEnd}
                onChange={(e) => setForm((p) => ({ ...p, periodEnd: e.target.value }))}
                required
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-[11px] text-[var(--fg-2)]">Levels</span>
            {form.levels.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="date-input flex-1"
                  placeholder="Label"
                  value={l.label}
                  onChange={(e) => updateLevel(i, { label: e.target.value })}
                />
                <input
                  type="number"
                  className="date-input w-[120px] text-right"
                  placeholder="Target"
                  value={l.targetPoints}
                  onChange={(e) => updateLevel(i, { targetPoints: e.target.value })}
                />
                <button
                  type="button"
                  className="text-[var(--fg-3)] hover:text-red-500 text-[12px]"
                  onClick={() => setForm((p) => ({ ...p, levels: p.levels.filter((_, idx) => idx !== i) }))}
                  aria-label="Remove level"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn-ghost text-[12px]"
              onClick={() => setForm((p) => ({ ...p, levels: [...p.levels, { label: '', targetPoints: '' }] }))}
            >
              + Add level
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={saving} className="btn-ghost disabled:opacity-40">
              {saving ? 'Creating…' : 'Create goal'}
            </button>
            <button
              type="button"
              className="btn-ghost text-[var(--fg-3)]"
              onClick={() => setCreating(false)}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : goals.length > 0 ? (
        <button className="btn-ghost text-[12px]" onClick={() => setCreating(true)}>+ Create goal</button>
      ) : null}
    </div>
  );
}
