'use client';

import { useCallback, useEffect, useState } from 'react';
import type { RecurringCharge, RecurringExclusion } from '@/app/api/transactions/recurring/route';

function fmtEUR(n: number) {
  return new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n).replace(/ /g, ' ');
}

interface RecurringData {
  recurring: RecurringCharge[];
  totalMonthly: number;
  exclusions: RecurringExclusion[];
}

export function RecurringTable() {
  const [data, setData] = useState<RecurringData | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ignoring, setIgnoring] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/transactions/recurring')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const ignore = async (type: 'category' | 'merchant', value: string) => {
    setIgnoring(`${type}:${value}`);
    try {
      await fetch('/api/transactions/recurring/exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, value }),
      });
      load();
    } finally {
      setIgnoring(null);
    }
  };

  const removeExclusion = async (id: number) => {
    await fetch(`/api/transactions/recurring/exclusions/${id}`, { method: 'DELETE' });
    load();
  };

  if (loading) return (
    <div className="dash-card animate-pulse">
      <div className="p-5 space-y-3">
        {[80, 65, 70, 55, 60].map(w => (
          <div key={w} className="flex items-center gap-3 py-2 border-t border-[var(--border)] first:border-0">
            <div className="h-4 bg-[var(--border)] rounded flex-1" style={{ width: `${w}%` }} />
            <div className="h-4 w-20 bg-[var(--border)] rounded" />
            <div className="h-4 w-16 bg-[var(--border)] rounded" />
          </div>
        ))}
      </div>
    </div>
  );

  if (!data || data.recurring.length === 0) return (
    <div className="space-y-4">
      <div className="dash-card p-8 text-center text-[13px] text-[var(--fg-3)]">
        No recurring charges detected yet. Upload at least 3 months of transactions to enable detection.{' '}
        <a href="/upload" className="text-[var(--fg-2)] underline">Upload transactions →</a>
      </div>
      {data && (data.exclusions ?? []).length > 0 && (
        <ExclusionsPanel exclusions={data.exclusions} onRemove={removeExclusion} />
      )}
    </div>
  );

  const allCategories = [...new Set(data.recurring.map(r => r.category))].sort();
  const displayed = categoryFilter
    ? data.recurring.filter(r => r.category === categoryFilter)
    : data.recurring;
  const filteredTotal = displayed.reduce((s, r) => s + r.monthlyEstimate, 0);

  return (
    <div className="space-y-4">
      <div className="dash-card p-[14px_20px] flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="text-[13px] text-[var(--fg-2)]">
            <span className="font-semibold text-[var(--foreground)]">{data.recurring.length}</span> recurring charges detected
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-2 py-1 text-[12px] border border-[var(--border)] rounded bg-[var(--surface)] text-[var(--foreground)]"
          >
            <option value="">All categories</option>
            {allCategories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-[var(--fg-3)] uppercase tracking-[.04em]">Est. monthly total</div>
          <div className="mono text-[18px] font-semibold text-[oklch(0.42_0.14_25)]">{fmtEUR(filteredTotal)}</div>
        </div>
      </div>

      <div className="dash-card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-5 py-3 text-left text-[11px] font-medium text-[var(--fg-3)]">Merchant</th>
              <th className="px-5 py-3 text-left text-[11px] font-medium text-[var(--fg-3)]">Category</th>
              <th className="px-5 py-3 text-left text-[11px] font-medium text-[var(--fg-3)]">Account</th>
              <th className="px-5 py-3 text-right text-[11px] font-medium text-[var(--fg-3)]">Months seen</th>
              <th className="px-5 py-3 text-right text-[11px] font-medium text-[var(--fg-3)]">Last charge</th>
              <th className="px-5 py-3 text-right text-[11px] font-medium text-[var(--fg-3)]">Monthly est.</th>
              <th className="px-5 py-3 text-right text-[11px] font-medium text-[var(--fg-3)]">Ignore</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map(r => {
              const merchantKey = `merchant:${r.merchant}`;
              const categoryKey = `category:${r.category}`;
              return (
                <tr key={r.merchant} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                  <td className="px-5 py-3 text-[13px] font-medium text-[var(--foreground)]">{r.merchant}</td>
                  <td className="px-5 py-3 text-[12px] text-[var(--fg-2)]">{r.category}</td>
                  <td className="px-5 py-3 text-[12px] text-[var(--fg-3)]">{r.account}</td>
                  <td className="px-5 py-3 text-right text-[12px] mono text-[var(--fg-2)]">{r.occurrences}</td>
                  <td className="px-5 py-3 text-right text-[12px] mono text-[var(--fg-3)]">{r.lastDate}</td>
                  <td className="px-5 py-3 text-right text-[13px] font-semibold mono text-[var(--foreground)]">
                    {fmtEUR(r.monthlyEstimate)}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => ignore('merchant', r.merchant)}
                        disabled={ignoring === merchantKey}
                        title="Ignore this merchant"
                        className="px-2 py-0.5 text-[11px] rounded border border-[var(--border)] text-[var(--fg-2)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                      >
                        merchant
                      </button>
                      <button
                        onClick={() => ignore('category', r.category)}
                        disabled={ignoring === categoryKey}
                        title={`Ignore all "${r.category}" charges`}
                        className="px-2 py-0.5 text-[11px] rounded border border-[var(--border)] text-[var(--fg-2)] hover:bg-[var(--surface-2)] disabled:opacity-40"
                      >
                        category
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(data.exclusions ?? []).length > 0 && (
        <ExclusionsPanel exclusions={data.exclusions} onRemove={removeExclusion} />
      )}
    </div>
  );
}

function ExclusionsPanel({ exclusions, onRemove }: {
  exclusions: RecurringExclusion[];
  onRemove: (id: number) => void;
}) {
  return (
    <div className="dash-card p-4">
      <div className="text-[11px] font-medium text-[var(--fg-3)] uppercase tracking-[.04em] mb-3">Ignored</div>
      <div className="flex flex-wrap gap-2">
        {exclusions.map(e => (
          <span
            key={e.id}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[12px] rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--fg-2)]"
          >
            <span className="text-[10px] text-[var(--fg-3)] font-medium uppercase">{e.type}</span>
            {e.value}
            <button
              onClick={() => onRemove(e.id)}
              className="text-[var(--fg-3)] hover:text-[var(--foreground)] leading-none"
              title="Remove exclusion"
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
