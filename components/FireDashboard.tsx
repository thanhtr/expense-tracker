'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import { fmtEUR } from '@/lib/utils';
import type { FireConfig, FireCalculationResult, BaristaVariant, PhaseInfo } from '@/lib/services/fire-service';

type FireApiResponse = FireCalculationResult & { config: FireConfig };

const DEFAULTS: FireConfig = {
  currentAge: 36, retirementAge: 50, mortgageEndAge: 60,
  pensionAge: 65, lifeExpectancy: 95,
  monthlyContribution: 3000,
  accumulationReturn: 0.06, drawdownReturn: 0.04,
  capitalGainsTaxRate: 0.20,
  phase1aNetMonthly: 4500, phase1bNetMonthly: 3000,
  phase2NetMonthly: 3000, pensionNetMonthly: 1580,
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `€${Math.round(n / 1_000)}k`;
  return fmtEUR(n);
}

function pctFmt(n: number): string {
  return `${Math.min(100, n).toFixed(1)}%`;
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KPI({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="dash-card p-[14px_18px_12px] flex flex-col gap-[2px]">
      <div className="tool-label text-[var(--fg-3)]">{label}</div>
      <div className={`mono text-[22px] font-semibold leading-tight ${accent ? 'text-[var(--accent)]' : ''}`}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--fg-3)]">{sub}</div>}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = clamped >= 100 ? 'var(--pos)' : clamped >= 70 ? 'oklch(0.75 0.15 75)' : 'var(--accent)';
  return (
    <div className="dash-card p-[14px_18px_12px] flex flex-col gap-[6px]">
      <div className="tool-label text-[var(--fg-3)]">FIRE Progress</div>
      <div className="flex items-end gap-2">
        <div className="mono text-[22px] font-semibold leading-tight" style={{ color }}>{pctFmt(pct)}</div>
        <div className="text-[11px] text-[var(--fg-3)] mb-[4px]">of FIRE number</div>
      </div>
      <div className="h-[6px] rounded-full bg-[var(--surface-2)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${clamped}%`, background: color }} />
      </div>
    </div>
  );
}

// ── Projection chart ──────────────────────────────────────────────────────────

type ChartPoint = { age: number; pure?: number | null; barista33?: number | null; barista50?: number | null };

function ProjectionChart({ data, fireTarget, currentAge, currentPortfolio, retirementAge }: {
  data: FireApiResponse;
  fireTarget: number;
  currentAge: number;
  currentPortfolio: number;
  retirementAge: number;
}) {
  const chartData: ChartPoint[] = useMemo(() => {
    const ageSet = new Set<number>();
    data.pureFire.projection.forEach(p => ageSet.add(p.age));
    data.barista33.projection.forEach(p => ageSet.add(p.age));
    data.barista50.projection.forEach(p => ageSet.add(p.age));

    return Array.from(ageSet).sort((a, b) => a - b).map(age => ({
      age,
      pure: data.pureFire.projection.find(p => p.age === age)?.portfolio ?? null,
      barista33: data.barista33.projection.find(p => p.age === age)?.portfolio ?? null,
      barista50: data.barista50.projection.find(p => p.age === age)?.portfolio ?? null,
    }));
  }, [data]);

  const tooltipStyle = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
  };

  return (
    <div className="dash-card p-[16px_20px_14px]">
      <div className="text-[13px] font-semibold mb-4">Portfolio Projection</div>
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="age" tick={{ fontSize: 11 }} label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 11 }} />
          <YAxis
            tickFormatter={v => fmt(Number(v))}
            tick={{ fontSize: 11 }}
            width={60}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [
              typeof value === 'number' && value < 0 ? `−${fmt(Math.abs(value))}` : fmt(Number(value ?? 0)),
              name === 'pure' ? 'Pure FIRE' : name === 'barista33' ? 'Barista 33%' : 'Barista 50%',
            ]}
            labelFormatter={label => `Age ${label}`}
          />
          <Legend
            formatter={v => v === 'pure' ? 'Pure FIRE' : v === 'barista33' ? 'Barista 33%' : 'Barista 50%'}
            wrapperStyle={{ fontSize: 12 }}
          />
          {/* FIRE target line */}
          <ReferenceLine
            y={fireTarget}
            stroke="oklch(0.75 0.15 75)"
            strokeDasharray="5 3"
            label={{ value: 'FIRE target', position: 'insideTopRight', fontSize: 10, fill: 'oklch(0.75 0.15 75)' }}
          />
          {/* Retirement age line */}
          <ReferenceLine
            x={retirementAge}
            stroke="var(--fg-3)"
            strokeDasharray="3 3"
            label={{ value: `Retire ${retirementAge}`, position: 'insideTopLeft', fontSize: 10, fill: 'var(--fg-3)' }}
          />
          {/* You are here */}
          <ReferenceDot
            x={currentAge}
            y={currentPortfolio}
            r={5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
            label={{ value: 'Now', position: 'top', fontSize: 10, fill: 'var(--accent)' }}
          />
          <Line type="monotone" dataKey="pure" stroke="oklch(0.55 0.10 225)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="barista33" stroke="oklch(0.60 0.09 155)" strokeWidth={2} strokeDasharray="6 2" dot={false} />
          <Line type="monotone" dataKey="barista50" stroke="oklch(0.66 0.06 200)" strokeWidth={2} strokeDasharray="2 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Phase cards ───────────────────────────────────────────────────────────────

function PhaseCards({ phases }: { phases: PhaseInfo[] }) {
  const colors = ['var(--accent)', 'oklch(0.60 0.09 155)', 'oklch(0.55 0.10 225)'];
  return (
    <div className="grid grid-cols-3 gap-3">
      {phases.map((p, i) => (
        <div key={p.label} className="dash-card p-[14px_18px]">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-[3px] h-[18px] rounded-full" style={{ background: colors[i] }} />
            <div className="text-[13px] font-semibold">{p.label}</div>
          </div>
          <div className="text-[11px] text-[var(--fg-3)] mb-3">Ages {p.ageFrom}–{p.ageTo} · {p.durationYears}y</div>
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-[var(--border)]">
              <tr>
                <td className="py-[4px] text-[var(--fg-3)]">Net/mo</td>
                <td className="py-[4px] text-right mono font-medium">{fmtEUR(p.netMonthly)}</td>
              </tr>
              {p.pensionOffset > 0 && (
                <tr>
                  <td className="py-[4px] text-[var(--fg-3)]">Pension offset</td>
                  <td className="py-[4px] text-right mono text-[var(--pos)]">−{fmtEUR(p.pensionOffset)}</td>
                </tr>
              )}
              <tr>
                <td className="py-[4px] text-[var(--fg-3)]">Portfolio/mo</td>
                <td className="py-[4px] text-right mono">{fmtEUR(p.portfolioShortfall)}</td>
              </tr>
              <tr>
                <td className="py-[4px] text-[var(--fg-3)]">Gross/mo</td>
                <td className="py-[4px] text-right mono font-semibold">{fmtEUR(p.grossWithdrawal)}</td>
              </tr>
              <tr>
                <td className="py-[4px] text-[var(--fg-3)]">Gross/yr</td>
                <td className="py-[4px] text-right mono">{fmtEUR(p.grossAnnual)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ── Barista comparison table ──────────────────────────────────────────────────

function BaristaTable({ variants }: { variants: BaristaVariant[] }) {
  return (
    <div className="dash-card overflow-hidden">
      <div className="p-[14px_20px_10px] border-b border-[var(--border)] text-[13px] font-semibold">Scenario Comparison</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th className="text-left px-5 py-[8px] font-medium text-[var(--fg-3)]">Scenario</th>
            <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)]">Active income</th>
            <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)]">FIRE target</th>
            <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)]">Retire age</th>
            <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)]">Portfolio at 95</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {variants.map(v => (
            <tr key={v.label} className="hover:bg-[var(--surface-2)]">
              <td className="px-5 py-[9px] font-medium">{v.label}</td>
              <td className="px-5 py-[9px] text-right mono text-[var(--fg-2)]">
                {v.activeIncomeMonthly > 0 ? `+${fmtEUR(Math.round(v.activeIncomeMonthly))}/mo` : '—'}
              </td>
              <td className="px-5 py-[9px] text-right mono">{fmt(v.fireTarget)}</td>
              <td className="px-5 py-[9px] text-right mono">
                {v.projectedRetirementAge !== null ? v.projectedRetirementAge.toFixed(1) : '> target'}
              </td>
              <td className={`px-5 py-[9px] text-right mono font-medium ${v.portfolioAtDeath < 0 ? 'text-[var(--neg)]' : 'text-[var(--pos)]'}`}>
                {v.portfolioAtDeath < 0 ? `−${fmt(Math.abs(v.portfolioAtDeath))}` : fmt(v.portfolioAtDeath)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Config panel ─────────────────────────────────────────────────────────────

interface ConfigField { key: keyof FireConfig; label: string; min: number; max: number; step: number; pct?: boolean }

const CONFIG_FIELDS: { group: string; fields: ConfigField[] }[] = [
  {
    group: 'Age milestones',
    fields: [
      { key: 'currentAge', label: 'Current age', min: 18, max: 80, step: 1 },
      { key: 'retirementAge', label: 'Target retirement age', min: 30, max: 90, step: 1 },
      { key: 'mortgageEndAge', label: 'Mortgage end age', min: 30, max: 90, step: 1 },
      { key: 'pensionAge', label: 'TyEL pension age', min: 55, max: 75, step: 1 },
      { key: 'lifeExpectancy', label: 'Life expectancy', min: 70, max: 110, step: 1 },
    ],
  },
  {
    group: 'Investment assumptions',
    fields: [
      { key: 'monthlyContribution', label: 'Monthly contribution (€)', min: 0, max: 20000, step: 100 },
      { key: 'accumulationReturn', label: 'Accumulation real return', min: 0, max: 20, step: 0.1, pct: true },
      { key: 'drawdownReturn', label: 'Drawdown real return', min: 0, max: 15, step: 0.1, pct: true },
      { key: 'capitalGainsTaxRate', label: 'Capital gains tax rate (hankintameno-olettama)', min: 0, max: 50, step: 0.5, pct: true },
    ],
  },
  {
    group: 'Spending phases',
    fields: [
      { key: 'phase1aNetMonthly', label: 'Phase 1A net/mo — ages retire→mortgage end (€)', min: 0, max: 20000, step: 100 },
      { key: 'phase1bNetMonthly', label: 'Phase 1B net/mo — ages mortgage end→pension (€)', min: 0, max: 15000, step: 100 },
      { key: 'phase2NetMonthly', label: 'Phase 2 net/mo — ages pension→end (€)', min: 0, max: 15000, step: 100 },
      { key: 'pensionNetMonthly', label: 'Combined TyEL pension net/mo (€)', min: 0, max: 10000, step: 50 },
    ],
  },
];

function ConfigPanel({ config, onSave, saving }: {
  config: FireConfig;
  onSave: (draft: Partial<FireConfig>) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<FireConfig>>({});

  function set(key: keyof FireConfig, value: number) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function getVal(key: keyof FireConfig, pct?: boolean): number {
    const raw = (draft[key] ?? config[key]) as number;
    return pct ? raw * 100 : raw;
  }

  function handleSave() {
    // Convert pct fields back from percent to decimal
    const toSave: Partial<FireConfig> = { ...draft };
    for (const group of CONFIG_FIELDS) {
      for (const f of group.fields) {
        if (f.pct && draft[f.key] !== undefined) {
          (toSave[f.key] as number) = (draft[f.key] as number) / 100;
        }
      }
    }
    onSave(toSave);
    setDraft({});
  }

  function handleReset() {
    setDraft({});
    onSave(DEFAULTS);
  }

  const hasDraft = Object.keys(draft).length > 0;

  return (
    <div className="dash-card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-[12px] text-[13px] font-semibold hover:bg-[var(--surface-2)] transition-colors"
      >
        <span>Configuration</span>
        <span className="text-[var(--fg-3)] text-[11px]">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] p-5 space-y-6">
          {CONFIG_FIELDS.map(group => (
            <div key={group.group}>
              <div className="tool-label text-[var(--fg-3)] mb-3">{group.group}</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {group.fields.map(f => (
                  <label key={f.key} className="flex flex-col gap-[4px]">
                    <span className="text-[11px] text-[var(--fg-2)]">{f.label}</span>
                    <input
                      type="number"
                      className="date-input text-right"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={getVal(f.key, f.pct)}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) set(f.key, f.pct ? v : v);
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <div className="flex gap-3 pt-2 border-t border-[var(--border)]">
            <button
              onClick={handleSave}
              disabled={saving || !hasDraft}
              className="btn-ghost disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleReset}
              disabled={saving}
              className="btn-ghost disabled:opacity-40 text-[var(--fg-3)]"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function FireDashboard() {
  const [data, setData] = useState<FireApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/fire');
      if (res.ok) setData(await res.json() as FireApiResponse);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function handleSave(draft: Partial<FireConfig>) {
    setSaving(true);
    try {
      const res = await fetch('/api/fire', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (res.ok) setData(await res.json() as FireApiResponse);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="dash-card h-[80px] animate-pulse bg-[var(--surface-2)]" />)}
        </div>
        <div className="dash-card h-[360px] animate-pulse bg-[var(--surface-2)]" />
      </div>
    );
  }

  if (!data) {
    return <div className="dash-card p-8 text-center text-[var(--fg-3)]">Failed to load FIRE data.</div>;
  }

  const { config, fireTarget, currentPortfolio, yearsToFire, projectedRetirementAge, phases, pureFire, barista33, barista50 } = data;

  const yearsLabel = yearsToFire !== null
    ? yearsToFire <= 0
      ? 'Already there 🎉'
      : `${yearsToFire.toFixed(1)} yrs`
    : '> target date';

  const retireAgeLabel = projectedRetirementAge !== null
    ? `age ${projectedRetirementAge.toFixed(1)}`
    : undefined;

  return (
    <div className="space-y-4">
      {/* Status row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="FIRE Number" value={fmt(fireTarget)} sub="at retirement age" />
        <KPI label="Current Portfolio" value={fmt(currentPortfolio)} sub="investment assets" />
        <ProgressBar pct={data.progressPct} />
        <KPI
          label="Years to FIRE"
          value={yearsLabel}
          sub={retireAgeLabel}
          accent={yearsToFire !== null && yearsToFire <= 0}
        />
      </div>

      {/* Projection chart */}
      <ProjectionChart
        data={data}
        fireTarget={fireTarget}
        currentAge={config.currentAge}
        currentPortfolio={currentPortfolio}
        retirementAge={config.retirementAge}
      />

      {/* Phase breakdown */}
      <PhaseCards phases={phases} />

      {/* Scenario comparison */}
      <BaristaTable variants={[pureFire, barista33, barista50]} />

      {/* Config panel */}
      <ConfigPanel config={config} onSave={handleSave} saving={saving} />
    </div>
  );
}
