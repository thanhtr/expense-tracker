'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { today, fmtDateLong, fmtNumber, fmtEUR } from '@/lib/utils';
import { SourceLinks } from './SourceLinks';
import { AviosExplainer } from './AviosExplainer';
import { AVIOS_SOURCES, UPGRADE_AVIOS_PER_PAX_DIRECTION } from '@/lib/avios-facts';

interface Balance {
  id: number;
  balance: number;
  recordedAt: string;
  note: string;
}

type FlightStatus = 'planned' | 'redeemed';

interface FlightProgress {
  id: number;
  label: string;
  points: number;
  economyFareEur: number | null;
  neededBy: string;
  status: FlightStatus;
  redeemedAt: string | null;
  note: string;
  coveredNow: number;
  pctCoveredNow: number;
  remainingNow: number;
  cumulativeNeeded: number;
  remainingCumulative: number;
  projectedAtDate: number | null;
  shortfallAtDate: number | null;
  pointsPerMonthNeeded: number | null;
  onTrack: boolean | null;
}

interface Progress {
  latestBalance: number;
  latestRecordedAt: string | null;
  accruedPoints: number;
  availableBalance: number;
  totalRedeemedPoints: number;
  totalPlannedPoints: number;
  observedPointsPerMonth: number | null;
  flights: FlightProgress[];
  pastFlights: FlightProgress[];
  nextFlightAtRisk: FlightProgress | null;
}

interface AviosStrategyConversion {
  flightId: number;
  flightLabel: string;
  neededBy: string;
  shortfallPoints: number;
  monthsUntil: number;
  eurTotal: number;
  mrPoints: number;
  visaSpendBasicTotal: number;
  visaSpendSilverTotal: number;
  amexSpendTotal: number;
  overCap: boolean;
}

interface AviosStrategy {
  allCovered: boolean;
  nextAtRisk: AviosStrategyConversion | null;
  combined: AviosStrategyConversion | null;
}

interface CashPlanFlight {
  id: number;
  label: string;
  neededBy: string;
  cashNeeded: number;
  onTrack: boolean;
  shortBy: number;
}

interface CashPlan {
  monthlyDiscretionary: number;
  liquidBufferAvailable: number;
  overcommitted: boolean;
  flights: CashPlanFlight[];
  onTrack: boolean;
}

interface PointsGoal {
  id: number;
  name: string;
  unit: string;
  note: string;
  balances: Balance[];
  progress: Progress;
  strategy?: AviosStrategy;
  cashPlan?: CashPlan;
}

function defaultForm() {
  const year = new Date().getFullYear() + 1;
  return { name: `Avios ${year}`, unit: 'Avios', note: '' };
}

function defaultFlightForm() {
  return { label: '', points: String(UPGRADE_AVIOS_PER_PAX_DIRECTION * 2), economyFareEur: '', neededBy: '', note: '' };
}

function flightFormFrom(f: FlightProgress) {
  return {
    label: f.label,
    points: String(f.points),
    economyFareEur: f.economyFareEur !== null ? String(f.economyFareEur) : '',
    neededBy: f.neededBy,
    note: f.note,
  };
}

type FlightFormState = ReturnType<typeof defaultFlightForm>;

function FlightEditForm({
  form,
  setForm,
  unit,
  saving,
  onSubmit,
  onCancel,
}: {
  form: FlightFormState;
  setForm: (updater: (p: FlightFormState) => FlightFormState) => void;
  unit: string;
  saving: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="flex items-end gap-2 flex-wrap">
      <label className="flex flex-col gap-[2px] flex-1 min-w-[160px]">
        <span className="text-[10px] text-[var(--fg-2)]">Label</span>
        <input
          className="date-input"
          placeholder="e.g. Japan return, 2 pax"
          value={form.label}
          onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
          required
          autoFocus
        />
      </label>
      <label className="flex flex-col gap-[2px]">
        <span className="text-[10px] text-[var(--fg-2)]">{unit} needed</span>
        <input
          type="number"
          className="date-input w-[110px]"
          value={form.points}
          onChange={(e) => setForm((p) => ({ ...p, points: e.target.value }))}
          required
        />
      </label>
      <label className="flex flex-col gap-[2px]">
        <span className="text-[10px] text-[var(--fg-2)]">Economy fare € (optional)</span>
        <input
          type="number"
          className="date-input w-[110px]"
          value={form.economyFareEur}
          onChange={(e) => setForm((p) => ({ ...p, economyFareEur: e.target.value }))}
        />
      </label>
      <label className="flex flex-col gap-[2px]">
        <span className="text-[10px] text-[var(--fg-2)]">Needed by</span>
        <input
          type="date"
          className="date-input"
          value={form.neededBy}
          onChange={(e) => setForm((p) => ({ ...p, neededBy: e.target.value }))}
          required
        />
      </label>
      <label className="flex flex-col gap-[2px] flex-1 min-w-[140px]">
        <span className="text-[10px] text-[var(--fg-2)]">Note (optional)</span>
        <input
          type="text"
          className="date-input"
          placeholder="e.g. booking reference"
          value={form.note}
          onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
        />
      </label>
      <button type="submit" disabled={saving} className="btn-ghost text-[12px] disabled:opacity-40">
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="btn-ghost text-[12px] text-[var(--fg-3)]" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
    </form>
  );
}

function FlightProgressRow({ flight, unit }: { flight: FlightProgress; unit: string }) {
  const pct = Math.min(flight.pctCoveredNow, 100);
  const color = flight.remainingNow === 0 ? 'bg-emerald-500' : flight.onTrack === false ? 'bg-amber-400' : 'bg-blue-500';
  return (
    <div className="space-y-[6px]">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[13px] font-medium">{flight.label}</span>
        <span className="text-[12px] text-[var(--fg-3)] mono">
          {fmtNumber(flight.points)} {unit} · by {fmtDateLong(flight.neededBy)}
        </span>
      </div>
      <div className="w-full h-[6px] bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] text-[var(--fg-3)]">
        <span>
          {flight.pctCoveredNow.toFixed(0)}% covered now
          {flight.remainingNow === 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium"> · fully covered</span>
          ) : (
            <> · {fmtNumber(flight.remainingNow)} {unit} short</>
          )}
          {flight.economyFareEur !== null && <> · fare {fmtEUR(flight.economyFareEur)}</>}
          {flight.note && <> · {flight.note}</>}
        </span>
        {flight.remainingNow > 0 && flight.pointsPerMonthNeeded !== null && (
          <span className={flight.onTrack === false ? 'text-amber-600 dark:text-amber-400' : ''}>
            needs {fmtNumber(flight.pointsPerMonthNeeded)}/mo
            {flight.onTrack === true && ' · on track'}
            {flight.onTrack === false && ' · behind pace'}
          </span>
        )}
      </div>
    </div>
  );
}

/** An upcoming flight whose Avios (and usually cash fare) are already spent — the trip just
 * hasn't happened yet. No progress bar (there's nothing left to cover), just a confirmation. */
function RedeemedUpcomingRow({ flight, unit }: { flight: FlightProgress; unit: string }) {
  return (
    <div className="flex items-center justify-between gap-2 flex-wrap text-[13px]">
      <span>
        <span className="text-emerald-600 dark:text-emerald-400">✓</span>{' '}
        <span className="font-medium">{flight.label}</span>
        <span className="text-[11px] text-[var(--fg-3)]"> — flying {fmtDateLong(flight.neededBy)}</span>
      </span>
      <span className="text-[12px] text-[var(--fg-3)] mono">
        {fmtNumber(flight.points)} {unit}
        {flight.economyFareEur !== null && <> · fare {fmtEUR(flight.economyFareEur)}</>}
        {flight.note && <> · {flight.note}</>}
      </span>
    </div>
  );
}

function StrategyConversion({ c, unit }: { c: AviosStrategyConversion; unit: string }) {
  return (
    <div className="space-y-1 text-[12px]">
      <div className="font-medium text-[13px]">
        {fmtNumber(c.shortfallPoints)} {unit} short for &quot;{c.flightLabel}&quot; by {fmtDateLong(c.neededBy)}
        {c.overCap && (
          <span className="text-amber-600 dark:text-amber-400 font-normal"> · exceeds the 200,000/yr purchase cap</span>
        )}
      </div>
      <ul className="text-[var(--fg-2)] space-y-[2px] pl-4 list-disc">
        <li>Subscription price: <span className="mono">{fmtEUR(c.eurTotal, { cents: true })}</span></li>
        <li>Amex MR needed: <span className="mono">{fmtNumber(c.mrPoints)}</span> (≈ <span className="mono">{fmtEUR(c.amexSpendTotal)}</span> of card spend at 2 MR/€)</li>
        <li>Finnair Visa spend: <span className="mono">{fmtEUR(c.visaSpendSilverTotal)}</span> at Silver, <span className="mono">{fmtEUR(c.visaSpendBasicTotal)}</span> at Basic</li>
      </ul>
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
  const [savingReading, setSavingReading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [redeemedOpen, setRedeemedOpen] = useState(false);
  const [editingBalanceId, setEditingBalanceId] = useState<number | null>(null);
  const [balanceEditForm, setBalanceEditForm] = useState({ balance: '', recordedAt: '', note: '' });
  const [savingBalanceEdit, setSavingBalanceEdit] = useState(false);

  const [addingFlight, setAddingFlight] = useState(false);
  const [flightForm, setFlightForm] = useState(defaultFlightForm);
  const [savingFlight, setSavingFlight] = useState(false);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const [redeemDate, setRedeemDate] = useState(today());
  const [editingFlightId, setEditingFlightId] = useState<number | null>(null);
  const [flightEditForm, setFlightEditForm] = useState<FlightFormState>(defaultFlightForm());
  const [savingFlightEdit, setSavingFlightEdit] = useState(false);

  const [editingGoal, setEditingGoal] = useState(false);
  const [goalEditForm, setGoalEditForm] = useState({ name: goal.name, unit: goal.unit, note: goal.note });
  const [savingGoalEdit, setSavingGoalEdit] = useState(false);

  const { progress } = goal;

  async function handleAddReading(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseInt(readingBalance, 10);
    if (isNaN(balance) || balance < 0) return;
    setSavingReading(true);
    try {
      const res = await fetch(`/api/points-goals/${goal.id}/balances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance, recordedAt: readingDate, note: readingNote }),
      });
      if (res.ok) {
        setReadingBalance('');
        setReadingNote('');
        setAddingReading(false);
        onUpdate(await res.json() as PointsGoal);
        toast.success('Balance reading added');
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to add reading');
      }
    } finally {
      setSavingReading(false);
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

  async function handleSaveBalanceEdit(e: React.FormEvent, balanceId: number) {
    e.preventDefault();
    const balance = parseInt(balanceEditForm.balance, 10);
    if (isNaN(balance) || balance < 0 || !balanceEditForm.recordedAt) return;
    setSavingBalanceEdit(true);
    try {
      const res = await fetch(`/api/points-goals/${goal.id}/balances?balanceId=${balanceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance, recordedAt: balanceEditForm.recordedAt, note: balanceEditForm.note }),
      });
      if (res.ok) {
        setEditingBalanceId(null);
        onUpdate(await res.json() as PointsGoal);
        toast.success('Reading updated');
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to update reading');
      }
    } catch {
      toast.error('Failed to update reading');
    } finally {
      setSavingBalanceEdit(false);
    }
  }

  async function handleDeleteGoal() {
    if (!window.confirm(`Delete goal "${goal.name}"? This also deletes its readings and flights.`)) return;
    const res = await fetch(`/api/points-goals/${goal.id}`, { method: 'DELETE' });
    if (res.ok) {
      onRemove(goal.id);
      toast.success(`"${goal.name}" deleted`);
    } else {
      toast.error('Failed to delete goal');
    }
  }

  async function handleSaveGoalEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!goalEditForm.name.trim()) return;
    setSavingGoalEdit(true);
    try {
      const res = await fetch(`/api/points-goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: goalEditForm.name.trim(),
          // Preserve the goal's existing unit if the field is cleared — unlike creating a new
          // goal, there's no sensible "default" to silently fall back to here, and falling back
          // to 'Avios' would silently flip e.g. a "Tier points" goal's unit on an empty submit.
          unit: goalEditForm.unit.trim() || goal.unit,
          note: goalEditForm.note,
        }),
      });
      if (res.ok) {
        setEditingGoal(false);
        onUpdate(await res.json() as PointsGoal);
        toast.success('Goal updated');
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to update goal');
      }
    } catch {
      toast.error('Failed to update goal');
    } finally {
      setSavingGoalEdit(false);
    }
  }

  async function handleAddFlight(e: React.FormEvent) {
    e.preventDefault();
    const points = parseInt(flightForm.points, 10);
    const economyFareEur = flightForm.economyFareEur ? parseFloat(flightForm.economyFareEur) : null;
    if (!flightForm.label.trim() || isNaN(points) || points <= 0 || !flightForm.neededBy) return;
    setSavingFlight(true);
    try {
      const res = await fetch(`/api/points-goals/${goal.id}/flights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: flightForm.label.trim(),
          points,
          economyFareEur,
          neededBy: flightForm.neededBy,
          note: flightForm.note,
        }),
      });
      if (res.ok) {
        setFlightForm(defaultFlightForm());
        setAddingFlight(false);
        onUpdate(await res.json() as PointsGoal);
        toast.success('Flight added');
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to add flight');
      }
    } finally {
      setSavingFlight(false);
    }
  }

  async function handleMarkRedeemed(flightId: number) {
    const res = await fetch(`/api/points-goals/${goal.id}/flights/${flightId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'redeemed', redeemedAt: redeemDate }),
    });
    if (res.ok) {
      setRedeemingId(null);
      onUpdate(await res.json() as PointsGoal);
      toast.success('Flight marked redeemed');
    } else {
      toast.error('Failed to update flight');
    }
  }

  async function handleUnredeem(flightId: number) {
    if (!window.confirm('Revert this flight to planned? Its Avios/cash will count as still needed again.')) return;
    const res = await fetch(`/api/points-goals/${goal.id}/flights/${flightId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'planned', redeemedAt: null }),
    });
    if (res.ok) {
      onUpdate(await res.json() as PointsGoal);
      toast.success('Flight reverted to planned');
    } else {
      toast.error('Failed to update flight');
    }
  }

  async function handleSaveFlightEdit(e: React.FormEvent, flightId: number) {
    e.preventDefault();
    const points = parseInt(flightEditForm.points, 10);
    const economyFareEur = flightEditForm.economyFareEur ? parseFloat(flightEditForm.economyFareEur) : null;
    if (!flightEditForm.label.trim() || isNaN(points) || points <= 0 || !flightEditForm.neededBy) return;
    setSavingFlightEdit(true);
    try {
      const res = await fetch(`/api/points-goals/${goal.id}/flights/${flightId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: flightEditForm.label.trim(),
          points,
          economyFareEur,
          neededBy: flightEditForm.neededBy,
          note: flightEditForm.note,
        }),
      });
      if (res.ok) {
        setEditingFlightId(null);
        onUpdate(await res.json() as PointsGoal);
        toast.success('Flight updated');
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to update flight');
      }
    } catch {
      toast.error('Failed to update flight');
    } finally {
      setSavingFlightEdit(false);
    }
  }

  async function handleDeleteFlight(flightId: number, label: string) {
    if (!window.confirm(`Remove "${label}"?`)) return;
    const res = await fetch(`/api/points-goals/${goal.id}/flights/${flightId}`, { method: 'DELETE' });
    if (res.ok) {
      onUpdate(await res.json() as PointsGoal);
    } else {
      toast.error('Failed to delete flight');
    }
  }

  return (
    <div className="dash-card p-[16px_20px]">
      {editingGoal ? (
        <form onSubmit={(e) => void handleSaveGoalEdit(e)} className="flex items-end gap-2 flex-wrap mb-3">
          <label className="flex flex-col gap-[2px] flex-1 min-w-[140px]">
            <span className="text-[10px] text-[var(--fg-2)]">Name</span>
            <input
              className="date-input"
              value={goalEditForm.name}
              onChange={(e) => setGoalEditForm((p) => ({ ...p, name: e.target.value }))}
              required
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-[2px]">
            <span className="text-[10px] text-[var(--fg-2)]">Unit</span>
            <input
              className="date-input w-[100px]"
              value={goalEditForm.unit}
              onChange={(e) => setGoalEditForm((p) => ({ ...p, unit: e.target.value }))}
            />
          </label>
          <label className="flex flex-col gap-[2px] flex-1 min-w-[140px]">
            <span className="text-[10px] text-[var(--fg-2)]">Note</span>
            <input
              className="date-input"
              value={goalEditForm.note}
              onChange={(e) => setGoalEditForm((p) => ({ ...p, note: e.target.value }))}
            />
          </label>
          <button type="submit" disabled={savingGoalEdit} className="btn-ghost text-[12px] disabled:opacity-40">
            {savingGoalEdit ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="btn-ghost text-[12px] text-[var(--fg-3)]"
            onClick={() => setEditingGoal(false)}
            disabled={savingGoalEdit}
          >
            Cancel
          </button>
        </form>
      ) : (
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-[14px] font-semibold m-0">{goal.name}</h3>
            {goal.note && <div className="text-[11px] text-[var(--fg-3)]">{goal.note}</div>}
          </div>
          <div className="flex items-center gap-2 text-[12px]">
            <button
              onClick={() => { setGoalEditForm({ name: goal.name, unit: goal.unit, note: goal.note }); setEditingGoal(true); }}
              className="text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors"
              aria-label={`Edit goal ${goal.name}`}
            >
              Edit
            </button>
            <button
              onClick={() => void handleDeleteGoal()}
              className="text-[var(--fg-3)] hover:text-red-500 transition-colors"
              aria-label={`Delete goal ${goal.name}`}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Balance summary */}
      <div className="mb-4 text-[12px] space-y-[2px]">
        <div className="text-[var(--fg-2)]">
          Balance: <span className="mono font-semibold">{fmtNumber(progress.latestBalance)} {goal.unit}</span>
          {progress.latestRecordedAt && <span className="text-[var(--fg-3)]"> as of {fmtDateLong(progress.latestRecordedAt)}</span>}
          {progress.totalRedeemedPoints > 0 && (
            <span className="text-[var(--fg-3)]"> · {fmtNumber(progress.totalRedeemedPoints)} redeemed</span>
          )}
        </div>
        {progress.observedPointsPerMonth !== null && (
          <div className="text-[11px] text-[var(--fg-3)]">observed pace {fmtNumber(progress.observedPointsPerMonth)}/mo (trailing 12mo)</div>
        )}
      </div>

      {/* Flights: planned, plus upcoming trips already redeemed/paid for */}
      <div className="space-y-[14px] mb-3">
        {progress.flights.length === 0 && (
          <div className="text-[12px] text-[var(--fg-3)]">No flights tracked yet.</div>
        )}
        {progress.flights.map((f) => (
          <div key={f.id} className="space-y-1">
            {editingFlightId === f.id ? (
              <FlightEditForm
                form={flightEditForm}
                setForm={setFlightEditForm}
                unit={goal.unit}
                saving={savingFlightEdit}
                onSubmit={(e) => void handleSaveFlightEdit(e, f.id)}
                onCancel={() => setEditingFlightId(null)}
              />
            ) : (
              <>
                {f.status === 'redeemed' ? (
                  <RedeemedUpcomingRow flight={f} unit={goal.unit} />
                ) : (
                  <FlightProgressRow flight={f} unit={goal.unit} />
                )}
                <div className="flex items-center gap-3 text-[11px]">
                  {redeemingId === f.id ? (
                    <>
                      <input
                        type="date"
                        className="date-input"
                        value={redeemDate}
                        onChange={(e) => setRedeemDate(e.target.value)}
                      />
                      <button className="btn-ghost text-[11px]" onClick={() => void handleMarkRedeemed(f.id)}>Confirm</button>
                      <button className="btn-ghost text-[11px] text-[var(--fg-3)]" onClick={() => setRedeemingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      {f.status === 'planned' && (
                        <button
                          className="text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors"
                          onClick={() => { setRedeemDate(today()); setRedeemingId(f.id); }}
                        >
                          Mark redeemed
                        </button>
                      )}
                      {f.status === 'redeemed' && (
                        <button
                          className="text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors"
                          onClick={() => void handleUnredeem(f.id)}
                        >
                          Revert to planned
                        </button>
                      )}
                      <button
                        className="text-[var(--fg-3)] hover:text-[var(--fg-1)] transition-colors"
                        onClick={() => { setFlightEditForm(flightFormFrom(f)); setEditingFlightId(f.id); }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-[var(--fg-3)] hover:text-red-500 transition-colors"
                        onClick={() => void handleDeleteFlight(f.id, f.label)}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Past flights (redeemed, and the date has already happened) */}
      {progress.pastFlights.length > 0 && (
        <div className="border-t border-[var(--border)] pt-3 mb-3">
          <button
            onClick={() => setRedeemedOpen((o) => !o)}
            className="text-[11px] text-[var(--fg-3)] hover:text-[var(--fg-2)] transition-colors"
            aria-expanded={redeemedOpen}
          >
            {redeemedOpen ? 'Hide' : 'Show'} past ({progress.pastFlights.length})
          </button>
          {redeemedOpen && (
            <ul className="mt-[8px] space-y-[4px]">
              {progress.pastFlights.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 text-[11px] text-[var(--fg-3)]">
                  <span>✓ {f.label} — redeemed {f.redeemedAt && fmtDateLong(f.redeemedAt)}</span>
                  <span className="flex items-center gap-2">
                    <span className="mono">{fmtNumber(f.points)}</span>
                    <button
                      onClick={() => void handleDeleteFlight(f.id, f.label)}
                      className="hover:text-red-500 transition-colors"
                      aria-label="Delete flight"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Add flight */}
      <div className="border-t border-[var(--border)] pt-3 mb-3">
        {addingFlight ? (
          <>
            <FlightEditForm
              form={flightForm}
              setForm={setFlightForm}
              unit={goal.unit}
              saving={savingFlight}
              onSubmit={(e) => void handleAddFlight(e)}
              onCancel={() => setAddingFlight(false)}
            />
            {goal.unit === 'Avios' && (
              <div className="w-full text-[10px] text-[var(--fg-3)] mt-1">
                {fmtNumber(UPGRADE_AVIOS_PER_PAX_DIRECTION)} Avios/passenger/direction for a Business upgrade on
                long-haul Asia/N. America — <SourceLinks sources={[AVIOS_SOURCES.upgrade]} />
              </div>
            )}
          </>
        ) : (
          <button className="btn-ghost text-[12px]" onClick={() => setAddingFlight(true)}>+ Add flight</button>
        )}
      </div>

      {/* Avios strategy */}
      {goal.strategy && (
        <div className="border-t border-[var(--border)] pt-3 mb-3 space-y-2">
          <div className="text-[12px] font-semibold text-[var(--fg-1)]">Closing the Avios gap</div>
          {goal.strategy.allCovered ? (
            <div className="text-[12px] text-emerald-600 dark:text-emerald-400">Every tracked flight is covered by your current balance.</div>
          ) : (
            <>
              {goal.strategy.nextAtRisk && <StrategyConversion c={goal.strategy.nextAtRisk} unit={goal.unit} />}
              {goal.strategy.combined && (
                <>
                  <div className="text-[11px] text-[var(--fg-3)] pt-1">Combined, across every tracked flight:</div>
                  <StrategyConversion c={goal.strategy.combined} unit={goal.unit} />
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Cash plan */}
      {goal.cashPlan && (
        <div className="border-t border-[var(--border)] pt-3 mb-3 space-y-2 text-[12px]">
          <div className="font-semibold text-[var(--fg-1)]">Can I afford it?</div>
          <div className="text-[var(--fg-2)]">
            <span className={`mono font-medium ${goal.cashPlan.overcommitted ? 'text-red-600 dark:text-red-400' : ''}`}>
              {fmtEUR(goal.cashPlan.monthlyDiscretionary)}
            </span>/mo discretionary (net income minus observed investing)
            {goal.cashPlan.liquidBufferAvailable > 0 && (
              <> · <span className="mono">{fmtEUR(goal.cashPlan.liquidBufferAvailable)}</span> spare in the bank, above your emergency buffer</>
            )}
            {goal.cashPlan.overcommitted && ' — investing already exceeds net income'}
          </div>
          {goal.cashPlan.flights.length > 0 && (
            <ul className="space-y-[2px] pl-4 list-disc text-[var(--fg-2)]">
              {goal.cashPlan.flights.map((f) => (
                <li key={f.id}>
                  {f.label}: needs <span className="mono">{fmtEUR(f.cashNeeded)}</span> by {fmtDateLong(f.neededBy)} —{' '}
                  {f.onTrack ? (
                    <span className="text-emerald-600 dark:text-emerald-400">on track</span>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400">short by {fmtEUR(f.shortBy)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="text-[11px] text-[var(--fg-3)]">
            Priced at the subscription rate (the dependable baseline); buying Avios during a flash sale would cost
            less than shown, never more.
          </div>
        </div>
      )}

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
              <li key={b.id} className="text-[11px] text-[var(--fg-3)]">
                {editingBalanceId === b.id ? (
                  <form onSubmit={(e) => void handleSaveBalanceEdit(e, b.id)} className="flex items-end gap-2 flex-wrap py-[2px]">
                    <input
                      type="number"
                      className="date-input w-[100px]"
                      value={balanceEditForm.balance}
                      onChange={(e) => setBalanceEditForm((p) => ({ ...p, balance: e.target.value }))}
                      required
                      autoFocus
                    />
                    <input
                      type="date"
                      className="date-input"
                      value={balanceEditForm.recordedAt}
                      onChange={(e) => setBalanceEditForm((p) => ({ ...p, recordedAt: e.target.value }))}
                      required
                    />
                    <input
                      type="text"
                      className="date-input flex-1 min-w-[100px]"
                      value={balanceEditForm.note}
                      onChange={(e) => setBalanceEditForm((p) => ({ ...p, note: e.target.value }))}
                    />
                    <button type="submit" disabled={savingBalanceEdit} className="btn-ghost text-[11px] disabled:opacity-40">
                      {savingBalanceEdit ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-[11px] text-[var(--fg-3)]"
                      onClick={() => setEditingBalanceId(null)}
                      disabled={savingBalanceEdit}
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {fmtDateLong(b.recordedAt)}
                      {b.note && <span className="text-[var(--fg-3)]"> — {b.note}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="mono">{fmtNumber(b.balance)}</span>
                      <button
                        onClick={() => { setBalanceEditForm({ balance: String(b.balance), recordedAt: b.recordedAt.slice(0, 10), note: b.note }); setEditingBalanceId(b.id); }}
                        className="hover:text-[var(--fg-1)] transition-colors"
                        aria-label="Edit reading"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDeleteReading(b.id)}
                        className="hover:text-red-500 transition-colors"
                        aria-label="Delete reading"
                      >
                        ✕
                      </button>
                    </span>
                  </div>
                )}
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
            <button type="submit" disabled={savingReading} className="btn-ghost text-[12px] disabled:opacity-40">
              {savingReading ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-ghost text-[12px] text-[var(--fg-3)]"
              onClick={() => setAddingReading(false)}
              disabled={savingReading}
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
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/points-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), unit: form.unit.trim() || 'Avios', note: form.note }),
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

  if (loading) {
    return <div className="dash-card h-[200px] animate-pulse bg-[var(--surface-2)]" />;
  }

  const hasAvios = goals.some((g) => g.unit === 'Avios');

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
            <label className="flex flex-col gap-[4px] col-span-2">
              <span className="text-[11px] text-[var(--fg-2)]">Note (optional)</span>
              <input
                className="date-input"
                value={form.note}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
              />
            </label>
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

      {hasAvios && <AviosExplainer />}
    </div>
  );
}
