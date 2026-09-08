'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fmtEUR } from '@/lib/utils';
import { ASSET_TYPES } from '@/lib/constants';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface Asset {
  id: number;
  name: string;
  type: string;
  balance: number;
  recordedAt: string;
}

type AssetType = typeof ASSET_TYPES[number];

const TYPE_LABELS: Record<AssetType, string> = {
  bank: 'Bank',
  investment: 'Investment',
  property: 'Property',
  crypto: 'Crypto',
  liability: 'Liability',
};

const TYPE_COLORS: Record<AssetType, string> = {
  bank: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  investment: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  property: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  crypto: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  liability: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

export function NetWorthCard() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ month: string; netWorth: number }[]>([]);

  useEffect(() => {
    fetch('/api/assets')
      .then(r => r.ok ? r.json() : [])
      .then(setAssets)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!showHistory) return;
    fetch('/api/assets?history=1')
      .then(r => r.ok ? r.json() : [])
      .then((data: { month: string; netWorth: number }[]) => setHistory(data))
      .catch(() => {});
  }, [showHistory]);

  const totalAssets = assets.filter(a => a.type !== 'liability').reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = assets.filter(a => a.type === 'liability').reduce((s, a) => s + Math.abs(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div className="dash-card">
      <button
        type="button"
        className="flex items-center justify-between gap-3 p-[16px_20px_12px] w-full text-left"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-[13px] font-semibold m-0">Net Worth</h3>
            <div className="text-[12px] text-[var(--fg-3)]">Assets &amp; liabilities snapshot</div>
          </div>
          <button
            type="button"
            onClick={e => { e.stopPropagation(); setShowHistory(h => !h); if (!expanded) setExpanded(true); }}
            className={`text-[11px] px-[7px] py-[2px] rounded-full border transition-colors ${showHistory ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-700' : 'border-border-soft text-[var(--fg-3)] hover:text-[var(--fg-2)] hover:border-[var(--fg-3)]'}`}
          >
            History
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`mono text-[16px] font-semibold ${netWorth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {fmtEUR(netWorth)}
            </div>
            {assets.length > 0 && (
              <div className="text-[11px] text-[var(--fg-3)]">
                {fmtEUR(totalAssets)} assets − {fmtEUR(totalLiabilities)} liabilities
              </div>
            )}
          </div>
          <svg
            className={`w-4 h-4 text-[var(--fg-3)] transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="p-[0_20px_20px] space-y-[14px]">
          {assets.length === 0 ? (
            <div className="text-[13px] text-[var(--fg-3)] py-2">
              No assets recorded yet.{' '}
              <Link href="/settings?tab=assets" className="underline hover:text-[var(--fg-2)]">
                Add assets in Settings
              </Link>{' '}
              to track your net worth.
            </div>
          ) : (
            assets.map(a => {
              const typeKey = a.type as AssetType;
              return (
                <div key={a.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-[6px] flex-1 min-w-0">
                    <span className={`text-[10px] px-[5px] py-[1px] rounded-full font-medium shrink-0 ${TYPE_COLORS[typeKey] ?? ''}`}>
                      {TYPE_LABELS[typeKey] ?? a.type}
                    </span>
                    <span className="min-w-0 text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{a.name}</span>
                  </div>
                  <span className={`mono text-[13px] ${a.type === 'liability' ? 'text-red-600 dark:text-red-400' : 'text-[var(--fg-2)]'}`}>
                    {a.type === 'liability' ? '−' : ''}{fmtEUR(Math.abs(a.balance))}
                  </span>
                </div>
              );
            })
          )}

          {showHistory && (
            <div className="pt-[8px] border-t border-border-soft">
              <div className="text-[12px] font-medium text-[var(--fg-2)] mb-[8px]">Net worth over time</div>
              {history.length < 2 ? (
                <div className="text-[12px] text-[var(--fg-3)] py-2">
                  Not enough history yet — update asset balances in{' '}
                  <Link href="/settings?tab=assets" className="underline hover:text-[var(--fg-2)]">Settings</Link>{' '}
                  to build a trend.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => {
                        const parts = String(v).split('-');
                        const year = parts[0] ?? '';
                        const mon = parts[1] ?? '';
                        return `${mon}/${year.slice(2)}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `€${(Number(v) / 1000).toFixed(0)}k`}
                      width={45}
                    />
                    <Tooltip
                      formatter={(value) => fmtEUR(Number(value ?? 0))}
                      labelFormatter={(label) => String(label)}
                    />
                    <Line
                      type="monotone"
                      dataKey="netWorth"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#10b981' }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          <div className="pt-1 border-t border-border-soft">
            <Link href="/settings?tab=assets" className="text-[12px] text-[var(--fg-3)] hover:text-[var(--fg-2)]">
              Manage assets in Settings →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
