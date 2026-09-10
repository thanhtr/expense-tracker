'use client';

import { useEffect, useState, useCallback } from 'react';
import type { BucketConfig } from '@/app/api/guidelines/route';
import { GuidelineEditor } from './GuidelineEditor';

interface GuidelinePanelProps {
  spentByCategory: Record<string, number>;
  total: number; // income — guideline percentages are fractions of income, not of spending
}

const BUCKET_LABELS: Record<string, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};

const BUCKET_COLORS: Record<string, string> = {
  needs: '#3b82f6',   // blue
  wants: '#f59e0b',   // amber
  savings: '#10b981', // emerald
};

function fmtEUR(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n).replace(/ /g, ' ');
}

export function GuidelinePanel({ spentByCategory, total }: GuidelinePanelProps) {
  const [buckets, setBuckets] = useState<BucketConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);

  const loadBuckets = useCallback(() => {
    fetch('/api/guidelines')
      .then(r => r.ok ? r.json() : { buckets: [] })
      .then(d => setBuckets(d.buckets ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadBuckets(); }, [loadBuckets]);

  if (loading) return null;

  const nonWantsCats = new Set(
    buckets.filter(b => b.bucket !== 'wants').flatMap(b => b.categories)
  );

  const computed = buckets.map(b => {
    const spent = b.bucket === 'wants'
      ? Object.entries(spentByCategory).filter(([cat]) => !nonWantsCats.has(cat)).reduce((s, [, v]) => s + v, 0)
      : b.categories.reduce((s, cat) => s + (spentByCategory[cat] ?? 0), 0);
    const actualPct = total > 0 ? (spent / total) * 100 : 0;
    const over = actualPct > b.targetPct;
    const warn = actualPct > b.targetPct * 0.85 && !over;
    return { ...b, spent, actualPct, over, warn };
  });

  // Compute the total assigned spend (sum of all bucket spends)
  const totalAssigned = computed.reduce((s, b) => s + b.spent, 0);

  // Surplus: income not yet allocated to any bucket (income-based denominator makes this visible)
  const surplus = total > 0 ? Math.max(0, total - totalAssigned) : 0;
  const surplusPct = total > 0 ? (surplus / total) * 100 : 0;
  const hasUnspent = surplusPct > 0.5;

  return (
    <>
      <div className="dash-card">
        <div className="flex items-center justify-between gap-3 p-[16px_20px_12px]">
          <div>
            <h3 className="text-[13px] font-semibold m-0">Spending Guidelines</h3>
            <div className="text-[12px] text-[var(--fg-3)]">% of income by bucket</div>
          </div>
          <button
            onClick={() => setEditorOpen(true)}
            className="btn-ghost text-[12px]"
            title="Configure guidelines"
          >
            Configure
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Stacked bar showing actual split as % of income */}
          {totalAssigned > 0 && (
            <div className="space-y-1">
              <div className="flex h-[8px] rounded-full overflow-hidden gap-[2px]">
                {computed.map(b => b.spent > 0 && (
                  <div
                    key={b.bucket}
                    style={{
                      width: `${total > 0 ? (b.spent / total) * 100 : 0}%`,
                      background: BUCKET_COLORS[b.bucket],
                      minWidth: '3px',
                    }}
                  />
                ))}
                {hasUnspent && (
                  <div
                    style={{ width: `${surplusPct}%`, background: 'var(--border)', minWidth: '3px' }}
                  />
                )}
              </div>
              <div className="flex gap-3 flex-wrap">
                {computed.map(b => (
                  <div key={b.bucket} className="flex items-center gap-1 text-[11px] text-[var(--fg-3)]">
                    <span
                      className="inline-block w-[8px] h-[8px] rounded-full flex-shrink-0"
                      style={{ background: BUCKET_COLORS[b.bucket] }}
                    />
                    {BUCKET_LABELS[b.bucket]}
                  </div>
                ))}
                {hasUnspent && (
                  <div className="flex items-center gap-1 text-[11px] text-[var(--fg-3)]">
                    <span className="inline-block w-[8px] h-[8px] rounded-full flex-shrink-0 bg-[var(--border)]" />
                    Unspent
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Per-bucket rows */}
          <div className="space-y-3">
            {computed.map(b => (
              <div key={b.bucket}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1 sm:gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block w-[8px] h-[8px] rounded-full flex-shrink-0"
                      style={{ background: BUCKET_COLORS[b.bucket] }}
                    />
                    <span className="text-[13px] font-medium">{BUCKET_LABELS[b.bucket]}</span>
                  </div>
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[12px] mono">
                    <span className={b.over ? 'text-red-600 dark:text-red-400 font-semibold' : b.warn ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--fg-2)]'}>
                      {b.actualPct.toFixed(0)}% actual
                    </span>
                    <span className="text-[var(--fg-3)]">vs {b.targetPct.toFixed(0)}% target</span>
                    <span className={b.over ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-[var(--fg-2)]'}>
                      {fmtEUR(b.spent)}
                    </span>
                    {b.over && (
                      <span className="dash-chip neg">+{fmtEUR(b.spent - (total * b.targetPct / 100))}</span>
                    )}
                    {!b.over && b.spent > 0 && total > 0 && (
                      <span className="dash-chip pos">-{fmtEUR((total * b.targetPct / 100) - b.spent)} left</span>
                    )}
                  </div>
                </div>
                {/* Progress bar: actual vs target */}
                <div className="relative h-[5px] bg-[var(--surface-2)] rounded-full overflow-hidden">
                  {/* Target marker */}
                  <div
                    className="absolute top-0 bottom-0 w-[2px] bg-[var(--border-strong)] rounded-full z-10"
                    style={{ left: `${Math.min(b.targetPct, 100)}%` }}
                  />
                  {/* Actual fill */}
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(b.actualPct, 100)}%`,
                      background: b.over ? '#ef4444' : b.warn ? '#f59e0b' : BUCKET_COLORS[b.bucket],
                    }}
                  />
                </div>
              </div>
            ))}

            {/* Surplus row: income not yet accounted for by any bucket */}
            {hasUnspent && (
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-soft)] text-[12px] text-[var(--fg-3)]" data-testid="guideline-surplus">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-[8px] h-[8px] rounded-full flex-shrink-0 bg-[var(--border)]" />
                  <span>Surplus</span>
                </div>
                <span className="mono">{surplusPct.toFixed(0)}% · {fmtEUR(surplus)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {editorOpen && (
        <GuidelineEditor
          initialBuckets={buckets}
          onSave={(updated) => {
            setBuckets(updated);
            setEditorOpen(false);
          }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}
