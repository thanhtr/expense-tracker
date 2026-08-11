'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fmtEUR } from '@/lib/utils';

type AssetType = 'bank' | 'investment' | 'property' | 'crypto' | 'liability';

interface Asset {
  id: number;
  name: string;
  type: AssetType;
  balance: number;
  recordedAt: string;
}

const TYPE_LABELS: Record<AssetType, string> = {
  bank: 'Bank',
  investment: 'Investment',
  property: 'Property',
  crypto: 'Crypto',
  liability: 'Liability',
};

const TYPE_ORDER: AssetType[] = ['investment', 'bank', 'property', 'crypto', 'liability'];

const EMPTY_FORM = { name: '', type: 'investment' as AssetType, balance: '', recordedAt: new Date().toISOString().slice(0, 10) };

export function AssetManager({ onMutate }: { onMutate?: () => void } = {}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editBalance, setEditBalance] = useState('');

  useEffect(() => {
    fetch('/api/assets')
      .then(r => r.ok ? r.json() : [])
      .then((d: Asset[]) => setAssets(d))
      .finally(() => setLoading(false));
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const balance = parseFloat(form.balance);
    if (!form.name.trim() || isNaN(balance)) return;
    setAdding(true);
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), type: form.type, balance, recordedAt: form.recordedAt }),
      });
      if (res.ok) {
        const asset = await res.json() as Asset;
        setAssets(prev => [...prev, asset]);
        setForm(EMPTY_FORM);
        onMutate?.();
        toast.success(`"${asset.name}" added`);
      } else {
        const err = await res.json() as { error: string };
        toast.error(err.error ?? 'Failed to add');
      }
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdateBalance(asset: Asset) {
    const balance = parseFloat(editBalance);
    if (isNaN(balance)) return;
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance, recordedAt: new Date().toISOString().slice(0, 10) }),
    });
    if (res.ok) {
      const updated = await res.json() as Asset;
      setAssets(prev => prev.map(a => a.id === updated.id ? updated : a));
      setEditingId(null);
      onMutate?.();
      toast.success('Balance updated');
    } else {
      toast.error('Failed to update');
    }
  }

  async function handleDelete(asset: Asset) {
    const res = await fetch(`/api/assets/${asset.id}`, { method: 'DELETE' });
    if (res.ok) {
      setAssets(prev => prev.filter(a => a.id !== asset.id));
      onMutate?.();
      toast.success(`"${asset.name}" removed`);
    } else {
      toast.error('Failed to delete');
    }
  }

  const grouped = TYPE_ORDER.map(type => ({
    type,
    items: assets.filter(a => a.type === type),
  })).filter(g => g.items.length > 0);

  const totalInvestment = assets.filter(a => a.type === 'investment').reduce((s, a) => s + a.balance, 0);
  const totalAssets = assets.filter(a => a.type !== 'liability').reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = assets.filter(a => a.type === 'liability').reduce((s, a) => s + Math.abs(a.balance), 0);

  return (
    <div className="space-y-6">
      {/* Summary */}
      {assets.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="dash-card p-[12px_16px]">
            <div className="tool-label text-[var(--fg-3)] mb-1">Investment portfolio</div>
            <div className="mono font-semibold text-[var(--accent)]">{fmtEUR(totalInvestment)}</div>
            <div className="text-[10px] text-[var(--fg-3)] mt-[2px]">used for FIRE calculation</div>
          </div>
          <div className="dash-card p-[12px_16px]">
            <div className="tool-label text-[var(--fg-3)] mb-1">Total assets</div>
            <div className="mono font-semibold text-[var(--pos)]">{fmtEUR(totalAssets)}</div>
          </div>
          <div className="dash-card p-[12px_16px]">
            <div className="tool-label text-[var(--fg-3)] mb-1">Net worth</div>
            <div className={`mono font-semibold ${totalAssets - totalLiabilities >= 0 ? 'text-[var(--pos)]' : 'text-[var(--neg)]'}`}>
              {fmtEUR(totalAssets - totalLiabilities)}
            </div>
          </div>
        </div>
      )}

      {/* Asset list */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="dash-card h-[48px] animate-pulse bg-[var(--surface-2)]" />)}</div>
      ) : assets.length === 0 ? (
        <div className="dash-card p-8 text-center text-[13px] text-[var(--fg-3)]">No assets yet — add one below</div>
      ) : (
        <div className="dash-card overflow-hidden">
          {grouped.map(({ type, items }, gi) => (
            <div key={type}>
              {gi > 0 && <div className="border-t border-[var(--border)]" />}
              <div className="px-4 py-[8px] text-[11px] font-semibold text-[var(--fg-3)] bg-[var(--surface-2)]">
                {TYPE_LABELS[type]}
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {items.map(asset => (
                  <li key={asset.id} className="flex items-center gap-3 px-4 py-[10px]">
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{asset.name}</div>
                      <div className="text-[11px] text-[var(--fg-3)]">
                        as of {new Date(asset.recordedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </div>

                    {editingId === asset.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          className="date-input w-[120px] text-right"
                          value={editBalance}
                          onChange={e => setEditBalance(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') void handleUpdateBalance(asset); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                        />
                        <button className="btn-ghost text-[12px] py-[3px]" onClick={() => void handleUpdateBalance(asset)}>Save</button>
                        <button className="btn-ghost text-[12px] py-[3px] text-[var(--fg-3)]" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          className="mono text-[13px] font-medium hover:text-[var(--accent)] transition-colors"
                          onClick={() => { setEditingId(asset.id); setEditBalance(String(asset.balance)); }}
                          title="Click to edit balance"
                        >
                          {fmtEUR(asset.balance)}
                        </button>
                        <button
                          className="text-[var(--fg-3)] hover:text-[var(--neg)] transition-colors text-[12px]"
                          onClick={() => void handleDelete(asset)}
                          aria-label={`Delete ${asset.name}`}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <form onSubmit={e => void handleAdd(e)} className="dash-card p-4 space-y-3">
        <div className="text-[13px] font-semibold mb-1">Add asset</div>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-[4px]">
            <span className="text-[11px] text-[var(--fg-2)]">Name</span>
            <input
              className="date-input"
              placeholder="e.g. Nordnet portfolio"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              required
            />
          </label>
          <label className="flex flex-col gap-[4px]">
            <span className="text-[11px] text-[var(--fg-2)]">Type</span>
            <select
              className="date-input"
              value={form.type}
              onChange={e => setForm(p => ({ ...p, type: e.target.value as AssetType }))}
            >
              {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-[4px]">
            <span className="text-[11px] text-[var(--fg-2)]">Balance (€)</span>
            <input
              type="number"
              className="date-input text-right"
              placeholder="0"
              step="0.01"
              value={form.balance}
              onChange={e => setForm(p => ({ ...p, balance: e.target.value }))}
              required
            />
          </label>
          <label className="flex flex-col gap-[4px]">
            <span className="text-[11px] text-[var(--fg-2)]">As of date</span>
            <input
              type="date"
              className="date-input"
              value={form.recordedAt}
              onChange={e => setForm(p => ({ ...p, recordedAt: e.target.value }))}
              required
            />
          </label>
        </div>
        <button type="submit" disabled={adding} className="btn-ghost disabled:opacity-40">
          {adding ? 'Adding…' : '+ Add asset'}
        </button>
      </form>
    </div>
  );
}
