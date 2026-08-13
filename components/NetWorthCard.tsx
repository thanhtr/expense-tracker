'use client';

import { useEffect, useState } from 'react';
import { fmtEUR, today } from '@/lib/utils';
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
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<{ month: string; netWorth: number }[]>([]);

  // Form state
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<AssetType>('bank');
  const [newBalance, setNewBalance] = useState('');
  const [newDate, setNewDate] = useState(today());

  // Edit state
  const [editBalance, setEditBalance] = useState('');

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

  const handleAdd = async () => {
    if (!newName.trim() || !newBalance || !newDate) return;
    setSaving(true);
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          balance: parseFloat(newBalance),
          recordedAt: newDate,
        }),
      });
      if (res.ok) {
        const a = await res.json() as Asset;
        setAssets(prev => [...prev, a].sort((x, y) => x.type.localeCompare(y.type) || x.name.localeCompare(y.name)));
        setAdding(false);
        setNewName(''); setNewBalance(''); setNewDate(today()); setNewType('bank');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateBalance = async (id: number) => {
    const balance = parseFloat(editBalance);
    if (isNaN(balance)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/assets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance, recordedAt: today() }),
      });
      if (res.ok) {
        const a = await res.json() as Asset;
        setAssets(prev => prev.map(x => x.id === id ? a : x));
        setEditingId(null);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Remove this asset?')) return;
    try {
      const res = await fetch(`/api/assets/${id}`, { method: 'DELETE' });
      if (res.ok) setAssets(prev => prev.filter(x => x.id !== id));
    } catch { /* leave unchanged */ }
  };

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
          {assets.length === 0 && !adding && (
            <div className="text-[13px] text-[var(--fg-3)] py-2">
              No assets recorded. Click &quot;+ Add asset&quot; to track your net worth.
            </div>
          )}

          {assets.map(a => {
            const typeKey = a.type as AssetType;
            const isEditing = editingId === a.id;
            return (
              <div key={a.id} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-[6px] flex-1 min-w-0">
                  <span className={`text-[10px] px-[5px] py-[1px] rounded-full font-medium shrink-0 ${TYPE_COLORS[typeKey] ?? ''}`}>
                    {TYPE_LABELS[typeKey] ?? a.type}
                  </span>
                  <span className="text-[13px] font-medium overflow-hidden text-ellipsis whitespace-nowrap">{a.name}</span>
                </div>
                <div className="flex items-center gap-[8px] flex-shrink-0">
                  {isEditing ? (
                    <>
                      <input
                        type="number"
                        step="1"
                        aria-label="Asset balance"
                        value={editBalance}
                        onChange={e => setEditBalance(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleUpdateBalance(a.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="w-[100px] px-[6px] py-[2px] border border-blue-400 rounded text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                      <button onClick={() => handleUpdateBalance(a.id)} disabled={saving}
                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium">Save</button>
                      <button onClick={() => setEditingId(null)}
                        className="text-[11px] text-[var(--fg-3)] hover:text-[var(--foreground)]">Cancel</button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(a.id); setEditBalance(String(a.balance)); }}
                        title="Click to update balance"
                        className={`mono text-[13px] hover:underline cursor-pointer ${a.type === 'liability' ? 'text-red-600 dark:text-red-400' : 'text-[var(--fg-2)]'}`}
                      >
                        {a.type === 'liability' ? '−' : ''}{fmtEUR(Math.abs(a.balance))}
                      </button>
                      <button onClick={() => handleDelete(a.id)}
                        className="text-[var(--fg-3)] hover:text-red-500 transition-colors"
                        title="Remove asset"
                        aria-label={`Remove asset ${a.name}`}>
                        <svg className="w-[13px] h-[13px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {showHistory && (
            <div className="pt-[8px] border-t border-border-soft">
              <div className="text-[12px] font-medium text-[var(--fg-2)] mb-[8px]">Net worth over time</div>
              {history.length < 2 ? (
                <div className="text-[12px] text-[var(--fg-3)] py-2">
                  Not enough history yet — update asset balances to build a trend
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

          {adding ? (
            <div className="space-y-[8px] pt-[4px]">
              <div className="flex items-center gap-[8px] flex-wrap">
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as AssetType)}
                  aria-label="Asset type"
                  className="px-[8px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {ASSET_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Name"
                  aria-label="Asset name"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="flex-1 min-w-[120px] px-[8px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="number"
                  step="1"
                  placeholder="Balance €"
                  aria-label="Balance"
                  value={newBalance}
                  onChange={e => setNewBalance(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false); }}
                  className="w-[100px] px-[6px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="date"
                  aria-label="As of date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="px-[8px] py-[4px] border border-border-soft rounded bg-surface text-foreground text-[12px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-[8px]">
                <button
                  onClick={handleAdd}
                  disabled={saving || !newName.trim() || !newBalance}
                  className="px-[10px] py-[4px] bg-blue-600 text-white text-[12px] font-medium rounded hover:bg-blue-700 disabled:opacity-50"
                >Add</button>
                <button
                  onClick={() => { setAdding(false); setNewName(''); setNewBalance(''); setNewDate(today()); setNewType('bank'); }}
                  className="px-[10px] py-[4px] bg-surface-2 text-[var(--fg-2)] text-[12px] font-medium rounded hover:bg-[var(--border)]"
                >Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)} className="btn-ghost text-[12px]">+ Add asset</button>
          )}
        </div>
      )}
    </div>
  );
}
