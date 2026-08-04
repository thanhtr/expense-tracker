'use client';

import { useEffect, useState, useMemo } from 'react';
import { CATEGORIES } from '@/lib/constants';
import type { Seller } from '@/app/api/transactions/sellers/route';

type SortKey = 'count' | 'totalAmount' | 'merchant';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function SortIcon({ k, sortKey, sortAsc }: { k: SortKey; sortKey: SortKey; sortAsc: boolean }) {
  if (sortKey !== k) return <span className="text-fg-3 text-[10px]">↕</span>;
  return <span className="text-[10px]">{sortAsc ? '↑' : '↓'}</span>;
}

function fmtEUR(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n).replace(/ /g, ' ');
}

function CategoryPills({ categories, dominant }: { categories: Seller['categories']; dominant: string }) {
  const visible = categories.filter(c => c.category).slice(0, 3);
  const uncategorized = categories.find(c => !c.category);
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(c => (
        <span
          key={c.category}
          className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
            c.category === dominant
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-surface-2 border-border-soft text-fg-3'
          }`}
        >
          {c.category} ({c.count})
        </span>
      ))}
      {uncategorized && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border border-amber-200 bg-amber-50 text-amber-700">
          ⚠ {uncategorized.count} uncategorized
        </span>
      )}
    </div>
  );
}

export function SellerTable() {
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('count');
  const [sortAsc, setSortAsc] = useState(false);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [pendingCat, setPendingCat] = useState<Record<string, string>>({});
  const [showMixedOnly, setShowMixedOnly] = useState(false);

  useEffect(() => {
    fetch('/api/transactions/sellers')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(d => setSellers(d.sellers ?? []))
      .catch(() => setError('Failed to load sellers'))
      .finally(() => setLoading(false));
  }, []);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(a => !a); } else { setSortKey(key); setSortAsc(false); }
  };

  const filtered = useMemo(() => {
    let list = sellers;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(s => s.merchant.toLowerCase().includes(q));
    }
    if (showMixedOnly) {
      list = list.filter(s => s.isMixed || !s.dominantCategory);
    }
    return [...list].sort((a, b) => {
      let diff = 0;
      if (sortKey === 'count') diff = a.count - b.count;
      else if (sortKey === 'totalAmount') diff = a.totalAmount - b.totalAmount;
      else diff = a.merchant.localeCompare(b.merchant);
      return sortAsc ? diff : -diff;
    });
  }, [sellers, search, sortKey, sortAsc, showMixedOnly]);

  const handleApply = async (merchant: string, category: string) => {
    setSaveStates(p => ({ ...p, [merchant]: 'saving' }));
    try {
      const res = await fetch('/api/transactions/bulk-categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchant, category }),
      });
      if (res.ok) {
        const { updated } = await res.json();
        setSellers(prev => prev.map(s =>
          s.merchant === merchant
            ? { ...s, dominantCategory: category, isMixed: false,
                categories: [{ category, count: updated }] }
            : s
        ));
        setSaveStates(p => ({ ...p, [merchant]: 'saved' }));
        setTimeout(() => setSaveStates(p => ({ ...p, [merchant]: 'idle' })), 2000);
      } else {
        setSaveStates(p => ({ ...p, [merchant]: 'error' }));
        setTimeout(() => setSaveStates(p => ({ ...p, [merchant]: 'idle' })), 2000);
      }
    } catch {
      setSaveStates(p => ({ ...p, [merchant]: 'error' }));
      setTimeout(() => setSaveStates(p => ({ ...p, [merchant]: 'idle' })), 2000);
    }
  };

  if (loading) return <div className="text-center py-12 text-fg-3">Loading sellers…</div>;
  if (error) return <div className="text-center py-8 text-red-600">{error}</div>;

  const mixedCount = sellers.filter(s => s.isMixed || !s.dominantCategory).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search merchants…"
          className="px-3 py-1.5 border border-border-soft rounded-md bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
        />
        <label className="flex items-center gap-2 text-sm text-fg-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showMixedOnly}
            onChange={e => setShowMixedOnly(e.target.checked)}
            className="w-4 h-4 rounded border-border-soft text-blue-600 focus:ring-blue-500"
          />
          Mixed / uncategorized only
          {mixedCount > 0 && (
            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-medium rounded-full border border-amber-200">
              {mixedCount}
            </span>
          )}
        </label>
        <span className="text-sm text-fg-3 ml-auto">
          {filtered.length} of {sellers.length} merchants
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-surface rounded-lg border border-border-soft">
        <table className="w-full">
          <thead className="bg-surface-2 border-b border-border-soft">
            <tr>
              <th
                className="px-4 py-3 text-left text-xs font-medium text-fg-2 cursor-pointer select-none hover:bg-[var(--border)]"
                onClick={() => handleSort('merchant')}
              >
                Merchant <SortIcon k="merchant" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-fg-2 cursor-pointer select-none hover:bg-[var(--border)]"
                onClick={() => handleSort('count')}
              >
                Txns <SortIcon k="count" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-medium text-fg-2 cursor-pointer select-none hover:bg-[var(--border)]"
                onClick={() => handleSort('totalAmount')}
              >
                Total Spent <SortIcon k="totalAmount" sortKey={sortKey} sortAsc={sortAsc} />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-fg-2">
                Current Category
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-fg-2">
                Set Category
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-sm text-fg-3">
                  {search ? 'No merchants match your search' : 'No transactions yet'}
                </td>
              </tr>
            ) : (
              filtered.map(seller => {
                const state = saveStates[seller.merchant] ?? 'idle';
                const pending = pendingCat[seller.merchant] ?? seller.dominantCategory ?? '';
                return (
                  <tr key={seller.merchant} className="border-b border-border-soft hover:bg-surface-2">
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm text-foreground">{seller.merchant}</div>
                      {seller.isMixed && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-medium mt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                          mixed categories
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-right mono text-fg-2">{seller.count}</td>
                    <td className="px-4 py-3 text-sm text-right mono text-fg-2">{fmtEUR(seller.totalAmount)}</td>
                    <td className="px-4 py-3">
                      <CategoryPills categories={seller.categories} dominant={seller.dominantCategory} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={pending}
                          onChange={e => setPendingCat(p => ({ ...p, [seller.merchant]: e.target.value }))}
                          disabled={state === 'saving'}
                          className="px-2 py-1 border border-border-soft rounded bg-surface text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="">— keep mixed —</option>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        {pending && pending !== '' && (
                          <button
                            onClick={() => handleApply(seller.merchant, pending)}
                            disabled={state === 'saving'}
                            className="px-3 py-1 bg-blue-600 text-white text-[12px] font-medium rounded hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {state === 'saving' ? '…' : `Apply to all ${seller.count}`}
                          </button>
                        )}
                        {state === 'saved' && <span className="text-pos text-[12px]">✓ saved</span>}
                        {state === 'error' && <span className="text-red-600 text-[12px]">✗ failed</span>}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
