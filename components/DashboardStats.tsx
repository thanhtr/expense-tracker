'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { DashboardAggregation } from '@/lib/types';
import type { ForecastResult } from '@/lib/services/forecast-service';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
  ComposedChart, Line, CartesianGrid, Legend, LineChart, ReferenceLine,
} from 'recharts';
import { NetWorthCard } from './NetWorthCard';
import { NetWorthChart } from './NetWorthChart';
import { GuidelinePanel } from './GuidelinePanel';
import { useCategories } from '@/components/CategoriesProvider';
import { useHouseholdMembers } from '@/components/HouseholdMembersProvider';
import { fmtEUR } from '@/lib/utils';

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

const PERIOD_PRESETS = ['This month', 'Last month', '2 months ago', 'YTD', 'Custom'] as const;
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
  if (p === '2 months ago') {
    const from = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - 1, 0);
    return { from: ymd(from), to: ymd(to) };
  }
  if (p === 'YTD') {
    const from = new Date(now.getFullYear(), 0, 1);
    return { from: ymd(from), to: ymd(now) };
  }
  // Custom — caller keeps current values
  return { from: ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: ymd(new Date(now.getFullYear(), now.getMonth(), 0)) };
}

function previousRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  const span = t.getTime() - f.getTime();
  const prevTo = new Date(f.getTime() - 24 * 60 * 60 * 1000);
  const prevFrom = new Date(prevTo.getTime() - span);
  return { from: ymd(prevFrom), to: ymd(prevTo) };
}

function yoyRange(from: string, to: string): { from: string; to: string } {
  const f = new Date(from);
  const t = new Date(to);
  f.setFullYear(f.getFullYear() - 1);
  t.setFullYear(t.getFullYear() - 1);
  return { from: ymd(f), to: ymd(t) };
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

function Delta({ curr, prev, goodWhenDown = true, neutral = false, vsLabel = 'prev' }: { curr: number; prev: number; goodWhenDown?: boolean; neutral?: boolean; vsLabel?: string }) {
  if (!prev) {
    return <span className="text-[12px] text-[var(--fg-3)]">—</span>;
  }
  const d = ((curr - prev) / prev) * 100;
  const flat = Math.abs(d) < 0.05;
  const up = d > 0;
  const cls = (flat || neutral)
    ? 'text-[var(--fg-3)]'
    : up === goodWhenDown
      ? 'text-[oklch(0.38_0.14_25)]'
      : 'text-[oklch(0.32_0.09_160)]';
  const arrow = flat ? '·' : up ? '▲' : '▼';
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] ${cls} whitespace-nowrap`}>
      <span className="text-[9px]">{arrow}</span>
      <span className="mono">{pct(d)}</span>
      <span className="text-[var(--fg-3)]">vs {vsLabel}</span>
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
  label, value, curr, prev, goodWhenDown, neutral, sparkData, sparkColor, valueColor, vsLabel,
}: {
  label: string; value: string; curr: number; prev: number; goodWhenDown: boolean; neutral?: boolean;
  sparkData: number[]; sparkColor?: string; valueColor?: string; vsLabel?: string;
}) {
  return (
    <div className="dash-card p-[16px_18px_14px]">
      <div className="text-[11px] font-medium tracking-[.04em] uppercase text-[var(--fg-3)]">{label}</div>
      <div className="mono text-[24px] font-semibold tracking-[-0.015em] mt-[6px]" style={valueColor ? { color: valueColor } : undefined}>
        {value}
      </div>
      <div className="flex items-center justify-between gap-[10px] mt-[6px]">
        <Delta curr={curr} prev={prev} goodWhenDown={goodWhenDown} neutral={neutral} vsLabel={vsLabel} />
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
    </div>
  );
}

// Category horizontal bar list (ranked, with delta vs previous)
function CategoryBarList({
  byCategory, byCategoryPrev, total, onCategoryClick,
}: {
  byCategory: { category: string; amount: number }[];
  byCategoryPrev: Record<string, number>;
  total: number;
  onCategoryClick?: (category: string) => void;
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
          <button
            key={c.category}
            type="button"
            className={`grid grid-cols-[1fr_auto] gap-x-[10px] gap-y-[4px] items-center w-full text-left${onCategoryClick ? ' cursor-pointer rounded hover:bg-[var(--surface-2)] -mx-1 px-1' : ' cursor-default'}`}
            onClick={() => onCategoryClick?.(c.category)}
          >
            <div className="flex items-center gap-[8px] min-w-0">
              <span className="w-[10px] h-[10px] rounded-[3px] inline-block flex-none" style={{ background: color }} />
              <span className="min-w-0 text-[13px] font-medium text-[var(--foreground)] overflow-hidden text-ellipsis whitespace-nowrap">{c.category}</span>
              <span className="text-[11px] text-[var(--fg-3)]">{share.toFixed(0)}%</span>
            </div>
            <div className="flex items-center gap-[8px]">
              {showDelta && !flat && (
                <span className="text-[11px] whitespace-nowrap" style={{ color: up ? 'oklch(0.42 0.14 25)' : 'oklch(0.36 0.09 160)' }}>
                  {up ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
                </span>
              )}
              <span className="mono text-[13px] whitespace-nowrap">{fmtEUR(c.amount, { cents: true })}</span>
            </div>
            <div className="col-span-2 cat-bar-track">
              <div className="cat-bar-fill" style={{ width: `${(c.amount / max) * 100}%`, background: color }} />
            </div>
          </button>
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
          cursor={{ fill: 'var(--surface-2)' }}
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
          formatter={(value) => fmtEUR(Number(value ?? 0), { cents: true })}
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

// ----- shared chart helpers -----

function fmtMonth(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}
function fmtLongMonth(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function fmtCompactEuro(v: number) {
  return Math.abs(v) >= 1000 ? `€${Math.round(v / 1000)}k` : `€${Math.round(v)}`;
}

// Shared toggle-visibility state for chart legend items. Returns a stable `toggle`
// callback so downstream useCallbacks that depend on it don't re-fire on every render.
function useSeriesToggle(categories: string[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = useCallback((key: string) => {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const visibleCats = useMemo(() => categories.filter(c => !hidden.has(c)), [categories, hidden]);
  return { hidden, toggle, visibleCats };
}

function CategoryTrendChart({ data, categories }: { data: Array<Record<string, number | string>>; categories: string[] }) {
  const { hidden, toggle: toggleSeries, visibleCats } = useSeriesToggle(categories);
  const topVisibleCat = visibleCats[visibleCats.length - 1];

  // Recharts reads all numeric fields in the data object to auto-expand the axis domain,
  // even for unregistered series. Strip hidden categories from each row so the axis
  // only sees what's visible.
  const chartData = useMemo(() => {
    if (visibleCats.length === categories.length) return data;
    return data.map(row => {
      const r: Record<string, string | number> = { month: row.month as string };
      visibleCats.forEach(cat => { r[cat] = row[cat] as number; });
      return r;
    });
  }, [data, categories, visibleCats]);

  const legendContent = useCallback(() => (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: 0, margin: 0, listStyle: 'none' }}>
      {categories.map((cat, i) => (
        <li key={cat} style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => toggleSeries(cat)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              background: 'none', border: 'none', padding: 0, font: 'inherit',
            }}
          >
            <span style={{
              display: 'inline-block', width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              backgroundColor: hidden.has(cat) ? 'var(--fg-3)' : CAT_COLORS[i % CAT_COLORS.length],
            }} />
            <span style={{ color: hidden.has(cat) ? 'var(--fg-3)' : 'inherit' }}>{cat}</span>
          </button>
        </li>
      ))}
    </ul>
  ), [categories, hidden, toggleSeries]);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ left: 20, right: 16, top: 8, bottom: 8 }}>
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickFormatter={fmtMonth}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `€${Math.round(v)}`}
          width={44}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
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
          formatter={(value) => fmtEUR(Number(value ?? 0), { cents: true })}
          labelFormatter={(label) => fmtLongMonth(label as string)}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} content={legendContent} />
        {visibleCats.map(cat => (
          <Bar
            key={cat}
            dataKey={cat}
            stackId="a"
            fill={CAT_COLORS[categories.indexOf(cat) % CAT_COLORS.length]}
            radius={cat === topVisibleCat ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function IncomeTrendChart({ trendData }: { trendData: { month: string; expenses: number; income: number; net: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={trendData} margin={{ left: 20, right: 16, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
          tickFormatter={fmtMonth}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={fmtCompactEuro}
          width={44}
        />
        <Tooltip
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
          formatter={(value) => fmtEUR(Number(value ?? 0), { cents: true })}
          labelFormatter={(label) => fmtLongMonth(label as string)}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
          formatter={(value) => value.charAt(0).toUpperCase() + value.slice(1)}
        />
        <Line
          type="monotone"
          dataKey="expenses"
          stroke="oklch(0.52 0.16 25)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'oklch(0.52 0.16 25)' }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke="oklch(0.48 0.12 155)"
          strokeWidth={2}
          dot={{ r: 3, fill: 'oklch(0.48 0.12 155)' }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="net"
          stroke="oklch(0.52 0.10 250)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={{ r: 3, fill: 'oklch(0.52 0.10 250)' }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const INCOME_COLOR = 'oklch(0.48 0.12 155)';

function MonthlyTrendLineChart({
  data,
  categories,
}: {
  data: Array<Record<string, number | string>>;
  categories: string[];
}) {
  const { hidden, toggle: toggleSeries, visibleCats } = useSeriesToggle(categories);

  // Strip hidden category keys from each data row so Recharts' auto-domain
  // only sees visible series. Non-category keys (month, Income) are always kept.
  const chartData = useMemo(() => {
    if (visibleCats.length === categories.length) return data;
    const catSet = new Set(categories);
    return data.map(row => {
      const r: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(row)) {
        if (!catSet.has(k) || visibleCats.includes(k)) r[k] = v as string | number;
      }
      return r;
    });
  }, [data, categories, visibleCats]);

  // Mean of visible expense totals — updates when a category is toggled off.
  const avgExpense = useMemo(() => {
    if (data.length === 0) return 0;
    const totals = data.map(row =>
      visibleCats.reduce((sum, cat) => sum + (Number(row[cat]) || 0), 0)
    );
    return totals.reduce((a, b) => a + b, 0) / totals.length;
  }, [data, visibleCats]);

  const avgIncome = useMemo(() => {
    if (data.length === 0) return 0;
    const totals = data.map(row => Number(row['Income']) || 0).filter(v => v > 0);
    return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  }, [data]);

  const legendContent = useCallback(() => (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', padding: 0, margin: 0, listStyle: 'none' }}>
      {categories.map((cat, i) => (
        <li key={cat} style={{ display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => toggleSeries(cat)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
              background: 'none', border: 'none', padding: 0, font: 'inherit',
            }}
          >
            <span style={{
              display: 'inline-block', width: 24, height: 2, flexShrink: 0,
              backgroundColor: hidden.has(cat) ? 'var(--fg-3)' : CAT_COLORS[i % CAT_COLORS.length],
            }} />
            <span style={{ color: hidden.has(cat) ? 'var(--fg-3)' : 'inherit' }}>{cat}</span>
          </button>
        </li>
      ))}
    </ul>
  ), [categories, hidden, toggleSeries]);

  return (
    <div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ left: 20, right: 16, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickFormatter={fmtMonth}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={fmtCompactEuro}
            width={44}
          />
          <Tooltip
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
            formatter={(value, name) => [fmtEUR(Number(value ?? 0), { cents: true }), name]}
            labelFormatter={(label) => fmtLongMonth(label as string)}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} content={legendContent} />
          {visibleCats.map((cat) => (
            <Line
              key={cat}
              type="monotone"
              dataKey={cat}
              stroke={CAT_COLORS[categories.indexOf(cat) % CAT_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
          {avgExpense > 0 && (
            <ReferenceLine
              y={avgExpense}
              stroke="var(--fg-3)"
              strokeDasharray="4 3"
              strokeWidth={1}
              label={{ value: `Avg ${fmtCompactEuro(avgExpense)}`, position: 'insideTopRight', fill: 'var(--fg-3)', fontSize: 10 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
      {avgIncome > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 px-2 text-[11px] text-[var(--fg-3)]">
          <span>
            <span className="font-medium" style={{ color: INCOME_COLOR }}>Income</span>
            {data.map(row => (
              Number(row['Income']) > 0 ? (
                <span key={row.month as string} className="ml-2">
                  {fmtMonth(row.month as string)}: <span className="text-[var(--foreground)]">{fmtEUR(Number(row['Income']), { cents: false })}</span>
                </span>
              ) : null
            ))}
            <span className="ml-3 opacity-60">avg {fmtCompactEuro(avgIncome)}/mo</span>
          </span>
        </div>
      )}
    </div>
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
          tickFormatter={fmtMonth}
        />
        <YAxis
          tick={{ fontSize: 10, fill: 'var(--fg-3)' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `€${Math.round(v)}`}
          width={44}
        />
        <Tooltip
          cursor={{ fill: 'var(--surface-2)' }}
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
          formatter={(value) => fmtEUR(Number(value ?? 0), { cents: true })}
          labelFormatter={(label) => fmtLongMonth(label as string)}
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

  if (rows === null) return (
    <div className="animate-pulse space-y-3 py-2">
      {[80, 60, 75, 50, 70, 55, 65, 45].map((w, i) => (
        <div key={i} className="flex items-center gap-3 py-2 border-t border-[var(--border)] first:border-t-0">
          <div className="h-4 w-12 bg-[var(--border)] rounded flex-none" />
          <div className="h-4 bg-[var(--border)] rounded flex-1" style={{ width: `${w}%` }} />
          <div className="h-5 w-24 bg-[var(--border)] rounded-full flex-none" />
          <div className="h-4 w-16 bg-[var(--border)] rounded flex-none" />
        </div>
      ))}
    </div>
  );
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
          <div key={t.id ?? idx} className="py-[10px] border-t border-[var(--border)] first:border-t-0">
            {/* Desktop layout */}
            <div className="hidden sm:grid grid-cols-[72px_1fr_auto_110px] gap-[12px] items-center">
              <div className="text-[12px] text-[var(--fg-3)] mono">{dateStr}</div>
              <div className="min-w-0 text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{t.merchant}</div>
              <span className="inline-flex items-center gap-[5px] text-[11px] font-medium text-[var(--fg-2)] bg-[oklch(0.96_0.004_260)] px-[7px] py-[3px] rounded-full">
                <span className="w-[6px] h-[6px] rounded-full" style={{ background: dotColor }} />
                {t.category || 'Uncategorized'}
              </span>
              <div className={`mono text-[13px] text-right whitespace-nowrap ${isExpense ? 'text-[oklch(0.38_0.14_25)]' : 'text-[oklch(0.32_0.09_160)]'}`}>
                {isExpense ? '−' : '+'}{fmtEUR(signed, { cents: true })}
              </div>
            </div>
            {/* Mobile layout */}
            <div className="flex sm:hidden justify-between items-start gap-3">
              <div className="min-w-0">
                <div className="text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{t.merchant}</div>
                <div className="flex items-center gap-[6px] mt-[3px]">
                  <span className="text-[11px] text-[var(--fg-3)] mono">{dateStr}</span>
                  <span className="inline-flex items-center gap-[4px] text-[10px] font-medium text-[var(--fg-2)] bg-[oklch(0.96_0.004_260)] px-[6px] py-[2px] rounded-full">
                    <span className="w-[5px] h-[5px] rounded-full" style={{ background: dotColor }} />
                    {t.category || 'Uncategorized'}
                  </span>
                </div>
              </div>
              <div className={`mono text-[13px] whitespace-nowrap flex-shrink-0 ${isExpense ? 'text-[oklch(0.38_0.14_25)]' : 'text-[oklch(0.32_0.09_160)]'}`}>
                {isExpense ? '−' : '+'}{fmtEUR(signed, { cents: true })}
              </div>
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

// ----- forecast card -----

function ForecastCard({ forecast }: { forecast: ForecastResult }) {
  const monthLabel = (() => {
    const [y, m] = forecast.forecastMonth.split('-');
    return new Date(Number(y), Number(m) - 1, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  })();

  return (
    <div className="dash-card">
      <div className="flex items-center justify-between gap-4 p-[16px_20px_12px]">
        <div>
          <h3 className="text-[13px] font-semibold m-0">Forecast: {monthLabel}</h3>
          <div className="text-[12px] text-[var(--fg-3)]">
            EMA prediction · {forecast.basedOnMonths} month{forecast.basedOnMonths !== 1 ? 's' : ''} of history
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-[11px] uppercase tracking-[.04em] text-[var(--fg-3)]">Est. total</div>
          <div className="mono text-[20px] font-semibold mt-[2px]">{fmtEUR(forecast.nextMonthTotal)}</div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-[20px] py-[8px] text-left text-[11px] font-medium text-[var(--fg-3)]">Category</th>
              <th className="px-[20px] py-[8px] text-right text-[11px] font-medium text-[var(--fg-3)]">Last month</th>
              <th className="px-[20px] py-[8px] text-right text-[11px] font-medium text-[var(--fg-3)]">Forecast</th>
              <th className="px-[20px] py-[8px] text-right text-[11px] font-medium text-[var(--fg-3)]">Trend</th>
            </tr>
          </thead>
          <tbody>
            {forecast.byCategory.slice(0, 8).map(row => (
              <tr key={row.category} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                <td className="px-[20px] py-[9px] text-[13px] text-[var(--foreground)]">{row.category}</td>
                <td className="px-[20px] py-[9px] text-right mono text-[13px] text-[var(--fg-3)]">
                  {row.lastMonthActual > 0 ? fmtEUR(row.lastMonthActual) : '—'}
                </td>
                <td className="px-[20px] py-[9px] text-right mono text-[13px] font-medium text-[var(--foreground)]">
                  {fmtEUR(row.forecast)}
                </td>
                <td className="px-[20px] py-[9px] text-right text-[12px]">
                  {row.trend === 'up' && <span style={{ color: 'var(--neg)' }}>▲</span>}
                  {row.trend === 'down' && <span style={{ color: 'var(--pos)' }}>▼</span>}
                  {row.trend === 'stable' && <span className="text-[var(--fg-3)]">—</span>}
                </td>
              </tr>
            ))}
            {forecast.byCategory.length > 8 && (
              <tr>
                <td colSpan={4} className="px-[20px] py-[8px] text-[11px] text-[var(--fg-3)] text-center">
                  +{forecast.byCategory.length - 8} more categories
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----- skeleton -----

function DashboardSkeleton() {
  return (
    <div className="space-y-[20px] animate-pulse">
      <div>
        <div className="h-7 w-32 bg-[var(--border)] rounded" />
        <div className="h-4 w-48 bg-[var(--border)] rounded mt-2" />
      </div>
      <div className="dash-card flex items-center gap-3 p-[10px_12px]">
        <div className="h-7 w-64 bg-[var(--border)] rounded" />
        <div className="h-7 w-32 bg-[var(--border)] rounded ml-4" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[20px]">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="dash-card p-[16px_18px_14px]">
            <div className="h-3 w-24 bg-[var(--border)] rounded mb-3" />
            <div className="h-7 w-32 bg-[var(--border)] rounded mb-3" />
            <div className="h-5 w-full bg-[var(--border)] rounded" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-[20px]">
        <div className="dash-card p-[20px]">
          <div className="h-4 w-40 bg-[var(--border)] rounded mb-6" />
          <div className="space-y-4">
            {[70, 55, 45, 30, 20].map(w => (
              <div key={w}>
                <div className="flex justify-between mb-1">
                  <div className="h-4 bg-[var(--border)] rounded" style={{ width: `${w}%` }} />
                  <div className="h-4 w-16 bg-[var(--border)] rounded" />
                </div>
                <div className="h-2 w-full bg-[var(--border)] rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="dash-card p-[20px]">
          <div className="h-4 w-20 bg-[var(--border)] rounded mb-6" />
          <div className="grid grid-cols-2 gap-4">
            {[0, 1, 2, 3].map(i => (
              <div key={i}>
                <div className="h-3 w-20 bg-[var(--border)] rounded mb-2" />
                <div className="h-5 w-24 bg-[var(--border)] rounded" />
                <div className="h-3 w-16 bg-[var(--border)] rounded mt-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="dash-card p-[20px]">
        <div className="h-4 w-32 bg-[var(--border)] rounded mb-6" />
        <div className="h-[280px] bg-[var(--border)] rounded" />
      </div>
    </div>
  );
}

// ----- main component -----

const DEFAULT_PRESET: Preset = 'This month';

export function DashboardStats() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initPreset: Preset = (() => {
    const p = searchParams.get('preset');
    return (PERIOD_PRESETS as readonly string[]).includes(p ?? '') ? (p as Preset) : DEFAULT_PRESET;
  })();

  const initRange = (() => {
    if (initPreset === 'Custom') {
      const from = searchParams.get('from') ?? '';
      const to = searchParams.get('to') ?? '';
      if (from && to) return { from, to };
    }
    return rangeForPreset(initPreset);
  })();

  const [preset, setPreset] = useState<Preset>(initPreset);
  const [dateFrom, setDateFrom] = useState(initRange.from);
  const [dateTo, setDateTo] = useState(initRange.to);
  const [selectedCategory, setSelectedCategory] = useState(searchParams.get('category') ?? '');
  const [chartStyle, setChartStyle] = useState<'bars' | 'donut'>(() => {
    const c = searchParams.get('chart');
    return c === 'donut' ? 'donut' : 'bars';
  });

  const [compareMode, setCompareMode] = useState<'prev' | 'yoy'>(() => {
    const c = searchParams.get('compare');
    return c === 'yoy' ? 'yoy' : 'prev';
  });

  const { categories: allCategories } = useCategories();
  const { nameForSlug } = useHouseholdMembers();
  const [data, setData] = useState<DashboardAggregation | null>(null);
  const [prevData, setPrevData] = useState<DashboardAggregation | null>(null);
  const [unfiltered, setUnfiltered] = useState<DashboardAggregation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const shouldRefresh = useRef(false);
  const [forecast, setForecast] = useState<ForecastResult | null>(null);
  const [recurringMonthly, setRecurringMonthly] = useState<number | null>(null);

  const compareRange = useMemo(
    () => compareMode === 'yoy' ? yoyRange(dateFrom, dateTo) : previousRange(dateFrom, dateTo),
    [compareMode, dateFrom, dateTo],
  );

  // Apply preset → update dates
  useEffect(() => {
    if (preset === 'Custom') return;
    const r = rangeForPreset(preset);
    setDateFrom(r.from);
    setDateTo(r.to);
  }, [preset]);

  // Fetch forecast + recurring total once on mount
  useEffect(() => {
    fetch('/api/forecast')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setForecast(d); })
      .catch(() => {});
    fetch('/api/transactions/recurring')
      .then(r => r.ok ? r.json() : null)
      .then((d: { totalMonthly: number } | null) => { if (d) setRecurringMonthly(d.totalMonthly); })
      .catch(() => {});
  }, []);

  // Fetch unfiltered (for category dropdown + uncategorized count)
  useEffect(() => {
    (async () => {
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        if (shouldRefresh.current) params.set('refresh', '1');
        const res = await fetch(`/api/dashboard?${params}`);
        if (res.ok) setUnfiltered(await res.json());
      } catch (e) { console.error(e); }
    })();
  }, [dateFrom, dateTo, refreshNonce]);

  // Fetch filtered + comparison-period for deltas
  useEffect(() => {
    (async () => {
      setLoading(true);
      const isRefresh = shouldRefresh.current;
      if (isRefresh) shouldRefresh.current = false;
      try {
        const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
        if (selectedCategory) params.set('category', selectedCategory);
        if (isRefresh) params.set('refresh', '1');

        const prevParams = new URLSearchParams({ date_from: compareRange.from, date_to: compareRange.to });
        if (selectedCategory) prevParams.set('category', selectedCategory);
        if (isRefresh) prevParams.set('refresh', '1');

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
        setRefreshing(false);
      }
    })();
  }, [dateFrom, dateTo, selectedCategory, compareRange, refreshNonce]);

  const byCategoryPrevMap = useMemo(() => {
    const m: Record<string, number> = {};
    prevData?.byCategory.forEach(c => { m[c.category] = c.amount; });
    return m;
  }, [prevData]);

  const monthlyAverage = useMemo(() => {
    if (!data || !data.byMonth.length) return 0;
    return data.totalExpenses / data.byMonth.length;
  }, [data]);

  const dailyAverage = useMemo(() => {
    if (!data || !data.byDay.length) return 0;
    return data.totalExpenses / data.byDay.length;
  }, [data]);

  // Sync filter state to URL so the view is shareable / survives refresh
  useEffect(() => {
    const params = new URLSearchParams();
    if (preset !== DEFAULT_PRESET) params.set('preset', preset);
    if (preset === 'Custom') {
      params.set('from', dateFrom);
      params.set('to', dateTo);
    }
    if (selectedCategory) params.set('category', selectedCategory);
    if (compareMode !== 'prev') params.set('compare', compareMode);
    if (chartStyle !== 'bars') params.set('chart', chartStyle);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : '/', { scroll: false });
  }, [preset, dateFrom, dateTo, selectedCategory, compareMode, chartStyle, router]);

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

  // Categories for the trend chart: union of all categories seen across all months.
  // displayCategories only covers the current period's top categories; byCategoryMonth
  // may include categories from earlier months that aren't in the latest slice.
  const trendCategories = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    for (const row of data.byCategoryMonth) {
      for (const key of Object.keys(row)) {
        if (key !== 'month') seen.add(key);
      }
    }
    const current = data.byCategory.map(c => c.category);
    return current.filter(c => seen.has(c))
      .concat([...seen].filter(c => !current.includes(c)));
  }, [data]);

  // Monthly trend line chart: byCategoryMonth with Income merged in
  const monthlyTrendData = useMemo(() => {
    if (!data) return [];
    const incomeByMonth: Record<string, number> = {};
    for (const { month, amount } of data.byMonthIncome) {
      incomeByMonth[month] = amount;
    }
    return data.byCategoryMonth.map(row => ({
      ...row,
      Income: incomeByMonth[row.month as string] ?? 0,
    }));
  }, [data]);

  // Income vs expenses trend data: merged per month
  const incomeTrendData = useMemo(() => {
    if (!data) return [];
    const expensesByMonth: Record<string, number> = {};
    for (const { month, amount } of data.byMonth) expensesByMonth[month] = amount;
    const incomeByMonth: Record<string, number> = {};
    for (const { month, amount } of (data.byMonthIncome ?? [])) incomeByMonth[month] = amount;
    const allMonths = Array.from(new Set([
      ...Object.keys(expensesByMonth),
      ...Object.keys(incomeByMonth),
    ])).sort();
    return allMonths.map(month => ({
      month,
      expenses: expensesByMonth[month] ?? 0,
      income: incomeByMonth[month] ?? 0,
      net: (incomeByMonth[month] ?? 0) - (expensesByMonth[month] ?? 0),
    }));
  }, [data]);

  if (loading && !data) return <DashboardSkeleton />;
  if (!data) return <div className="text-center py-8 text-[var(--fg-3)]">No data available</div>;

  // Build donut chart data (top 5 + Other)
  const donutData = (() => {
    const top = data.byCategory.slice(0, 5);
    const otherAmount = data.byCategory.slice(5).reduce((s, c) => s + c.amount, 0);
    return otherAmount > 0 ? [...top, { category: 'Other', amount: otherAmount }] : top;
  })();

  const prevTotalExpenses = prevData?.totalExpenses ?? 0;
  const prevTotalIncome = prevData?.totalIncome ?? 0;
  const prevTotalInvestments = prevData?.totalInvestments ?? 0;
  const prevTotalInternalTransfers = prevData?.totalInternalTransfers ?? 0;
  const prevTotalReimbursements = prevData?.totalReimbursements ?? 0;
  const prevNet = prevData?.net ?? 0;
  const prevTxCount = prevData?.transactionCount ?? 0;

  const sparkExpenses = [prevTotalExpenses || data.totalExpenses, data.totalExpenses];
  const sparkIncome = [prevTotalIncome || data.totalIncome, data.totalIncome];
  const sparkInvestments = [prevTotalInvestments || data.totalInvestments, data.totalInvestments];
  const sparkTransfers = [prevTotalInternalTransfers || data.totalInternalTransfers, data.totalInternalTransfers];
  const sparkReimb = [prevTotalReimbursements || data.totalReimbursements, data.totalReimbursements];
  const sparkNet = [prevNet || data.net, data.net];
  const sparkTx = [prevTxCount || data.transactionCount, data.transactionCount];

  const savingsRate = data.totalIncome > 0
    ? Math.round((data.totalInvestments / data.totalIncome) * 100)
    : 0;

  const displayCategories = data.byCategory.map(c => c.category);

  // When filtering to 'Investments', byCategory already contains those rows —
  // skip the re-injection to avoid doubling the amount in guidelines/budgets.
  const investmentsInjection: Record<string, number> = data.totalInvestments > 0 && selectedCategory !== 'Investments'
    ? { Investments: data.totalInvestments }
    : {};

  return (
    <div className="space-y-[20px]">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] m-0">Dashboard</h1>
          <div className="text-[13px] text-[var(--fg-3)] mt-[2px]">
            {labelForRange(dateFrom, dateTo)}
            {prevData && ` · ${compareMode === 'yoy' ? 'YoY vs' : 'compared to'} ${labelForRange(compareRange.from, compareRange.to)}`}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {unfiltered && unfiltered.uncategorizedCount > 0 && !selectedCategory && (
            <span className="warn-pill">
              <span className="dot" />
              {unfiltered.uncategorizedCount} transaction{unfiltered.uncategorizedCount === 1 ? '' : 's'} need a category
            </span>
          )}
          {recurringMonthly !== null && recurringMonthly > 0 && (
            <a href="/transactions/recurring" className="dash-chip neutral text-[11px] hover:bg-[var(--border)]">
              ~{fmtEUR(recurringMonthly)}/mo recurring
            </a>
          )}
        </div>
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
          {allCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="w-px h-5 bg-[var(--border)] mx-[4px]" />
        <span className="tool-label mr-[4px]">Compare</span>
        <div className="seg">
          <button className={compareMode === 'prev' ? 'active' : ''} onClick={() => setCompareMode('prev')}>Prev period</button>
          <button className={compareMode === 'yoy' ? 'active' : ''} onClick={() => setCompareMode('yoy')}>Year ago</button>
        </div>
        <div className="ml-auto flex gap-[6px]">
          <button
            type="button"
            disabled={refreshing}
            onClick={() => {
              shouldRefresh.current = true;
              setRefreshing(true);
              setRefreshNonce(n => n + 1);
            }}
            className="btn-ghost print:hidden"
            title="Force-refresh from database, bypassing the 5-min cache"
          >
            {refreshing ? '↻ Refreshing…' : '↻ Refresh'}
          </button>
          <a href="/api/export" className="btn-ghost print:hidden">Export CSV</a>
          <button
            type="button"
            onClick={() => window.print()}
            className="btn-ghost print:hidden"
          >
            Print report
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[20px]">
        <KPI
          label="Total expenses"
          value={fmtEUR(data.totalExpenses, { cents: true })}
          curr={data.totalExpenses}
          prev={prevTotalExpenses}
          goodWhenDown
          sparkData={sparkExpenses}
          sparkColor="var(--neg)"
          vsLabel={compareMode === 'yoy' ? 'year ago' : 'prev'}
        />
        <KPI
          label="Total income"
          value={fmtEUR(data.totalIncome, { cents: true })}
          curr={data.totalIncome}
          prev={prevTotalIncome}
          goodWhenDown={false}
          sparkData={sparkIncome}
          sparkColor="var(--pos)"
          valueColor="oklch(0.38 0.10 160)"
          vsLabel={compareMode === 'yoy' ? 'year ago' : 'prev'}
        />
        {data.totalReimbursements > 0 && (
          <KPI
            label="Reimbursed"
            value={fmtEUR(data.totalReimbursements, { cents: true })}
            curr={data.totalReimbursements}
            prev={prevTotalReimbursements}
            goodWhenDown={false}
            sparkData={sparkReimb}
            sparkColor="oklch(0.55 0.10 175)"
            valueColor="oklch(0.38 0.10 175)"
            vsLabel={compareMode === 'yoy' ? 'year ago' : 'prev'}
          />
        )}
        <KPI
          label="Net out-of-pocket"
          value={fmtEUR(data.net, { cents: true })}
          curr={data.net}
          prev={prevNet}
          goodWhenDown={false}
          sparkData={sparkNet}
          sparkColor={data.net >= 0 ? 'var(--pos)' : 'var(--neg)'}
          valueColor={data.net >= 0 ? 'oklch(0.38 0.10 160)' : 'oklch(0.42 0.14 25)'}
          vsLabel={compareMode === 'yoy' ? 'year ago' : 'prev'}
        />
        <KPI
          label={`Investments${savingsRate > 0 ? ` · ${savingsRate}% saved` : ''}`}
          value={fmtEUR(data.totalInvestments, { cents: true })}
          curr={data.totalInvestments}
          prev={prevTotalInvestments}
          goodWhenDown={false}
          sparkData={sparkInvestments}
          sparkColor="oklch(0.55 0.10 225)"
          valueColor="oklch(0.38 0.10 225)"
          vsLabel={compareMode === 'yoy' ? 'year ago' : 'prev'}
        />
        {data.totalInternalTransfers > 0 && (
          <KPI
            label="Internal transfers"
            value={fmtEUR(data.totalInternalTransfers, { cents: true })}
            curr={data.totalInternalTransfers}
            prev={prevTotalInternalTransfers}
            goodWhenDown={false}
            neutral
            sparkData={sparkTransfers}
            sparkColor="oklch(0.55 0.10 280)"
            valueColor="oklch(0.38 0.10 280)"
            vsLabel={compareMode === 'yoy' ? 'year ago' : 'prev'}
          />
        )}
        <KPI
          label="Transactions"
          value={String(data.transactionCount)}
          curr={data.transactionCount}
          prev={prevTxCount}
          goodWhenDown={false}
          sparkData={sparkTx}
          sparkColor="var(--accent)"
          vsLabel={compareMode === 'yoy' ? 'year ago' : 'prev'}
        />
      </div>

      {/* Capital movements footnote — only visible when investments or transfers exist */}
      {(data.totalInvestments > 0 || data.totalInternalTransfers > 0) && (
        <div className="dash-card p-[10px_16px] flex flex-wrap items-center gap-x-[20px] gap-y-[4px] text-[12px] text-[var(--fg-3)]">
          <span className="font-medium text-[var(--fg-2)]">Capital movements (excluded from totals)</span>
          {data.totalInvestments > 0 && (
            <span>Investments deployed: <span className="mono font-medium text-[oklch(0.38_0.10_225)]">{fmtEUR(data.totalInvestments)}</span></span>
          )}
          {data.totalInternalTransfers > 0 && (
            <span>Internal transfers: <span className="mono font-medium text-[oklch(0.38_0.10_280)]">{fmtEUR(data.totalInternalTransfers)}</span></span>
          )}
          {data.totalInvestments > 0 && (
            <span>
              Activity net (incl. investments):{' '}
              <span className={`mono font-medium ${data.net - data.totalInvestments >= 0 ? 'text-[oklch(0.38_0.10_160)]' : 'text-[oklch(0.42_0.14_25)]'}`}>
                {fmtEUR(data.net - data.totalInvestments)}
              </span>
            </span>
          )}
        </div>
      )}

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
              <div className="text-center py-8 text-[var(--fg-3)] text-[13px]">No expenses in this period. <a href="/upload" className="text-[var(--fg-2)] underline">Upload transactions →</a></div>
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
                        {donutData.map((entry, i) => (
                          <Cell
                            key={i}
                            fill={CAT_COLORS[i % CAT_COLORS.length]}
                            style={{ cursor: 'pointer' }}
                            onClick={() => setSelectedCategory(entry.category === selectedCategory ? '' : entry.category)}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => fmtEUR(Number(value ?? 0), { cents: true })} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <CategoryBarList byCategory={data.byCategory} byCategoryPrev={byCategoryPrevMap} total={data.totalExpenses} onCategoryClick={(cat) => setSelectedCategory(cat === selectedCategory ? '' : cat)} />
              </div>
            ) : (
              <CategoryBarList byCategory={data.byCategory} byCategoryPrev={byCategoryPrevMap} total={data.totalExpenses} onCategoryClick={(cat) => setSelectedCategory(cat === selectedCategory ? '' : cat)} />
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
              sub={data.byCategory[0] ? fmtEUR(data.byCategory[0].amount, { cents: true }) : '—'}
            />
            <InsightTile
              label="Largest transaction"
              value={data.topTransaction?.merchant || '—'}
              sub={data.topTransaction ? `${fmtEUR(data.topTransaction.amount, { cents: true })} · ${data.topTransaction.category}` : '—'}
            />
            <InsightTile
              label="Monthly average"
              value={fmtEUR(monthlyAverage, { cents: true })}
              sub={`Over ${data.byMonth.length} ${data.byMonth.length === 1 ? 'month' : 'months'}`}
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
              <div className="col-span-2 grid grid-cols-2 sm:grid-cols-3 items-end pt-[4px] gap-[12px]">
                {Object.entries(data.byAccount).map(([a, v]) => (
                  <div key={a} className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[.04em] text-[var(--fg-3)] overflow-hidden text-ellipsis whitespace-nowrap">{a}</div>
                    <div className="mono text-[15px] font-medium mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">{fmtEUR(v, { cents: true })}</div>
                  </div>
                ))}
              </div>
            )}
            {data.byPerson.length > 0 && (
              <div className="col-span-2 grid grid-cols-2 sm:grid-cols-3 items-end pt-[4px] gap-[12px] border-t border-[var(--border)] mt-[4px]">
                {data.byPerson.map(({ person, amount }) => (
                  <div key={person} className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[.04em] text-[var(--fg-3)] overflow-hidden text-ellipsis whitespace-nowrap">
                      {nameForSlug(person)}
                    </div>
                    <div className="mono text-[15px] font-medium mt-[2px] overflow-hidden text-ellipsis whitespace-nowrap">{fmtEUR(amount, { cents: true })}</div>
                  </div>
                ))}
              </div>
            )}
            {data.byIncomeSource.length > 0 && (
              <div className="col-span-2 border-t border-[var(--border)] mt-[4px] pt-[12px]">
                <div className="text-[11px] uppercase tracking-[.04em] text-[var(--fg-3)] mb-[8px]">Income sources</div>
                <div className="flex flex-col gap-[6px]">
                  {data.byIncomeSource.map(({ merchant, amount }) => (
                    <div key={merchant} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-[12px] text-[var(--foreground)] overflow-hidden text-ellipsis whitespace-nowrap">{merchant}</span>
                      <span className="mono text-[12px] font-medium text-[var(--pos)] flex-shrink-0">+{fmtEUR(amount)}</span>
                    </div>
                  ))}
                </div>
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
            Daily avg <span className="mono text-[var(--foreground)]">{fmtEUR(dailyAverage)}</span>
          </div>
        </div>
        <div className="p-[0_12px_12px]">
          {data.byDay.length > 0 ? (
            <DailyChart data={data.byDay} categories={displayCategories} />
          ) : (
            <div className="text-center py-8 text-[var(--fg-3)] text-[13px]">No expenses in this period. <a href="/upload" className="text-[var(--fg-2)] underline">Upload transactions →</a></div>
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

      {/* Category trend by month */}
      {data.byCategoryMonth.length > 1 && (
        <div className="dash-card">
          <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
            <div>
              <h3 className="text-[13px] font-semibold m-0">Category trend</h3>
              <div className="text-[12px] text-[var(--fg-3)]">Spending by category per month</div>
            </div>
          </div>
          <div className="p-[0_12px_4px]">
            <CategoryTrendChart data={data.byCategoryMonth} categories={trendCategories} />
            {data.byCategory.length > 0 && (
              <div className="flex flex-wrap gap-[10px] mt-[4px] mb-[12px] px-[8px] text-[11px] text-[var(--fg-2)]">
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
      )}

      {/* Monthly trend — line chart per category + income */}
      {monthlyTrendData.length > 1 && (
        <div className="dash-card">
          <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
            <div>
              <h3 className="text-[13px] font-semibold m-0">Monthly trends</h3>
              <div className="text-[12px] text-[var(--fg-3)]">Expense per category and income — click legend to toggle</div>
            </div>
          </div>
          <div className="p-[0_12px_12px]">
            <MonthlyTrendLineChart data={monthlyTrendData} categories={trendCategories} />
          </div>
        </div>
      )}

      {/* Income vs Expenses trend */}
      {data.byMonth.length > 1 && (
        <div className="dash-card">
          <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
            <div>
              <h3 className="text-[13px] font-semibold m-0">Income vs Expenses</h3>
              <div className="text-[12px] text-[var(--fg-3)]">Monthly income, expenses, and net savings</div>
            </div>
          </div>
          <div className="p-[0_12px_12px]">
            <IncomeTrendChart trendData={incomeTrendData} />
          </div>
        </div>
      )}

      {/* Forecast */}
      {forecast && <ForecastCard forecast={forecast} />}

      {/* Net Worth */}
      <NetWorthCard />
      <NetWorthChart />

      {/* Spending Guidelines */}
      <GuidelinePanel
        spentByCategory={{
          ...Object.fromEntries(data.byCategory.map(c => [c.category, c.amount])),
          ...investmentsInjection,
        }}
        totalExpenses={data.totalExpenses + (investmentsInjection.Investments ?? 0)}
      />

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
