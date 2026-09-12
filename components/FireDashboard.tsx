'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import Link from 'next/link';
import { fmtEUR } from '@/lib/utils';
import { FIRE_DEFAULTS, computeCurrentAge, simulateProjection, computeYearsToFire, type FireConfig, type FireCalculationResult, type BaristaVariant, type PhaseInfo } from '@/lib/services/fire-service';

type FireApiResponse = FireCalculationResult & { config: FireConfig };

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `€${Math.round(n / 1_000)}k`;
  return `€${Math.round(Math.abs(n))}`;
}

function pctFmt(n: number): string {
  return `${Math.min(100, n).toFixed(1)}%`;
}

function KPI({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="dash-card p-[14px_18px_12px] flex flex-col gap-[2px]">
      <div className="tool-label text-[var(--fg-3)]">{label}</div>
      <div className={`mono text-[22px] font-semibold leading-tight ${accent ? 'text-[var(--accent)]' : ''}`}>{value}</div>
      {sub && <div className="text-[11px] text-[var(--fg-3)]">{sub}</div>}
    </div>
  );
}

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
              Every portfolio withdrawal incurs Finnish capital income tax (pääomatulovero) on the gain
              portion of the sale. Because you cannot withdraw net spending directly — you must sell more
              shares to cover the tax — the model gross-ups each withdrawal in two steps.
            </p>
            <p>
              First, the <span className="font-medium">hankintameno-olettama</span> deemed acquisition cost
              shields a fraction of the sale from tax regardless of actual cost basis — 20% for any holding
              period, 40% only after 10+ years. With no per-lot holding-period data, this model assumes the
              worst case throughout: 20%, never 40%. Second, the remaining taxable gain is taxed at Finland&apos;s
              actual progressive capital-income rate: 30% up to €30,000 of taxable gain per year, 34% above
              it — assuming a single taxpayer, with no benefit taken from splitting withdrawals across a
              spouse&apos;s separate threshold.
            </p>
            <p className="text-[var(--fg-3)] font-mono text-[11px] bg-[var(--surface-2)] px-3 py-2 rounded whitespace-pre-wrap">
{`taxable = gross × (1 − deemed cost %)
tax     = 30% × min(taxable, €30k) + 34% × max(0, taxable − €30k)
net     = gross − tax   (solved for gross, annually, then ÷ 12)`}
            </p>
            <p>
              With the defaults (20% deemed cost): a €4,500/mo net Phase 1A spend needs about
              €6,044/mo gross — not €5,625/mo as a flat-20%-tax shortcut would suggest, because
              €54,000/yr of net spend pushes most of the taxable gain into the 34% bracket.
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
            <p className="text-[var(--fg-3)]">
              <span className="font-medium">Known limitation:</span> every year is assumed to return exactly
              this rate — there is no volatility. Using a lower average return during drawdown widens the
              margin on average, but it is not the same as protecting against an actually bad sequence (e.g.
              a market crash in the first few retirement years), which this deterministic model cannot
              represent. The FIRE number is also solved to reach exactly €0 at the life-expectancy age, with
              no residual buffer for living longer, a worse-than-assumed market, or unplanned costs (e.g.
              long-term care) — treat it as a floor, not a comfortable target.
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


const EXTRA_COLOR = 'oklch(0.62 0.18 35)';

function ProjectionChart({ data, fireTarget, currentAge, currentPortfolio, retirementAge, extraInvestment, onExtraChange }: {
  data: FireApiResponse;
  fireTarget: number;
  currentAge: number;
  currentPortfolio: number;
  retirementAge: number;
  extraInvestment: number;
  onExtraChange: (v: number) => void;
}) {
  const { chartData, extraFireAge, yearsSaved } = useMemo(() => {
    const ageSet = new Set<number>();
    data.pureFire.projection.forEach(p => ageSet.add(p.age));
    data.barista33.projection.forEach(p => ageSet.add(p.age));
    data.barista50.projection.forEach(p => ageSet.add(p.age));

    let extraProjection: { age: number; portfolio: number }[] = [];
    let extraFireAge: number | null = null;
    let extraFireAgeRounded: number | null = null;
    let yearsSaved: number | null = null;
    if (extraInvestment > 0) {
      extraProjection = simulateProjection(data.config, currentPortfolio + extraInvestment)
        .filter(p => p.age <= retirementAge);
      extraProjection.forEach(p => ageSet.add(p.age));

      const yearsToFire = computeYearsToFire(data.config, currentPortfolio + extraInvestment, fireTarget);
      if (yearsToFire !== null) {
        extraFireAge = Math.round((currentAge + yearsToFire) * 10) / 10;
        extraFireAgeRounded = Math.round(extraFireAge);
        // Ensure the marker's x lands on an age that's actually a category on the chart
        ageSet.add(extraFireAgeRounded);
        const baseYears = data.pureFire.yearsToFire;
        yearsSaved = baseYears !== null ? baseYears - yearsToFire : null;
      }
    }

    const extraMap = new Map(extraProjection.map(p => [p.age, p.portfolio]));

    const points = Array.from(ageSet).sort((a, b) => a - b).map(age => ({
      age,
      pure: data.pureFire.projection.find(p => p.age === age)?.portfolio ?? null,
      barista33: data.barista33.projection.find(p => p.age === age)?.portfolio ?? null,
      barista50: data.barista50.projection.find(p => p.age === age)?.portfolio ?? null,
      withExtra: extraMap.has(age) ? (extraMap.get(age) ?? null) : null,
    }));

    return { chartData: points, extraFireAge, yearsSaved };
  }, [data, extraInvestment, currentPortfolio, retirementAge, fireTarget, currentAge]);

  const tooltipStyle = {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
  };

  return (
    <div className="dash-card p-[16px_20px_14px]">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <div className="text-[13px] font-semibold">Portfolio Projection</div>
        <div className="flex items-center gap-2">
          <label htmlFor="extra-investment" className="text-[11px] text-[var(--fg-3)] whitespace-nowrap">Extra investment</label>
          <div className="flex items-center border border-[var(--border)] rounded px-2 py-[3px] bg-[var(--surface-2)] gap-1">
            <span className="text-[11px] text-[var(--fg-3)]">€</span>
            <input
              id="extra-investment"
              type="number"
              min={0}
              step={1000}
              value={extraInvestment || ''}
              placeholder="0"
              onChange={e => {
                const v = parseFloat(e.target.value);
                onExtraChange(isNaN(v) || v < 0 ? 0 : v);
              }}
              className="w-[90px] bg-transparent text-[12px] mono outline-none"
            />
          </div>
          {yearsSaved !== null && yearsSaved > 0.05 && (
            <span className="text-[11px] font-medium px-2 py-[2px] rounded-full" style={{ background: `${EXTRA_COLOR}22`, color: EXTRA_COLOR }}>
              −{yearsSaved.toFixed(1)} yr earlier
            </span>
          )}
        </div>
      </div>
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
              name === 'pure' ? 'Pure FIRE' : name === 'barista33' ? 'Barista 33%' : name === 'barista50' ? 'Barista 50%' : `+ €${fmt(extraInvestment)} now`,
            ]}
            labelFormatter={label => `Age ${label}`}
          />
          <Legend
            formatter={v => v === 'pure' ? 'Pure FIRE' : v === 'barista33' ? 'Barista 33%' : v === 'barista50' ? 'Barista 50%' : `+ €${fmt(extraInvestment)} now`}
            wrapperStyle={{ fontSize: 12 }}
          />
          <ReferenceLine
            y={fireTarget}
            stroke="oklch(0.75 0.15 75)"
            strokeDasharray="5 3"
            label={{ value: 'FIRE target', position: 'insideTopRight', fontSize: 10, fill: 'oklch(0.75 0.15 75)' }}
          />
          <ReferenceLine
            x={retirementAge}
            stroke="var(--fg-3)"
            strokeDasharray="3 3"
            label={{ value: `Retire ${retirementAge}`, position: 'insideTopLeft', fontSize: 10, fill: 'var(--fg-3)' }}
          />
          <ReferenceDot
            x={currentAge}
            y={currentPortfolio}
            r={5}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={2}
            label={{ value: 'Now', position: 'top', fontSize: 10, fill: 'var(--accent)' }}
          />
          {extraFireAge !== null && (
            <ReferenceDot
              x={Math.round(extraFireAge)}
              y={fireTarget}
              r={5}
              fill={EXTRA_COLOR}
              stroke="var(--surface)"
              strokeWidth={2}
              label={{ value: `FIRE ${extraFireAge.toFixed(1)}`, position: 'bottom', fontSize: 10, fill: EXTRA_COLOR }}
            />
          )}
          <Line type="monotone" dataKey="pure" stroke="oklch(0.55 0.10 225)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="barista33" stroke="oklch(0.60 0.09 155)" strokeWidth={2} strokeDasharray="6 2" dot={false} />
          <Line type="monotone" dataKey="barista50" stroke="oklch(0.66 0.06 200)" strokeWidth={2} strokeDasharray="2 3" dot={false} />
          {extraInvestment > 0 && (
            <Line type="monotone" dataKey="withExtra" stroke={EXTRA_COLOR} strokeWidth={2.5} strokeDasharray="4 2" dot={false} connectNulls={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function PhaseCards({ phases }: { phases: PhaseInfo[] }) {
  const colors = ['var(--accent)', 'oklch(0.60 0.09 155)', 'oklch(0.55 0.10 225)'];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

function InfoTip({ text, align = 'left' }: { text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const pos = align === 'right' ? 'right-0' : 'left-0';
  return (
    <span className="relative inline-flex items-center ml-[5px] align-middle">
      <button
        type="button"
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="cursor-pointer text-[var(--fg-3)] text-[9px] border border-[var(--fg-3)] rounded-full w-[13px] h-[13px] inline-flex items-center justify-center leading-none select-none"
        aria-label="More information"
      >?</button>
      {open && (
        <>
          <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={() => setOpen(false)} />
          <span className={`absolute bottom-full ${pos} mb-[6px] w-[230px] p-[7px_9px] rounded bg-[var(--surface)] border border-[var(--border)] text-[11px] text-[var(--fg-2)] shadow-lg z-20 leading-relaxed`}>
            {text}
          </span>
        </>
      )}
    </span>
  );
}

function BaristaTable({ variants }: { variants: BaristaVariant[] }) {
  return (
    <div className="dash-card overflow-hidden">
      <div className="p-[14px_20px_10px] border-b border-[var(--border)] text-[13px] font-semibold">Scenario Comparison</div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="text-left px-5 py-[8px] font-medium text-[var(--fg-3)] whitespace-nowrap">Scenario</th>
              <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)] whitespace-nowrap">Active income</th>
              <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)] whitespace-nowrap">FIRE target</th>
              <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)] whitespace-nowrap">Retire age</th>
              <th className="text-right px-5 py-[8px] font-medium text-[var(--fg-3)] whitespace-nowrap">
                Plan-end balance
                <InfoTip text="Portfolio balance at the end of the 95-year planning horizon. Positive = surplus; negative = depleted before plan end." align="right" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {variants.map(v => (
              <tr key={v.label} className="hover:bg-[var(--surface-2)]">
                <td className="px-5 py-[9px] font-medium whitespace-nowrap">{v.label}</td>
                <td className="px-5 py-[9px] text-right mono text-[var(--fg-2)] whitespace-nowrap">
                  {v.activeIncomeMonthly > 0 ? `+${fmtEUR(Math.round(v.activeIncomeMonthly))}/mo` : '—'}
                </td>
                <td className="px-5 py-[9px] text-right mono whitespace-nowrap">{fmt(v.fireTarget)}</td>
                <td className="px-5 py-[9px] text-right mono whitespace-nowrap">
                  {v.projectedRetirementAge !== null ? v.projectedRetirementAge.toFixed(1) : '> target'}
                </td>
                <td className={`px-5 py-[9px] text-right mono font-medium whitespace-nowrap ${v.portfolioAtDeath < 0 ? 'text-[var(--neg)]' : 'text-[var(--pos)]'}`}>
                  {v.portfolioAtDeath < 0 ? `−${fmt(Math.abs(v.portfolioAtDeath))}` : fmt(v.portfolioAtDeath)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Config panel ─────────────────────────────────────────────────────────────

interface ConfigField { key: keyof FireConfig; label: string; min: number; max: number; step: number; pct?: boolean; tip?: string }

const CONFIG_FIELDS: { group: string; fields: ConfigField[] }[] = [
  {
    group: 'Age milestones',
    fields: [
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
      { key: 'deemedCostPct', label: 'Deemed acquisition cost %', min: 0, max: 40, step: 0.5, pct: true,
        tip: 'Finnish hankintameno-olettama: this fraction of each sale is treated as acquisition cost (untaxed) regardless of actual cost basis. 20% applies to any holding period; 40% only after 10+ years — this model conservatively assumes 20% throughout, since no per-lot holding period is tracked. The remaining gain is taxed at Finland’s actual capital-income rate (30% up to €30,000/yr, 34% above) — see the model explainer above for the combined formula.' },
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
          <div>
            <div className="tool-label text-[var(--fg-3)] mb-3">Your age</div>
            <label className="flex flex-col gap-[4px] max-w-[200px]">
              <span className="text-[11px] text-[var(--fg-2)]">
                Date of birth
                <InfoTip text="Used to compute your exact current age, including partial years. More accurate than an integer age — e.g. born May 1990, currently August 2026 → age 36.24, not 36." />
              </span>
              <input
                type="date"
                className="date-input"
                value={(draft.dateOfBirth ?? config.dateOfBirth ?? '').slice(0, 10)}
                onChange={e => setDraft(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              />
            </label>
          </div>
          {CONFIG_FIELDS.map(group => (
            <div key={group.group}>
              <div className="tool-label text-[var(--fg-3)] mb-3">{group.group}</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {group.fields.map((f, fi) => (
                  <label key={f.key} className="flex flex-col gap-[4px]">
                    <span className="text-[11px] text-[var(--fg-2)]">{f.label}{f.tip && <InfoTip text={f.tip} align={fi % 2 === 1 ? 'right' : 'left'} />}</span>
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

export function FireDashboard() {
  const [data, setData] = useState<FireApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extraInvestment, setExtraInvestment] = useState(0);
  const currentAge = useMemo(
    () => data ? computeCurrentAge(data.config.dateOfBirth) : 0,
    [data?.config.dateOfBirth],
  );

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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

      <ModelExplainer />
      <ProjectionChart
        data={data}
        fireTarget={fireTarget}
        currentAge={currentAge}
        currentPortfolio={currentPortfolio}
        retirementAge={config.retirementAge}
        extraInvestment={extraInvestment}
        onExtraChange={setExtraInvestment}
      />

      <PhaseCards phases={phases} />
      <BaristaTable variants={[pureFire, barista33, barista50]} />
      <ConfigPanel config={config} onSave={handleSave} saving={saving} />
      <div className="text-right">
        <Link href="/settings?tab=assets" className="text-[12px] text-[var(--fg-3)] hover:text-[var(--fg-2)]">
          Manage assets in Settings →
        </Link>
      </div>
    </div>
  );
}
