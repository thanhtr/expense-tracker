'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import { fmtEUR } from '@/lib/utils';
import { FIRE_DEFAULTS, type FireConfig, type FireCalculationResult, type BaristaVariant, type PhaseInfo } from '@/lib/services/fire-service';
import { AssetManager } from '@/components/AssetManager';

type FireApiResponse = FireCalculationResult & { config: FireConfig };

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `€${Math.round(n / 1_000)}k`;
  return `€${Math.round(Math.abs(n))}`;
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

// ── Model explainer ───────────────────────────────────────────────────────────

function ModelExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <div className="dash-card overflow-hidden text-[13px]">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-[12px] text-[13px] font-semibold hover:bg-[var(--surface-2)] transition-colors"
      >
        <span>How this model works</span>
        <span className="text-[var(--fg-3)] text-[11px]">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--border)] px-5 py-4 space-y-5 leading-relaxed text-[var(--fg-2)]">

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Finnish Pension Bridge model</h3>
            <p>
              Standard FIRE uses the US 4% rule — a simple fixed withdrawal rate calibrated for a 30-year
              retirement. That model ignores taxes, changing spending, and the Finnish TyEL pension. This
              tracker uses a multi-phase cash-flow simulation instead: it finds the exact portfolio needed at
              retirement by simulating every month of drawdown from retirement to the 95-year planning horizon.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Three spending phases</h3>
            <p>Post-retirement spending is split into three distinct phases:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium">Phase 1A</span> — Retirement → Mortgage end. Highest spend: mortgage still running, active lifestyle, no pension yet.</li>
              <li><span className="font-medium">Phase 1B</span> — Mortgage end → TyEL pension age. Mortgage cleared, spend drops, still fully portfolio-funded.</li>
              <li><span className="font-medium">Phase 2</span> — Pension age → plan end. TyEL pension income offsets withdrawals; portfolio draw-down shrinks significantly.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Calculating the FIRE number</h3>
            <p>
              The FIRE number is the portfolio value needed at retirement so that — growing at the drawdown
              real return and paying out the phased net spending — it reaches exactly €0 at age 95. It is found
              by binary search: the model tries a starting portfolio, simulates all monthly
              withdrawals from retirement to age 95, and adjusts up or down until the end balance converges to zero (60 iterations,
              accurate to within a few euros).
            </p>
            <p className="text-[var(--fg-3)] font-mono text-[11px] bg-[var(--surface-2)] px-3 py-2 rounded">
              repeat 60×: mid = (lo + hi) / 2 → simulate → end &gt; 0 ? hi = mid : lo = mid
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Gross withdrawal and capital gains tax</h3>
            <p>
              Every portfolio withdrawal incurs Finnish capital gains tax. Because you cannot withdraw net
              spending directly — you must sell more shares to cover the tax — the model gross-ups each
              withdrawal:
            </p>
            <p className="text-[var(--fg-3)] font-mono text-[11px] bg-[var(--surface-2)] px-3 py-2 rounded">
              Gross/mo = Net/mo ÷ (1 − tax rate)
            </p>
            <p>
              With the default 20% effective rate (hankintameno-olettama): €4 500 net → €5 625 gross. The
              20% is an effective blended rate: Finnish law allows 20% of sale proceeds to be treated as
              acquisition cost on assets held over 10 years, reducing the taxable gain.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Real returns and inflation</h3>
            <p>
              All returns in this model are <span className="font-medium">real</span> (after inflation). This
              means the spending targets you enter are in today&apos;s euros — no separate inflation adjustment
              is needed. A nominal equity return of ~7% with 2–3% inflation gives a ~4–5% real return during
              accumulation; a conservative 3–4% real is used during drawdown to account for
              sequence-of-returns risk.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Barista FIRE variants</h3>
            <p>
              Barista FIRE means retiring from your main career but doing light part-time work during the
              early retirement years (Phase 1A). That income directly offsets portfolio withdrawals, shrinking
              the required FIRE number. Three scenarios are compared:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium">Pure FIRE</span> — zero active income; portfolio funds everything.</li>
              <li><span className="font-medium">Barista 33%</span> — part-time income covers 33% of Phase 1A monthly spend.</li>
              <li><span className="font-medium">Barista 50%</span> — part-time income covers 50% of Phase 1A monthly spend.</li>
            </ul>
            <p>
              Active income only applies during Phase 1A. From Phase 1B onward all scenarios are identical
              (no active income assumed).
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Accumulation projection</h3>
            <p>
              The chart&apos;s growth curve before the retirement-age line is the accumulation phase: starting
              from the current portfolio, adding the monthly contribution every month, compounding at the
              accumulation real return. The model checks each month whether the portfolio has reached the FIRE
              number — the first month it does is the <span className="font-medium">Years to FIRE</span> figure.
            </p>
            <p className="text-[var(--fg-3)] font-mono text-[11px] bg-[var(--surface-2)] px-3 py-2 rounded">
              portfolio = portfolio × (1 + monthly rate) + monthly contribution
            </p>
          </section>

        </div>
      )}
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

// ── Info tooltip ──────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex items-center ml-[5px] align-middle">
      <span className="cursor-help text-[var(--fg-3)] text-[9px] border border-[var(--fg-3)] rounded-full w-[13px] h-[13px] inline-flex items-center justify-center leading-none select-none">?</span>
      <span className="absolute bottom-full right-0 mb-[6px] w-[230px] p-[7px_9px] rounded bg-[var(--surface)] border border-[var(--border)] text-[11px] text-[var(--fg-2)] shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 leading-relaxed">
        {text}
      </span>
    </span>
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
            <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)]">
              Plan-end balance
              <InfoTip text="Portfolio balance at the end of the 95-year planning horizon. Positive = surplus; negative = depleted before plan end." />
            </th>
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

interface ConfigField { key: keyof FireConfig; label: string; min: number; max: number; step: number; pct?: boolean; tip?: string }

const CONFIG_FIELDS: { group: string; fields: ConfigField[] }[] = [
  {
    group: 'Age milestones',
    fields: [
      { key: 'currentAge', label: 'Current age', min: 18, max: 80, step: 1 },
      { key: 'retirementAge', label: 'Target retirement age', min: 30, max: 90, step: 1 },
      { key: 'mortgageEndAge', label: 'Mortgage end age', min: 30, max: 90, step: 1,
        tip: 'Age when your mortgage is fully paid off. Phase 1A ends here and monthly spend drops.' },
      { key: 'pensionAge', label: 'TyEL pension age', min: 55, max: 75, step: 1,
        tip: 'Age you start drawing your Finnish earnings-related pension (TyEL). Currently 65 for most. Check your forecast at tyoelake.fi.' },
    ],
  },
  {
    group: 'Investment assumptions',
    fields: [
      { key: 'monthlyContribution', label: 'Monthly contribution (€)', min: 0, max: 20000, step: 100 },
      { key: 'accumulationReturn', label: 'Accumulation real return', min: 0, max: 20, step: 0.1, pct: true,
        tip: "After-inflation annual portfolio return during the savings phase. A global equity index historically returns ~7% nominal; subtract ~2% inflation ≈ 5–6% real. Using real returns means spending targets stay in today's euros." },
      { key: 'drawdownReturn', label: 'Drawdown real return', min: 0, max: 15, step: 0.1, pct: true,
        tip: 'After-inflation return applied during retirement. Set lower than the accumulation return to account for sequence-of-returns risk — a bad market early in retirement hurts disproportionately. Typical conservative estimate: 3–4%.' },
      { key: 'capitalGainsTaxRate', label: 'Capital gains tax rate', min: 0, max: 50, step: 0.5, pct: true,
        tip: 'Finnish hankintameno-olettama: for assets held 10+ years, 20% of sale proceeds are treated as acquisition cost before tax. Effective rate = 30% × (1 − 20%) = 24% on gains, but this model uses 20% as a blended effective rate on gross withdrawals.' },
    ],
  },
  {
    group: 'Spending phases',
    fields: [
      { key: 'phase1aNetMonthly', label: 'Phase 1A net/mo — retire → mortgage end (€)', min: 0, max: 20000, step: 100 },
      { key: 'phase1bNetMonthly', label: 'Phase 1B net/mo — mortgage end → pension (€)', min: 0, max: 15000, step: 100 },
      { key: 'phase2NetMonthly', label: 'Phase 2 net/mo — pension age onward (€)', min: 0, max: 15000, step: 100 },
      { key: 'pensionNetMonthly', label: 'TyEL pension net/mo (€)', min: 0, max: 10000, step: 50,
        tip: 'Your estimated combined TyEL net monthly pension income. This offsets portfolio withdrawals in Phase 2. Check your personalised forecast at tyoelake.fi.' },
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
    onSave(FIRE_DEFAULTS);
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
                    <span className="text-[11px] text-[var(--fg-2)]">{f.label}{f.tip && <InfoTip text={f.tip} />}</span>
                    <input
                      type="number"
                      className="date-input text-right"
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      value={getVal(f.key, f.pct)}
                      onChange={e => {
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v)) set(f.key, v);
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
        <KPI
          label="Current Portfolio"
          value={fmt(currentPortfolio)}
          sub={currentPortfolio === 0 ? 'add investment assets below' : 'investment assets'}
        />
        <ProgressBar pct={data.progressPct} />
        <KPI
          label="Years to FIRE"
          value={yearsLabel}
          sub={retireAgeLabel}
          accent={yearsToFire !== null && yearsToFire <= 0}
        />
      </div>

      {/* Model explainer */}
      <ModelExplainer />

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

      {/* Investment assets */}
      <div>
        <div className="text-[13px] font-semibold mb-3">Investment Assets</div>
        <AssetManager onMutate={load} />
      </div>
    </div>
  );
}
