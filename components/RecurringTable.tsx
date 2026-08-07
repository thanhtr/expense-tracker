'use client';

import { useEffect, useState } from 'react';
import type { RecurringCharge } from '@/app/api/transactions/recurring/route';

function fmtEUR(n: number) {
  return new Intl.NumberFormat('fi-FI', { style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n).replace(/ /g, ' ');
}

export function RecurringTable() {
  const [data, setData] = useState<{ recurring: RecurringCharge[]; totalMonthly: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/transactions/recurring')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d); })
      .finally(() => setLoading(false));
  }, []);

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
    <div className="dash-card p-8 text-center text-[13px] text-[var(--fg-3)]">
      No recurring charges detected yet. Upload at least 3 months of transactions to enable detection.
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="dash-card p-[14px_20px] flex items-center justify-between">
        <div className="text-[13px] text-[var(--fg-2)]">
          <span className="font-semibold text-[var(--foreground)]">{data.recurring.length}</span> recurring charges detected
        </div>
        <div className="text-right">
          <div className="text-[11px] text-[var(--fg-3)] uppercase tracking-[.04em]">Est. monthly total</div>
          <div className="mono text-[18px] font-semibold text-[oklch(0.42_0.14_25)]">{fmtEUR(data.totalMonthly)}</div>
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
            </tr>
          </thead>
          <tbody>
            {data.recurring.map(r => (
              <tr key={r.merchant} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]">
                <td className="px-5 py-3 text-[13px] font-medium text-[var(--foreground)]">{r.merchant}</td>
                <td className="px-5 py-3 text-[12px] text-[var(--fg-2)]">{r.category}</td>
                <td className="px-5 py-3 text-[12px] text-[var(--fg-3)]">{r.account}</td>
                <td className="px-5 py-3 text-right text-[12px] mono text-[var(--fg-2)]">{r.occurrences}</td>
                <td className="px-5 py-3 text-right text-[12px] mono text-[var(--fg-3)]">{r.lastDate}</td>
                <td className="px-5 py-3 text-right text-[13px] font-semibold mono text-[var(--foreground)]">
                  {fmtEUR(r.monthlyEstimate)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
