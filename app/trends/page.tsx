'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from 'recharts';
import { fmtEUR } from '@/lib/utils';
import { shiftMonth } from '@/lib/services/stats';
import type { DashboardAggregation } from '@/lib/types';

const YOY_COLOR = 'oklch(0.70 0.05 60)';
const MOVING_AVG_COLOR = 'oklch(0.55 0.10 225)';

// Same up/down convention as the dashboard's Delta component: for spending, up is bad
// (red), down is good (green) — consistent across the app.
function YoyDelta({ curr, prev }: { curr: number; prev: number }) {
  if (!prev) return <span className="text-[12px] text-[var(--fg-3)]">—</span>;
  const d = ((curr - prev) / prev) * 100;
  const flat = Math.abs(d) < 0.05;
  const up = d > 0;
  const cls = flat ? 'text-[var(--fg-3)]' : up ? 'text-[oklch(0.38_0.14_25)]' : 'text-[oklch(0.32_0.09_160)]';
  const arrow = flat ? '·' : up ? '▲' : '▼';
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] ${cls} whitespace-nowrap`}>
      <span className="text-[9px]">{arrow}</span>
      <span className="mono">{flat ? '0%' : `${up ? '+' : ''}${d.toFixed(0)}%`}</span>
    </span>
  );
}

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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1)
    .toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export default function TrendsPage() {
  const [data, setData] = useState<DashboardAggregation | null>(null);
  const [prevYearData, setPrevYearData] = useState<DashboardAggregation | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [showYoyLine, setShowYoyLine] = useState(false);
  const [showMovingAvg, setShowMovingAvg] = useState(false);

  useEffect(() => {
    const now = new Date();
    const dateFrom = new Date(now.getFullYear() - 1, now.getMonth() + 1, 1);
    const dateTo = now;
    // The 12 months immediately preceding the displayed window, for the "vs last year"
    // column and the optional YoY overlay line.
    const prevDateTo = new Date(dateFrom);
    prevDateTo.setDate(prevDateTo.getDate() - 1);
    const prevDateFrom = new Date(dateFrom.getFullYear() - 1, dateFrom.getMonth(), 1);

    Promise.all([
      fetch(`/api/dashboard?date_from=${isoDate(dateFrom)}&date_to=${isoDate(dateTo)}`).then(r => r.ok ? r.json() : null),
      // Isolated from the main fetch: a transient failure of the prior-year request alone
      // should only disable the YoY feature, not hide valid current-year data behind the
      // "not enough data" fallback.
      fetch(`/api/dashboard?date_from=${isoDate(prevDateFrom)}&date_to=${isoDate(prevDateTo)}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([d, prevD]) => {
        if (d) {
          setData(d);
          // Default: show all categories
          const cats = new Set<string>(
            d.byCategoryMonth.flatMap((row: Record<string, number | string>) =>
              Object.keys(row).filter(k => k !== 'month')
            )
          );
          setSelectedCategories(cats);
        }
        if (prevD) setPrevYearData(prevD);
      })
      .finally(() => setLoading(false));
  }, []);

  const allCategories = useMemo(() => {
    if (!data) return [];
    const cats = new Set<string>();
    for (const row of data.byCategoryMonth) {
      for (const k of Object.keys(row)) {
        if (k !== 'month') cats.add(k);
      }
    }
    return [...cats].sort((a, b) => {
      const totalA = data.byCategoryMonth.reduce((s, r) => s + (Number(r[a]) || 0), 0);
      const totalB = data.byCategoryMonth.reduce((s, r) => s + (Number(r[b]) || 0), 0);
      return totalB - totalA;
    });
  }, [data]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  if (loading) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="dash-card p-5 animate-pulse">
        <div className="h-6 w-40 bg-[var(--border)] rounded mb-4" />
        <div className="h-[320px] bg-[var(--border)] rounded" />
      </div>
    </div>
  );

  if (!data || data.byCategoryMonth.length < 2) return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="dash-card p-8 text-center text-[13px] text-[var(--fg-3)]">
        Not enough data for trends. Upload at least 2 months of transactions.{' '}
        <a href="/upload" className="text-[var(--fg-2)] underline">Upload transactions →</a>
      </div>
    </div>
  );

  const displayed = allCategories.filter(c => selectedCategories.has(c));

  const refundsByMonth = new Map((data.refundsByMonth ?? []).map(r => [r.month, r.amount]));
  const hasRefunds = refundsByMonth.size > 0;

  // byMonth/byCategoryMonth are sparse — only months with a qualifying transaction get a
  // row — so both the moving average and the YoY lookup key off the actual calendar-month
  // string (via shiftMonth), never off array position, to stay correct across gaps.
  const totalByMonthMap = new Map(data.byMonth.map(m => [m.month, m.amount]));
  const prevYearTotalByMonthMap = new Map((prevYearData?.byMonth ?? []).map(m => [m.month, m.amount]));
  const hasPrevYear = prevYearTotalByMonthMap.size > 0;

  const movingAvg3 = (month: string) => {
    const months = [shiftMonth(month, -2), shiftMonth(month, -1), month];
    const values = months.map(m => totalByMonthMap.get(m)).filter((v): v is number => v !== undefined);
    return values.length ? values.reduce((s, v) => s + v, 0) / values.length : undefined;
  };

  // Union of months, not just byCategoryMonth's months — a refund posted in a month with
  // no category spend at all would otherwise be silently dropped instead of shown.
  const byMonth = new Map(data.byCategoryMonth.map(row => [String(row.month), row]));
  for (const month of refundsByMonth.keys()) {
    if (!byMonth.has(month)) byMonth.set(month, { month });
  }
  const chartData = [...byMonth.keys()].sort().map(month => ({
    ...byMonth.get(month),
    ...(hasRefunds ? { refunds: -(refundsByMonth.get(month) ?? 0) } : {}),
    ...(showMovingAvg ? { movingAvg: movingAvg3(month) } : {}),
    ...(showYoyLine ? { lastYear: prevYearTotalByMonthMap.get(shiftMonth(month, -12)) } : {}),
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h2 className="text-[20px] font-semibold">Spending Trends</h2>
        <p className="text-[13px] text-[var(--fg-2)] mt-1">12-month breakdown by category</p>
      </div>

      {/* Category selector */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedCategories(new Set(allCategories))}
          className="px-3 py-1 text-xs font-medium rounded-full border border-border-soft text-fg-2 hover:bg-surface-2"
        >
          All
        </button>
        {allCategories.map((cat, i) => (
          <button
            key={cat}
            type="button"
            onClick={() => toggleCategory(cat)}
            className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
              selectedCategories.has(cat)
                ? 'border-transparent text-white'
                : 'border-border-soft text-fg-3 hover:bg-surface-2'
            }`}
            style={selectedCategories.has(cat) ? { background: CAT_COLORS[i % CAT_COLORS.length] } : undefined}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main stacked bar chart */}
      <div className="dash-card">
        <div className="flex items-center justify-between gap-3 flex-wrap p-[16px_20px_12px]">
          <div>
            <h3 className="text-[13px] font-semibold m-0">Monthly spending by category</h3>
            <div className="text-[12px] text-[var(--fg-3)]">Stacked — last 12 months</div>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[var(--fg-2)]">
              <input type="checkbox" checked={showYoyLine} onChange={e => setShowYoyLine(e.target.checked)} disabled={!hasPrevYear} />
              Last year
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-[var(--fg-2)]">
              <input type="checkbox" checked={showMovingAvg} onChange={e => setShowMovingAvg(e.target.checked)} />
              3-mo avg
            </label>
          </div>
        </div>
        <div className="p-[0_12px_16px]">
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} margin={{ left: 20, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
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
                width={48}
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
                labelFormatter={(m) => fmtMonth(String(m))}
                formatter={(value, name) => [fmtEUR(Number(value ?? 0), { cents: true }), name]}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              />
              {displayed.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  name={cat}
                  stackId="a"
                  fill={CAT_COLORS[allCategories.indexOf(cat) % CAT_COLORS.length]}
                  radius={i === displayed.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
              {hasRefunds && (
                <Bar dataKey="refunds" name="Refunds" stackId="a" fill="var(--fg-3)" fillOpacity={0.5} radius={[0, 0, 3, 3]} />
              )}
              {showYoyLine && hasPrevYear && (
                <Line type="monotone" dataKey="lastYear" name="Last year" stroke={YOY_COLOR} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls />
              )}
              {showMovingAvg && (
                <Line type="monotone" dataKey="movingAvg" name="3-mo avg" stroke={MOVING_AVG_COLOR} strokeWidth={2} dot={false} connectNulls />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-category totals table */}
      <div className="dash-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 text-left text-[11px] font-medium text-[var(--fg-3)]">Category</th>
              {data.byCategoryMonth.map(row => (
                <th key={String(row.month)} className="px-3 py-3 text-right text-[11px] font-medium text-[var(--fg-3)] whitespace-nowrap">
                  {fmtMonth(String(row.month))}
                </th>
              ))}
              <th className="px-5 py-3 text-right text-[11px] font-medium text-[var(--fg-3)]">12-mo total</th>
              {hasPrevYear && (
                <th className="px-5 py-3 text-right text-[11px] font-medium text-[var(--fg-3)]">vs last year</th>
              )}
            </tr>
          </thead>
          <tbody>
            {displayed.map((cat) => {
              const total = data.byCategoryMonth.reduce((s, r) => s + (Number(r[cat]) || 0), 0);
              const prevTotal = prevYearData?.byCategoryMonth.reduce((s, r) => s + (Number(r[cat]) || 0), 0) ?? 0;
              return (
                <tr key={cat} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="px-5 py-2.5">
                    <span className="inline-flex items-center gap-2 text-[12px] font-medium text-[var(--foreground)]">
                      <span
                        className="w-[8px] h-[8px] rounded-[2px] flex-none"
                        style={{ background: CAT_COLORS[allCategories.indexOf(cat) % CAT_COLORS.length] }}
                      />
                      {cat}
                    </span>
                  </td>
                  {data.byCategoryMonth.map(row => (
                    <td key={String(row.month)} className="px-3 py-2.5 text-right text-[12px] mono text-[var(--fg-2)]">
                      {Number(row[cat]) > 0 ? fmtEUR(Number(row[cat])) : '—'}
                    </td>
                  ))}
                  <td className="px-5 py-2.5 text-right text-[13px] mono font-semibold text-[var(--foreground)]">
                    {fmtEUR(total)}
                  </td>
                  {hasPrevYear && (
                    <td className="px-5 py-2.5 text-right">
                      <YoyDelta curr={total} prev={prevTotal} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
