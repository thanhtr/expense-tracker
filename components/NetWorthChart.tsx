'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { fmtEUR } from '@/lib/utils';

interface HistoryPoint {
  month: string;
  assets: number;
  liabilities: number;
  netWorth: number;
}

function fmtMonth(m: string) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

export function NetWorthChart() {
  const [data, setData] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/assets?history=1')
      .then(r => r.ok ? r.json() : [])
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="dash-card p-5 animate-pulse">
      <div className="h-[180px] bg-[var(--border)] rounded" />
    </div>
  );

  if (data.length < 2) return null;

  return (
    <div className="dash-card">
      <div className="p-[16px_20px_12px]">
        <h3 className="text-[13px] font-semibold m-0">Net worth history</h3>
        <div className="text-[12px] text-[var(--fg-3)]">Assets, liabilities and net worth over time</div>
      </div>
      <div className="p-[0_12px_16px]">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ left: 20, right: 16, top: 8, bottom: 8 }}>
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
              tickFormatter={(v: number) => `€${Math.round(v / 1000)}k`}
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
              labelFormatter={(m) => fmtMonth(String(m))}
              formatter={(value) => fmtEUR(Number(value ?? 0))}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(v) => v === 'netWorth' ? 'Net worth' : v.charAt(0).toUpperCase() + v.slice(1)}
            />
            <Line type="monotone" dataKey="assets" stroke="oklch(0.60 0.09 155)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="liabilities" stroke="oklch(0.42 0.14 25)" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="netWorth" stroke="oklch(0.55 0.10 225)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
