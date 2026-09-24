'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  ResponsiveContainer, ReferenceLine, ReferenceDot,
} from 'recharts';
import Link from 'next/link';
import { fmtEUR } from '@/lib/utils';
import { FIRE_DEFAULTS, computeCurrentAge, simulateProjection, computeEarliestFire, type FireConfig, type StoredFireConfig, type FireCalculationResult, type BaristaVariant, type PhaseInfo, type PensionEstimate } from '@/lib/services/fire-service';
import type { EarningsBreakdown, RentalBreakdown } from '@/lib/services/fire-inputs-service';
import { ASSUMED_INCOME_TAX_RATE, FI_EMPLOYEE_PENSION_CONTRIBUTION, FI_EMPLOYEE_UNEMPLOYMENT_CONTRIBUTION } from '@/lib/services/fire-inputs-service';

type FireApiResponse = FireCalculationResult & {
  config: FireConfig;
  derived: { earnings: EarningsBreakdown; rental: RentalBreakdown };
  investmentTotal: number;
  bankTotal: number;
  avgMonthlyIncome: number;
  bufferTarget: number;
  investableCash: number;
};

function fmt(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `€${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `€${Math.round(n / 1_000)}k`;
  return `€${Math.round(Math.abs(n))}`;
}

function pctFmt(n: number): string {
  return `${Math.min(100, n).toFixed(1)}%`;
}

function KPI({ label, value, sub, accent, tip }: { label: string; value: string; sub?: string; accent?: boolean; tip?: string }) {
  return (
    <div className="dash-card p-[14px_18px_12px] flex flex-col gap-[2px]">
      <div className="tool-label text-[var(--fg-3)]">{label}{tip && <InfoTip text={tip} />}</div>
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

// Every statement about Finnish rules in the explainer and tooltips cites one of these.
// Only add pages that were actually read and confirmed to state the claim.
const SOURCES = {
  trinity: { label: 'Trinity study (4% rule)', url: 'https://en.wikipedia.org/wiki/Trinity_study' },
  veroShares: { label: 'vero.fi — Selling shares', url: 'https://www.vero.fi/en/individuals/property/investments/selling-shares/' },
  veroSpouses: { label: 'vero.fi — Marriage and taxation', url: 'https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/personal-details/marriage__divorce/' },
  veroRental: { label: 'vero.fi — Rental income', url: 'https://www.vero.fi/en/individuals/property/rental_income/' },
  veroPensionTax: { label: 'vero.fi — Tax rates on pay, pensions and benefits', url: 'https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/income/earned-income/tax-rates-on-pay-pensions-and-benefits/' },
  veroCalculator: { label: 'vero.fi — Tax percentage calculator', url: 'https://www.vero.fi/en/individuals/tax-cards-and-tax-returns/tax_card/tax-percentage-calculator/' },
  tyelAmount: { label: 'tyoelake.fi — Amount of earnings-related pension', url: 'https://www.tyoelake.fi/en/how-much-pension/amount-of-earnings-related-pension/' },
  tyel2026: { label: 'tyoelake.fi — Pension changes in 2026', url: 'https://www.tyoelake.fi/ajankohtaista/nain-tyoelakkeet-muuttuvat-vuonna-2026/' },
  wageCoef: { label: 'tyoelake.fi — Wage coefficient', url: 'https://www.tyoelake.fi/en/glossary/wage-coefficient/' },
  stmCoef: { label: 'STM — Life-expectancy coefficient for 2026', url: 'https://stm.fi/-/tyoelakkeiden-elinaikakerroin-vahvistettu-vuodelle-2026' },
  etkOldAge: { label: 'ETK — Old-age pension', url: 'https://www.etk.fi/en/finnish-pension-system/pensions/earnings-related-pension-benefits/old-age-pension/' },
  retirementAges: { label: 'Apu.fi — retirement ages by birth year (source: ETK)', url: 'https://www.apu.fi/artikkelit/milloin-paasen-elakkeelle-tarkista-tasta-tuoreet-ikarajat' },
  veroRentalDeductions: { label: 'vero.fi — Rental income deductions', url: 'https://www.vero.fi/en/individuals/property/rental_income/deductions/' },
  unemployment2026: { label: 'Työllisyysrahasto — 2026 unemployment insurance contributions', url: 'https://www.tyollisyysrahasto.fi/uutiset/vuoden-2026-tyottomyysvakuutusmaksut-on-vahvistettu/' },
  ecbEuribor: { label: 'ECB Data Portal — 6-month Euribor', url: 'https://data.ecb.europa.eu/data/datasets/FM/FM.M.U2.EUR.RT.MM.EURIBOR6MD_.HSTA' },
} as const;

type SourceId = keyof typeof SOURCES;

function SourceLinks({ ids }: { ids: SourceId[] }) {
  return (
    <span className="block text-[11px] text-[var(--fg-3)]">
      Sources:{' '}
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ' · '}
          <a href={SOURCES[id].url} target="_blank" rel="noopener noreferrer" className="underline hover:text-[var(--fg-2)]">
            {SOURCES[id].label}
          </a>
        </span>
      ))}
    </span>
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
            <p className="text-[var(--fg-3)]">
              Statements about Finnish tax and pension rules link to their source. Everything else describes
              this model&apos;s own logic or assumptions, which you can change in Configuration.
            </p>
            <p>
              The common FIRE rule of thumb, the 4% rule, comes from the Trinity study. That study tested a
              fixed, inflation-adjusted withdrawal against US market history over payout periods of up to 30
              years. It gives a single withdrawal rate, so it doesn&apos;t include Finnish tax, phased spending or
              the TyEL pension. This tracker uses a multi-phase cash-flow simulation instead: it finds the
              portfolio needed at retirement by simulating every month of drawdown to the 95-year planning
              horizon.
            </p>
            <SourceLinks ids={['trinity']} />
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Three spending phases</h3>
            <p>Post-retirement spending is split into three distinct phases:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><span className="font-medium">Phase 1A</span> — Retirement → Mortgage end. Highest spend: mortgage still running, active lifestyle, no pension yet.</li>
              <li><span className="font-medium">Phase 1B</span> — Mortgage end → TyEL pension age. Mortgage cleared, spend drops, still fully portfolio-funded.</li>
              <li><span className="font-medium">Phase 2</span> — Pension age → plan end. TyEL pension income offsets withdrawals; portfolio draw-down shrinks significantly.</li>
            </ul>
            <p>
              Rent offsets withdrawals in every phase. Rental income is taxed as capital income, after deductible
              costs such as housing-company maintenance charges and the interest on a loan taken to buy the rental
              property. The model reads rent and these costs from your transactions (see Derived from your data in
              Configuration). The loan&apos;s repayments are already part of your Phase 1A spending, so only its
              interest is used, and only as a tax deduction while the loan runs (until the mortgage-end age).
            </p>
            <SourceLinks ids={['veroRental', 'veroRentalDeductions']} />
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">TyEL pension estimate</h3>
            <p>
              The pension is projected from your statement rather than taken as a fixed number. Pension accrues
              at 1.5% of gross annual earnings, so the model starts from the combined pension accrued so far and
              adds 1.5% of your combined gross earnings for each remaining year of work until the target
              retirement age. Nothing is added after you stop working.
            </p>
            <p>
              Gross earnings are derived from the net salary paid into your accounts over the last 12 months. The
              employee pension contribution (7.3%) and unemployment-insurance contribution (0.89%) are 2026 rates.
              The 30% income tax is your own flat estimate, not a sourced rate.
            </p>
            <p className="text-[var(--fg-3)] font-mono text-[11px] bg-[var(--surface-2)] px-3 py-2 rounded whitespace-pre-wrap">
{`gross earnings = net salary ÷ (1 − 30% tax − 7.3% pension − 0.89% unemployment)`}
            </p>
            <p>
              The total is multiplied by the life-expectancy coefficient. The coefficient is set for each birth
              cohort at age 62; for those born in 1964 it is 0.94643, a 5.357% cut. The 1990 cohort&apos;s coefficient
              isn&apos;t known yet, so the default 0.90 is this model&apos;s own estimate. ETK notes that working until the
              target retirement age can offset the cut, which doesn&apos;t apply when you retire early.
            </p>
            <p>
              Pensions are taxed as earned income, and the rate depends on your pension, other income and
              deductions. The pension tax % is your own estimate: use the vero.fi calculator to check it.
            </p>
            <p className="text-[var(--fg-3)] font-mono text-[11px] bg-[var(--surface-2)] px-3 py-2 rounded whitespace-pre-wrap">
{`gross = (accrued + earnings × 1.5% ÷ 12 × years to retirement) × coefficient
net   = gross × (1 − pension tax %)`}
            </p>
            <p>
              For those born 1965 or later, the lowest retirement age is tied to cohort life expectancy. The
              published estimate for the 1990 cohort is 67 years 9 months, so the default pension age is 68, not
              65. A pension taken early is permanently reduced by 0.4% for each month.
            </p>
            <p>
              Before a pension starts, accrued pension is revalued with the wage coefficient, which weights
              earnings changes at 80% and price changes at 20%. The model ignores this uplift, which makes the
              estimate conservative.
            </p>
            <SourceLinks ids={['tyelAmount', 'tyel2026', 'unemployment2026', 'stmCoef', 'etkOldAge', 'retirementAges', 'wageCoef', 'veroPensionTax', 'veroCalculator']} />
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
              The profit on each share sale is taxed as capital income. You have to sell extra shares to cover
              that tax, so the model grosses up each withdrawal in two steps.
            </p>
            <p>
              First, the <span className="font-medium">hankintameno-olettama</span> (deemed acquisition cost).
              Instead of the actual purchase price, you can deduct 20% of the sale price for shares held under
              10 years, or 40% for shares held 10+ years, whichever gives the lower taxable profit. Sales from a
              securities account must always follow FIFO (first in, first out).
            </p>
            <p>
              From these rules the model sets the deemed cost itself; it isn&apos;t a setting. In retirement you sell
              your oldest lots first. When retirement is 10+ years away, those lots have been held over 10 years, so
              40% applies and at most 60% of a sale is taxable. For a retirement age under 10 years away (including
              ages tested by the Years-to-FIRE search), early sales may include younger lots, so 20% is used.
            </p>
            <p>
              Second, the taxable part is taxed at 30% up to €30,000 a year and 34% above. Finland taxes each
              person individually, capital income included, so each spouse has their own €30,000 threshold. The
              model therefore splits withdrawals and rent across the number of taxpayers.
            </p>
            <SourceLinks ids={['veroShares', 'veroSpouses', 'veroRental']} />
            <p className="text-[var(--fg-3)] font-mono text-[11px] bg-[var(--surface-2)] px-3 py-2 rounded whitespace-pre-wrap">
{`per taxpayer:
taxable = sale × (1 − deemed cost %) + rent − rental loan interest
tax     = 30% × min(taxable, €30k) + 34% × max(0, taxable − €30k)
need    = sale + rent − tax   (solved for sale, annually, then ÷ 12)`}
            </p>
            <p>
              Example, 40% deemed cost and two taxpayers: a €4,400/mo net household spend needs about
              €5,366/mo of sales, all within the 30% bracket. As a single taxpayer it is €5,402/mo, and with a
              20% deemed cost it would be €5,907/mo.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold text-[var(--fg-1)]">Real returns and inflation</h3>
            <p>
              All returns in this model are <span className="font-medium">real</span> (after inflation), so the
              spending targets you enter are in today&apos;s euros. The default returns (6% while saving, 4% in
              retirement) are this model&apos;s assumptions, not sourced forecasts. The lower retirement figure is a
              deliberate safety margin. Set them to your own view.
            </p>
            <p className="text-[var(--fg-3)]">
              <span className="font-medium">Known limitation:</span> every year is assumed to return exactly
              this rate, with no ups and downs, so the model can&apos;t show what happens if bad years come early in
              retirement. The FIRE number is also solved to reach exactly €0 at the life-expectancy age, with
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
              accumulation real return. <span className="font-medium">Years to FIRE</span> is the first month at
              which the portfolio covers the FIRE number <em>for retiring at that age</em>. Retiring earlier
              needs a bigger pot (a longer drawdown and less pension accrued), so the target moves with the age
              being tested. It is searched up to the pension age.
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
  const { chartData, extraFireAge, extraFireTarget, yearsSaved } = useMemo(() => {
    const ageSet = new Set<number>();
    data.pureFire.projection.forEach(p => ageSet.add(p.age));
    data.barista33.projection.forEach(p => ageSet.add(p.age));
    data.barista50.projection.forEach(p => ageSet.add(p.age));

    let extraProjection: { age: number; portfolio: number }[] = [];
    let extraFireAge: number | null = null;
    let extraFireTarget: number | null = null;
    let yearsSaved: number | null = null;
    if (extraInvestment > 0) {
      const boostedConfig = { ...data.config, monthlyContribution: data.config.monthlyContribution + extraInvestment };
      const earliest = computeEarliestFire(boostedConfig, currentPortfolio);

      // Draw accumulation up to whichever is later — the planned retirement age or the
      // earliest FIRE age — so the FIRE dot sits on the plotted curve.
      const lineEndAge = Math.max(retirementAge, earliest ? Math.ceil(earliest.retirementAge) : retirementAge);
      extraProjection = simulateProjection({ ...boostedConfig, retirementAge: lineEndAge }, currentPortfolio)
        .filter(p => p.age <= lineEndAge);
      extraProjection.forEach(p => ageSet.add(p.age));

      if (earliest !== null) {
        extraFireAge = Math.round(earliest.retirementAge * 10) / 10;
        extraFireTarget = earliest.fireTarget;
        ageSet.add(Math.round(extraFireAge));
        const baseYears = data.pureFire.yearsToFire;
        yearsSaved = baseYears !== null ? baseYears - earliest.yearsToFire : null;
      }
    }

    const extraMap = new Map(extraProjection.map(p => [p.age, p.portfolio]));

    const points = Array.from(ageSet).sort((a, b) => a - b).map(age => ({
      age,
      pure: data.pureFire.projection.find(p => p.age === age)?.portfolio ?? null,
      barista33: data.barista33.projection.find(p => p.age === age)?.portfolio ?? null,
      barista50: data.barista50.projection.find(p => p.age === age)?.portfolio ?? null,
      withExtra: extraMap.get(age) ?? null,
    }));

    return { chartData: points, extraFireAge, extraFireTarget, yearsSaved };
  }, [data, extraInvestment, currentPortfolio, retirementAge]);

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
          <label htmlFor="extra-investment" className="text-[11px] text-[var(--fg-3)] whitespace-nowrap">Extra monthly</label>
          <div className="flex items-center border border-[var(--border)] rounded px-2 py-[3px] bg-[var(--surface-2)] gap-1">
            <span className="text-[11px] text-[var(--fg-3)]">€</span>
            <input
              id="extra-investment"
              type="number"
              min={0}
              step={100}
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
            <span className="text-[11px] font-medium px-2 py-[2px] rounded-full" style={{ background: 'oklch(0.62 0.18 35 / 0.13)', color: EXTRA_COLOR }}>
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
              name === 'pure' ? 'Pure FIRE' : name === 'barista33' ? 'Barista 33%' : name === 'barista50' ? 'Barista 50%' : `+ €${fmt(extraInvestment)}/mo`,
            ]}
            labelFormatter={label => `Age ${label}`}
          />
          <Legend
            formatter={v => v === 'pure' ? 'Pure FIRE' : v === 'barista33' ? 'Barista 33%' : v === 'barista50' ? 'Barista 50%' : `+ €${fmt(extraInvestment)}/mo`}
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
          {extraFireAge !== null && extraFireTarget !== null && (
            <ReferenceDot
              x={Math.round(extraFireAge)}
              y={extraFireTarget}
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

function PhaseCards({ phases, pension }: { phases: PhaseInfo[]; pension: PensionEstimate }) {
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
                <>
                  <tr>
                    <td className="py-[4px] text-[var(--fg-3)]">Pension (net)</td>
                    <td className="py-[4px] text-right mono text-[var(--pos)]">−{fmtEUR(p.pensionOffset)}</td>
                  </tr>
                  <tr>
                    <td className="py-[4px] text-[var(--fg-3)]">After pension/mo</td>
                    <td className="py-[4px] text-right mono">{fmtEUR(p.portfolioShortfall)}</td>
                  </tr>
                </>
              )}
              {p.rentalIncome > 0 && (
                <tr>
                  <td className="py-[4px] text-[var(--fg-3)]">Rent received (taxed with sales)</td>
                  <td className="py-[4px] text-right mono text-[var(--pos)]">{fmtEUR(p.rentalIncome)}</td>
                </tr>
              )}
              <tr>
                <td className="py-[4px] text-[var(--fg-3)]">Portfolio sale/mo</td>
                <td className="py-[4px] text-right mono font-semibold">{fmtEUR(p.grossWithdrawal)}</td>
              </tr>
              <tr>
                <td className="py-[4px] text-[var(--fg-3)]">Gross/yr</td>
                <td className="py-[4px] text-right mono">{fmtEUR(p.grossAnnual)}</td>
              </tr>
            </tbody>
          </table>
          {p.pensionOffset > 0 && (
            <div className="mt-2 text-[11px] text-[var(--fg-3)] leading-snug">
              TyEL {fmtEUR(Math.round(pension.grossMonthly))} gross/mo = ({fmtEUR(Math.round(pension.accruedMonthly))} accrued + {fmtEUR(Math.round(pension.futureAccrualMonthly))} future) × life-expectancy coef.
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function InfoTip({ text, sources, align = 'left' }: { text: string; sources?: SourceId[]; align?: 'left' | 'right' }) {
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
            {sources && sources.length > 0 && <span className="mt-[5px]"><SourceLinks ids={sources} /></span>}
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

interface ConfigField { key: keyof StoredFireConfig; label: string; min: number; max: number; step: number; pct?: boolean; tip?: string; sources?: SourceId[] }

const CONFIG_FIELDS: { group: string; fields: ConfigField[] }[] = [
  {
    group: 'Age milestones',
    fields: [
      { key: 'retirementAge', label: 'Target retirement age', min: 30, max: 90, step: 1 },
      { key: 'mortgageEndAge', label: 'Mortgage end age', min: 30, max: 90, step: 1,
        tip: 'Age when your mortgage is fully paid off. Phase 1A ends here and monthly spend drops.' },
      { key: 'pensionAge', label: 'TyEL pension age', min: 55, max: 75, step: 1,
        tip: 'Age the TyEL old-age pension starts. For those born 1965+, the lowest retirement age is tied to cohort life expectancy. The published estimate for the 1990 cohort is 67 y 9 m, rounded up to 68 here. A pension taken early is permanently reduced by 0.4% per month.',
        sources: ['retirementAges', 'etkOldAge'] },
    ],
  },
  {
    group: 'Investment assumptions',
    fields: [
      { key: 'monthlyContribution', label: 'Monthly contribution (€)', min: 0, max: 20000, step: 100 },
      { key: 'accumulationReturn', label: 'Accumulation real return', min: 0, max: 20, step: 0.1, pct: true,
        tip: "After-inflation annual portfolio return while saving. It's your own assumption (default 6%). Using real returns keeps spending targets in today's euros." },
      { key: 'drawdownReturn', label: 'Drawdown real return', min: 0, max: 15, step: 0.1, pct: true,
        tip: 'After-inflation return during retirement. It\'s your own assumption (default 4%). Setting it below the saving-phase return builds in a safety margin, since the model has no year-to-year volatility.' },
    ],
  },
  {
    group: 'Capital income tax',
    fields: [
      { key: 'taxpayers', label: 'Taxpayers sharing withdrawals', min: 1, max: 2, step: 1,
        tip: 'Finland taxes each person individually, capital income included, so each spouse has their own €30,000/yr threshold for the 30% rate. With 2, withdrawals and rent are split evenly between you, which fits if investments are held in both names.',
        sources: ['veroSpouses', 'veroShares'] },
    ],
  },
  {
    group: 'Cash buffer',
    fields: [
      { key: 'emergencyFundMonths', label: 'Emergency fund (months of income)', min: 0, max: 24, step: 0.5,
        tip: 'Bank/cash balances above this many months of your trailing-12-month average income count toward your FIRE portfolio; the buffer itself stays reserved and excluded.' },
    ],
  },
  {
    group: 'Spending phases',
    fields: [
      { key: 'phase1aNetMonthly', label: 'Phase 1A net/mo — retire → mortgage end (€)', min: 0, max: 20000, step: 100 },
      { key: 'phase1bNetMonthly', label: 'Phase 1B net/mo — mortgage end → pension (€)', min: 0, max: 15000, step: 100 },
      { key: 'phase2NetMonthly', label: 'Phase 2 net/mo — pension age onward (€)', min: 0, max: 15000, step: 100 },
    ],
  },
  {
    group: 'TyEL pension (household)',
    fields: [
      { key: 'pensionAccruedMonthly', label: 'Accrued so far, gross/mo (€)', min: 0, max: 10000, step: 10,
        tip: 'Combined monthly pension you have both earned to date, as shown on your työeläkeote (pension company statement or tyoelake.fi) — before life-expectancy coefficient and tax.' },
      { key: 'lifeExpectancyCoef', label: 'Life-expectancy coefficient', min: 0.5, max: 1, step: 0.01,
        tip: 'Elinaikakerroin: cuts the pension when it starts. It is 0.94643 for the 1964 cohort. The 1990 cohort\'s isn\'t set yet (it is fixed at age 62), so 0.90 is this model\'s own estimate.',
        sources: ['stmCoef', 'tyel2026'] },
      { key: 'pensionTaxRate', label: 'Pension effective tax %', min: 0, max: 60, step: 0.5, pct: true,
        tip: 'Your estimate of the average tax on each spouse\'s pension. Pensions are taxed as earned income, and the rate depends on the pension, other income and deductions. Check it with the vero.fi calculator.',
        sources: ['veroPensionTax', 'veroCalculator'] },
    ],
  },
];

function DerivedRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <tr>
      <td className="py-[4px] pr-3 text-[var(--fg-3)] align-top">{label}</td>
      <td className="py-[4px] text-right mono align-top">
        {value}
        {sub && <div className="text-[10px] text-[var(--fg-3)] font-sans">{sub}</div>}
      </td>
    </tr>
  );
}

function DerivedInputs({ data }: { data: FireApiResponse }) {
  const { earnings, rental } = data.derived;
  const yearsAway = data.config.retirementAge - computeCurrentAge(data.config.dateOfBirth);
  const deductionPct = (ASSUMED_INCOME_TAX_RATE + FI_EMPLOYEE_PENSION_CONTRIBUTION + FI_EMPLOYEE_UNEMPLOYMENT_CONTRIBUTION) * 100;
  const pct = (n: number, d = 2) => `${(n * 100).toFixed(d)}%`;

  return (
    <div>
      <div className="tool-label text-[var(--fg-3)] mb-1">Derived from your data</div>
      <div className="text-[11px] text-[var(--fg-3)] mb-3">
        Worked out from your age and the last 12 months of transactions, not typed in.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-[12px]">
        <div>
          <div className="font-medium mb-1">Deemed acquisition cost</div>
          <table className="w-full"><tbody className="divide-y divide-[var(--border)]">
            <DerivedRow label="Retirement in" value={`${yearsAway.toFixed(1)} yrs`} />
            <DerivedRow label="Rate used" value={pct(data.deemedCostPct, 0)} sub={yearsAway >= 10 ? '10+ years away → 40%' : 'under 10 years away → 20%'} />
          </tbody></table>
          <SourceLinks ids={['veroShares']} />
        </div>
        <div>
          <div className="font-medium mb-1">Gross earnings (pension accrual)</div>
          <table className="w-full"><tbody className="divide-y divide-[var(--border)]">
            <DerivedRow label="Net salary" value={`${fmtEUR(Math.round(earnings.netMonthly))}/mo`} sub={`avg over ${earnings.months} month${earnings.months === 1 ? '' : 's'}`} />
            <DerivedRow label="Gross" value={`${fmtEUR(Math.round(earnings.grossAnnual))}/yr`} sub={`net ÷ (1 − ${deductionPct.toFixed(2)}%)`} />
          </tbody></table>
          <SourceLinks ids={['tyel2026', 'unemployment2026']} />
          <div className="text-[10px] text-[var(--fg-3)]">30% income tax is your own estimate.</div>
        </div>
        <div>
          <div className="font-medium mb-1">Rental</div>
          <table className="w-full"><tbody className="divide-y divide-[var(--border)]">
            <DerivedRow label="Rent received" value={`${fmtEUR(Math.round(rental.rentMonthly))}/mo`} sub={`avg over ${rental.rentMonths} month${rental.rentMonths === 1 ? '' : 's'}`} />
            {rental.fees.map(f => (
              <DerivedRow key={f.merchant} label={`${f.merchant} fee${f.share < 1 ? ` (${Math.round(f.share * 100)}%)` : ''}`} value={`−${fmtEUR(Math.round(f.deductibleMonthly))}/mo`} />
            ))}
            <DerivedRow label="Net rent (cash)" value={`${fmtEUR(Math.round(rental.netMonthly))}/mo`} />
            <DerivedRow
              label="Loan interest (tax only)"
              value={`${fmtEUR(Math.round(rental.loanInterestMonthly))}/mo`}
              sub={`avg in retirement until mortgage end · ${pct(rental.loanRate)} = Euribor 6m ${pct(rental.euribor.rate)} (${rental.euribor.period}${rental.euribor.live ? '' : ', cached'}) + 0.60%`}
            />
          </tbody></table>
          <SourceLinks ids={['veroRentalDeductions', 'ecbEuribor']} />
          <div className="text-[10px] text-[var(--fg-3)]">The 15% Matela share is your own estimate.</div>
        </div>
      </div>
    </div>
  );
}

function ConfigPanel({ data, config, onSave, saving }: {
  data: FireApiResponse;
  config: FireConfig;
  onSave: (draft: Partial<StoredFireConfig>) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<StoredFireConfig>>({});

  function set(key: keyof StoredFireConfig, value: number) {
    setDraft(prev => ({ ...prev, [key]: value }));
  }

  function getVal(key: keyof StoredFireConfig, pct?: boolean): number {
    const raw = (draft[key] ?? config[key]) as number;
    return pct ? raw * 100 : raw;
  }

  function handleSave() {
    const toSave: Partial<StoredFireConfig> = { ...draft };
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
          <DerivedInputs data={data} />
          {CONFIG_FIELDS.map(group => (
            <div key={group.group}>
              <div className="tool-label text-[var(--fg-3)] mb-3">{group.group}</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                {group.fields.map((f, fi) => (
                  <label key={f.key} className="flex flex-col gap-[4px]">
                    <span className="text-[11px] text-[var(--fg-2)]">{f.label}{f.tip && <InfoTip text={f.tip} sources={f.sources} align={fi % 2 === 1 ? 'right' : 'left'} />}</span>
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

  async function handleSave(draft: Partial<StoredFireConfig>) {
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

  const { config, fireTarget, currentPortfolio, yearsToFire, projectedRetirementAge, earliestFireTarget, pension, warnings, phases, pureFire, barista33, barista50, investmentTotal, investableCash, bufferTarget } = data;

  const yearsLabel = yearsToFire !== null
    ? yearsToFire <= 0
      ? 'Already there 🎉'
      : `${yearsToFire.toFixed(1)} yrs`
    : 'not before pension';

  const retireAgeLabel = projectedRetirementAge !== null && earliestFireTarget !== null
    ? `age ${projectedRetirementAge.toFixed(1)} · needs ${fmt(earliestFireTarget)}`
    : undefined;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="FIRE Number" value={fmt(fireTarget)} sub={`to retire at ${config.retirementAge}`} />
        <KPI
          label="Current Portfolio"
          value={fmt(currentPortfolio)}
          sub={currentPortfolio === 0 ? 'add investment assets below' : `${fmt(investmentTotal)} invest + ${fmt(investableCash)} cash`}
          tip={`Investment assets plus bank cash above a ${config.emergencyFundMonths}-month average-income buffer (${fmt(bufferTarget)} reserved), so your emergency fund isn't counted as FIRE progress.`}
        />
        <ProgressBar pct={data.progressPct} />
        <KPI
          label="Years to FIRE"
          value={yearsLabel}
          sub={retireAgeLabel}
          accent={yearsToFire !== null && yearsToFire <= 0}
          tip="Earliest age at which the projected portfolio covers the FIRE number for retiring at that age. Retiring earlier needs a larger portfolio (longer drawdown, less pension accrued), so this target differs from the FIRE Number tile."
        />
      </div>

      {warnings.length > 0 && (
        <div className="dash-card p-[10px_16px] text-[12px] text-[var(--fg-2)] space-y-1 border-l-[3px] border-l-[oklch(0.75_0.15_75)]">
          {warnings.map(w => <div key={w}>⚠ {w}</div>)}
        </div>
      )}

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

      <PhaseCards phases={phases} pension={pension} />
      <BaristaTable variants={[pureFire, barista33, barista50]} />
      <ConfigPanel data={data} config={config} onSave={handleSave} saving={saving} />
      <div className="text-right">
        <Link href="/settings?tab=assets" className="text-[12px] text-[var(--fg-3)] hover:text-[var(--fg-2)]">
          Manage assets in Settings →
        </Link>
      </div>
    </div>
  );
}
