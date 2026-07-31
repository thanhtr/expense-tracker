'use client';

import { useEffect, useMemo, useState } from 'react';
import { DashboardAggregation } from '@/lib/types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

// Palette used by category charts — stable, print-friendly, a single hue family.
const CAT_COLORS = [
  'oklch(0.58 0.12 30)',
  'oklch(0.62 0.10 75)',
  'oklch(0.60 0.09 155)',
  'oklch(0.55 0.10 225)',
  'oklch(0.52 0.11 290)',
  'oklch(0.60 0.09 340)',
  'oklch(0.66 0.06 200)',
  'oklch(0.70 0.05 60)',
];

const PERIOD_PRESETS = ['This month', 'Last month', 'YTD', 'Custom'] as const;
type Preset = (typeof PERIOD_PRESETS)[number];

// ----- helpers -----

function pad(n: number) { return String(n).padStart(2, '0'); }
function ymd(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

function rangeForPreset(p: Preset): { from: string; to: string } {
  const now = new Date();
  if (p === 'This month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ymd(from), to: ymd(to) };
  }
  if (p === 'Last month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: ymd(from), to: ymd(to) };
  }
  if (p === 'YTD') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: ymd(from), to: ymd(now) };
  }
  // Custom — caller keeps current values
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to: ymd(now) };
}

function previousRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  const span = t.getTime() - f.getTime();
  const prevTo = new Date(f.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - span);
  return { from: ymd(prevFrom), to: ymd(prevTo) };
}

function fmtEUR(n: number, opts: { cents?: boolean } = {}) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: opts.cents === false ? 0 : 2,
    maximumFractionDigits: opts.cents === false ? 0 : 2,
  }).format(n).replace(/\u00A0/g, ' ');
}
function pct(v: number) { return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`; }

function labelForRange(from: string, to: string): string {
  const f = new Date(from);
  const t = new Date(to);
  const sameMonth = f.getFullYear() === t.getFullYear() && f.getMonth() === t.getMonth();
  if (sameMonth) return f.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  return `${f.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

// ----- small components -----

function Delta({ curr, prev, goodWhenDown = true }: { curr: number; prev: number; goodWhenDown?: boolean }) {
  if (!prev) {
    return <span className="text-[12px] text-[var(--fg-3)]">—</span>;
  }
  const d = ((curr - prev) / prev) * 100;
  const flat = Math.abs(d) < 0.05;
  const up = d > 0;
  const cls = flat
    ? 'text-[var(--fg-3)]'
    : up === goodWhenDown
      ? 'text-[oklch(0.38_0.14_25)]'
      : 'text-[oklch(0.32_0.09_160)]';
  const arrow = flat ? '·' : up ? '▲' : '▼';
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] ${cls} whitespace-nowrap`}>
      <span className="text-[9px]">{arrow}</span>
      <span className="mono">{pct(d)}</span>
      <span className="text-[var(--fg-3)]">vs prev</span>
    </span>
  );
}

function Sparkline({ data, color = 'var(--accent)' }: { data: number[]; color?: string }) {
  const w = 88, h = 26;
  if (!data.length) return <svg width={w} height={h} />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data.map((v, i) => `${i * step},${h - 2 - ((v - min) / range) * (h - 6)}`).join(' ');
  const areaPts = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polygon points={areaPts} fill={color} opacity={0.1} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function KPI({
  label, value, curr, prev, goodWhenDown, sparkData, sparkColor, valueColor,
}: {
  label: string; value: string; curr: number; prev: number; goodWhenDown: boolean;
  sparkData: number[]; sparkColor?: string; valueColor?: string;
}) {
  return (
    <div className="dash-card p-[16px_18px_14px]">
      <div className="text-[11px] font-medium tracking-[.04em] uppercase text-[var(--fg-3)]">{label}</div>
      <div className="mono text-[24px] font-semibold tracking-[-0.015em] mt-[6px]" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      <div className="flex items-center justify-between gap-[10px] mt-[6px]">
        <Delta curr={curr} prev={prev} goodWhenDown={goodWhenDown} />
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
    </div>
  );
}

// Category horizontal bar list (ranked, with delta vs previous)
function CategoryBarList({
  byCategory, byCategoryPrev, total,
}: {
  byCategory: { category: string; amount: number }[];
  byCategoryPrev: Record<string, number>;
  total: number;
}) {
  const max = Math.max(...byCategory.map(c => c.amount), 1);
  return (
    <div className="flex flex-col gap-[10px]">
      {byCategory.map((c, i) => {
        const prev = byCategoryPrev[c.category] || 0;
        const share = total ? (c.amount / total) * 100 : 0;
        const delta = prev ? ((c.amount - prev) / prev) * 100 : 0;
        const showDelta = prev > 0;
        const up = delta > 0.5;
        const flat = Math.abs(delta) < 0.5;
        const color = CAT_COLORS[i % CAT_COLORS.length];
        return (
          <div key={c.category} className="grid grid-cols-[1fr_auto] gap-x-[10px] gap-y-[4px] items-center">
            <div className="flex items-center gap-[8px] min-w-0">
              <span className="w-[10px] h-[10px] rounded-[3px] inline-block flex-none" style={{ background: color }} />
              <span className="text-[13px] font-medium text-[var(--foreground)] overflow-hidden text-ellipsis whitespace-nowrap">{c.category}</span>
              <span className="text-[11px] text-[var(--fg-3)]">{share.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-[8px]">
              {showDelta && !flat && (
                <span className="text-[11px] whitespace-nowrap" style={{ color: up ? 'oklch(0.42 0.14 25)' : 'oklch(0.36 0.09 160)' }}>
                  {up ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
                </span>
              )}
              <span className="mono text-[13px] whitespace-nowrap">{fmtEUR(c.amount)}</span>
            </div>
            <div className="col-span-2 cat-bar-track">
              <div className="cat-bar-fill" style={{ width: `${(c.amount / max) * 100}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Custom daily chart using recharts (stacked bar)
function DailyChart({ data, categories }: { data: Array<Record<string, number | string>>; categories: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ left: 20, right: 16, top: 8, bottom: 28 }}>
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickFormatter={(d: string) => {
            const dt = new Date(d);
            return `${dt.getDate()}`;
          }}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `€${Math.round(v)}`}
          width={44}
        />
        <Tooltip
          cursor={{ fill: 'oklch(0.95 0.004 260)' }}
          contentStyle={{
            background: 'oklch(0.22 0.012 260)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 11,
            padding: '8px 10px',
          }}
          labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ color: '#fff', fontSize: 11 }}
          formatter={(value) => fmtEUR(Number(value ?? 0))}
          labelFormatter={(label) => {
            const d = label as string;
            return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          }}
        />
        {categories.map((cat, i) => (
          <Bar
            key={cat}
            dataKey={cat}
            stackId="a"
            fill={CAT_COLORS[i % CAT_COLORS.length]}
            radius={i === categories.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function MonthlyChart({ data }: { data: { month: string; amount: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ left: 20, right: 16, top: 8, bottom: 8 }}>
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickFormatter={(m: string) => {
            const [y, mo] = m.split('-');
            return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
          }}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `€${Math.round(v)}`}
          width={44}
        />
        <Tooltip
          cursor={{ fill: 'oklch(0.95 0.004 260)' }}
          contentStyle={{
            background: 'oklch(0.22 0.012 260)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 11,
            padding: '8px 10px',
          }}
          labelStyle={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}
          itemStyle={{ color: '#fff', fontSize: 11 }}
          formatter={(value) => fmtEUR(Number(value ?? 0))}
          labelFormatter={(label) => {
            const m = label as string;
            const [y, mo] = m.split('-');
            return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
          }}
        />
        <Bar dataKey="amount" fill={CAT_COLORS[3]} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// Recent transactions list (reads from /api/transactions)
type RecentTx = {
  id: number;
  date: string;
  merchant: string;
  amount: number;
  type: string;
  category: string;
};

function RecentActivity() {
  const [rows, setRows] = useState<RecentTx[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/transactions?limit=8');
        if (!res.ok) return;
        const json = await res.json();
        const items: RecentTx[] = Array.isArray(json) ? json : (json.transactions || json.items || []);
        if (!cancelled) setRows(items.slice(0, 8));
      } catch {
        if (!cancelled) setRows([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (rows === null) return <div className="text-[12px] text-[var(--fg-3)] py-4">Loading…</div>;
  if (rows.length === 0) return <div className="text-[12px] text-[var(--fg-3)] py-4">No recent transactions.</div>;

  return (
    <div className="flex flex-col">
      {rows.map((t, idx) => {
        const isExpense = t.type === 'Expense' || t.amount < 0;
        const signed = Math.abs(t.amount);
        const catIndex = Math.abs(hash(t.category || '') % CAT_COLORS.length);
        const dotColor = t.type === 'Income' ? 'var(--pos)' : CAT_COLORS[catIndex];
        const dateStr = new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return (
          <div key={t.id ?? idx} className="grid grid-cols-[72px_1fr_auto_110px] gap-[12px] items-center py-[10px] border-t border-[var(--border)] first:border-t-0">
            <div className="text-[12px] text-[var(--fg-3)] mono">{dateStr}</div>
            <div className="text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{t.merchant}</div>
            <span className="inline-flex items-center gap-[5px] text-[11px] font-medium text-[var(--fg-2)] bg-[oklch(0.96_0.004_260)] px-[7px] py-[3px] rounded-full">
              <span className="w-[6px] h-[6px] rounded-full" style={{ background: dotColor }} />
              {t.category || 'Uncategorized'}
            </span>
            <div
              className={`mono text-[13px] text-right whitespace-nowrap ${isExpense ? 'text-[oklch(0.38_0.14_25)]' : 'text-[oklch(0.32_0.09_160)]'}`}
            >
              {isExpense ? '−' : '+'}{fmtEUR(signed)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// ----- main component -----

export function DashboardStats() {
  const [preset, setPreset] = useState<Preset>('This month');
  const initial = rangeForPreset('This month');
  const [dateFrom, setDateFrom] = useState(initial.from);
  const [dateTo, setDateTo] = useState(initial.to);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [chartStyle, setChartStyle] = useState<'bars' | 'donut'>('bars');

  const [data, setData] = useState<DashboardAggregation | null>(null);
  const [prevData, setPrevData] = useState<DashboardAggregation | null>(null);
  const [unfiltered, setUnfiltered] = useState<DashboardAggregation | null>(null);
  const [loading, setLoading] = useState(true);

  // Apply preset → update dates
  useEffect(() => {
    if (preset === 'Custom') return;
    const r = rangeForPreset(preset);
    setDateFrom(r.from);
    setDateTo(r.to);
  }, [preset]);

  // Fetch unfiltered (for category dropdown + uncategorized count)
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        const res = await fetch(`/api/dashboard?${params}`);
        if (res.ok) setUnfiltered(await res.json());
      } catch (e) { console.error(e); }
    })();
  }, [dateFrom, dateTo]);

  // Fetch filtered + previous-period for deltas
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        if (selectedCategory) params.set('category', selectedCategory);

        const prev = previousRange(dateFrom, dateTo);
        const prevParams = new URLSearchParams({ date_from: prev.from, date_to: prev.to });
        if (selectedCategory) prevParams.set('category', selectedCategory);

        const [resCur, resPrev] = await Promise.all([
          fetch(`/api/dashboard?${params}`),
          fetch(`/api/dashboard?${prevParams}`),
        ]);
        if (resCur.ok) setData(await resCur.json());
        if (resPrev.ok) setPrevData(await resPrev.json());
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [dateFrom, dateTo, selectedCategory]);

  const byCategoryPrevMap = useMemo(() => {
    const m: Record<string, number> = {};
    prevData?.byCategory.forEach(c => { m[c.category] = c.amount; });
    return m;
  }, [prevData]);

  const dailyAverage = useMemo(() => {
    if (!data || !data.byDay.length) return 0;
    return data.totalExpenses / data.byDay.length;
  }, [data]);

  const biggestChange = useMemo(() => {
    if (!data || !prevData) return null;
    let best: { category: string; delta: number } | null = null;
    for (const c of data.byCategory) {
      const prev = byCategoryPrevMap[c.category] || 0;
      if (prev < 20) continue;
      const delta = ((c.amount - prev) / prev) * 100;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { category: c.category, delta };
    }
    return best;
  }, [data, prevData, byCategoryPrevMap]);

  if (loading && !data) return <div className="text-center py-8 text-[var(--fg-3)]">Loading…</div>;
  if (!data) return <div className="text-center py-8 text-[var(--fg-3)]">No data available</div>;

  // Build donut chart data (top 5 + Other)
  const donutData = (() => {
    const top = data.byCategory.slice(0, 5);
    const otherAmount = data.byCategory.slice(5).reduce((s, c) => s + c.amount, 0);
    return otherAmount > 0 ? [...top, { category: 'Other', amount: otherAmount }] : top;
  })();

  const prevTotalExpenses = prevData?.totalExpenses ?? 0;
  const prevTotalIncome = prevData?.totalIncome ?? 0;
  const prevNet = prevData?.net ?? 0;
  const prevTxCount = prevData?.transactionCount ?? 0;

  const sparkExpenses = [prevTotalExpenses || data.totalExpenses, data.totalExpenses];
  const sparkIncome = [prevTotalIncome || data.totalIncome, data.totalIncome];
  const sparkNet = [prevNet || data.net, data.net];
  const sparkTx = [prevTxCount || data.transactionCount, data.transactionCount];

  const displayCategories = data.byCategory.map(c => c.category);

  return (
    <div className="space-y-[20px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] m-0">Dashboard</h1>
          <div className="text-[13px] text-[var(--fg-3)] mt-[2px]">
            {labelForRange(dateFrom, dateTo)}
            {prevData && ` · compared to ${labelForRange(previousRange(dateFrom, dateTo).from, previousRange(dateFrom, dateTo).to)}`}
          </div>
        </div>
        {unfiltered && unfiltered.uncategorizedCount > 0 && !selectedCategory && (
          <span className="warn-pill">
            <span className="dot" />
            {unfiltered.uncategorizedCount} transaction{unfiltered.uncategorizedCount === 1 ? '' : 's'} need a category
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="dash-card flex flex-wrap items-center gap-[8px] p-[10px_12px]">
        <span className="tool-label mr-[4px]">Period</span>
        <div className="seg">
          {PERIOD_PRESETS.map(p => (
            <button key={p} className={preset === p ? 'active' : ''} onClick={() => setPreset(p)}>{p}</button>
          ))}
        </div>
        <div className="flex items-center gap-[6px] ml-[4px]">
          <input
            type="date"
            className="date-input"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPreset('Custom'); }}
          />
          <span className="text-[var(--fg-3)] text-[12px]">→</span>
          <input
            type="date"
            className="date-input"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPreset('Custom'); }}
          />
        </div>
        <div className="w-px h-5 bg-[var(--border)] mx-[4px]" />
        <span className="tool-label mr-[4px]">Category</span>
        <select
          className="select-plain"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {unfiltered?.allCategories?.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="ml-auto flex gap-[6px]">
          <a href="/api/export" className="btn-ghost">Export CSV</a>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[20px]">
        <KPI
          label="Total expenses"
          value={fmtEUR(data.totalExpenses)}
          curr={data.totalExpenses}
          prev={prevTotalExpenses}
          goodWhenDown
          sparkData={sparkExpenses}
          sparkColor="var(--neg)"
        />
        <KPI
          label="Total income"
          value={fmtEUR(data.totalIncome)}
          curr={data.totalIncome}
          prev={prevTotalIncome}
          goodWhenDown={false}
          sparkData={sparkIncome}
          sparkColor="var(--pos)"
          valueColor="oklch(0.38 0.10 160)"
        />
        <KPI
          label="Net"
          value={fmtEUR(data.net)}
          curr={data.net}
          prev={prevNet}
          goodWhenDown={false}
          sparkData={sparkNet}
          sparkColor={data.net >= 0 ? 'var(--pos)' : 'var(--neg)'}
          valueColor={data.net >= 0 ? 'oklch(0.38 0.10 160)' : 'oklch(0.42 0.14 25)'}
        />
        <KPI
          label="Transactions"
          value={String(data.transactionCount)}
          curr={data.transactionCount}
          prev={prevTxCount}
          goodWhenDown={false}
          sparkData={sparkTx}
          sparkColor="var(--accent)"
        />
      </div>

      {/* Categories + Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-[20px]">
        <div className="dash-card">
          <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
            <div>
              <h3 className="text-[13px] font-semibold m-0">Spending by category</h3>
              <div className="text-[12px] text-[var(--fg-3)]">Ranked by amount · share of total</div>
            </div>
            <div className="seg">
              <button className={chartStyle === 'bars' ? 'active' : ''} onClick={() => setChartStyle('bars')}>Bars</button>
              <button className={chartStyle === 'donut' ? 'active' : ''} onClick={() => setChartStyle('donut')}>Donut</button>
            </div>
          </div>
          <div className="p-[0_20px_20px]">
            {data.byCategory.length === 0 ? (
              <div className="text-center py-8 text-[var(--fg-3)] text-[13px]">No expenses in this period.</div>
            ) : chartStyle === 'donut' ? (
              <div className="flex flex-col gap-[18px] pt-[4px]">
                <div className="flex justify-center">
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie
                        data={donutData}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%" cy="50%"
                        innerRadius={56}
                        outerRadius={90}
                        stroke="none"
                      >
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => fmtEUR(Number(value ?? 0))} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <CategoryBarList byCategory={data.byCategory} byCategoryPrev={byCategoryPrevMap} total={data.totalExpenses} />
              </div>
            ) : (
              <CategoryBarList byCategory={data.byCategory} byCategoryPrev={byCategoryPrevMap} total={data.totalExpenses} />
            )}
          </div>
        </div>

        <div className="dash-card">
          <div className="p-[16px_20px_12px]">
            <h3 className="text-[13px] font-semibold m-0">Insights</h3>
            <div className="text-[12px] text-[var(--fg-3)]">This period at a glance</div>
          </div>
          <div className="grid grid-cols-2 gap-[14px] p-[0_20px_20px]">
            <InsightTile
              label="Top category"
              value={data.byCategory[0]?.category || '—'}
              sub={data.byCategory[0] ? fmtEUR(data.byCategory[0].amount) : '—'}
            />
            <InsightTile
              label="Largest transaction"
              value={data.topTransaction?.merchant || '—'}
              sub={data.topTransaction ? `${fmtEUR(data.topTransaction.amount)} · ${data.topTransaction.category}` : '—'}
            />
            <InsightTile
              label="Daily average"
              value={fmtEUR(dailyAverage)}
              sub={`Over ${data.byDay.length} ${data.byDay.length === 1 ? 'day' : 'days'}`}
            />
            <InsightTile
              label="Biggest change"
              value={biggestChange?.category || '—'}
              sub={
                biggestChange
                  ? <span style={{ color: biggestChange.delta > 0 ? 'oklch(0.42 0.14 25)' : 'oklch(0.36 0.09 160)' }}>
                      {biggestChange.delta > 0 ? '▲' : '▼'} {Math.abs(biggestChange.delta).toFixed(0)}% vs prev
                    </span>
                  : '—'
              }
            />
            {Object.keys(data.byAccount).length > 0 && (
              <div className="col-span-2 flex items-end justify-between pt-[4px] gap-[12px]">
                {Object.entries(data.byAccount).map(([a, v]) => (
                  <div key={a} className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[.04em] text-[var(--fg-3)] overflow-hidden text-ellipsis whitespace-nowrap">{a}</div>
                    <div className="mono text-[15px] font-medium mt-[2px]">{fmtEUR(v)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Daily chart */}
      <div className="dash-card">
        <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
          <div>
            <h3 className="text-[13px] font-semibold m-0">Daily spending</h3>
            <div className="text-[12px] text-[var(--fg-3)]">Stacked by category · {labelForRange(dateFrom, dateTo)}</div>
          </div>
          <div className="text-[11px] text-[var(--fg-3)]">
            Daily avg <span className="mono text-[var(--foreground)]">{fmtEUR(dailyAverage, { cents: false })}</span>
          </div>
        </div>
        <div className="p-[0_12px_12px]">
          {data.byDay.length > 0 ? (
            <DailyChart data={data.byDay} categories={displayCategories} />
          ) : (
            <div className="text-center py-8 text-[var(--fg-3)] text-[13px]">No expenses in this period.</div>
          )}
          {data.byCategory.length > 0 && (
            <div className="flex flex-wrap gap-[10px] mt-[8px] px-[8px] text-[11px] text-[var(--fg-2)]">
              {data.byCategory.slice(0, 6).map((c, i) => (
                <span key={c.category} className="inline-flex items-center gap-[5px]">
                  <span className="w-[8px] h-[8px] rounded-[2px] inline-block" style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                  {c.category}
                </span>
              ))}
              {data.byCategory.length > 6 && (
                <span className="text-[var(--fg-3)]">+{data.byCategory.length - 6} more</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Monthly trend */}
      {data.byMonth.length > 1 && (
        <div className="dash-card">
          <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
            <div>
              <h3 className="text-[13px] font-semibold m-0">Monthly trend</h3>
              <div className="text-[12px] text-[var(--fg-3)]">Total expenses per month</div>
            </div>
          </div>
          <div className="p-[0_12px_12px]">
            <MonthlyChart data={data.byMonth} />
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="dash-card">
        <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
          <div>
            <h3 className="text-[13px] font-semibold m-0">Recent activity</h3>
            <div className="text-[12px] text-[var(--fg-3)]">Latest transactions</div>
          </div>
          <a href="/transactions" className="btn-ghost">All transactions →</a>
        </div>
        <div className="p-[0_20px_20px]">
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}

function InsightTile({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="p-[10px_12px] bg-[var(--surface-2)] border border-[var(--border)] rounded-[6px] min-w-0">
      <div className="text-[10px] uppercase tracking-[.04em] text-[var(--fg-3)] font-medium">{label}</div>
      <div className="text-[14px] font-semibold mt-[4px] overflow-hidden text-ellipsis whitespace-nowrap">{value}</div>
      <div className="text-[12px] text-[var(--fg-3)] mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">{sub}</div>
    </div>
  );
}
