'use client';

import { useState, useEffect } from 'react';
import type { BucketConfig } from '@/app/api/guidelines/route';
import { CATEGORIES } from '@/lib/constants';

interface GuidelineEditorProps {
  initialBuckets: BucketConfig[];
  onSave: (buckets: BucketConfig[]) => void;
  onClose: () => void;
}

const PRESETS = [
  { label: '50 / 30 / 20', values: [50, 30, 20] },
  { label: '30 / 40 / 30', values: [30, 40, 30] },
  { label: '70 / 20 / 10', values: [70, 20, 10] },
];

const BUCKET_LABELS: Record<string, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};

const BUCKET_DESCRIPTIONS: Record<string, string> = {
  needs: 'Essential living expenses',
  wants: 'Everything not in Needs or Savings',
  savings: 'Investments',
};

const BUCKET_COLORS: Record<string, string> = {
  needs: '#3b82f6',
  wants: '#f59e0b',
  savings: '#10b981',
};

type BucketKey = 'needs' | 'wants' | 'savings';
const BUCKETS: BucketKey[] = ['needs', 'wants', 'savings'];

export function GuidelineEditor({ initialBuckets, onSave, onClose }: GuidelineEditorProps) {
  const [pcts, setPcts] = useState<Record<BucketKey, number>>(() => {
    const m: Record<BucketKey, number> = { needs: 50, wants: 30, savings: 20 };
    initialBuckets.forEach(b => { m[b.bucket as BucketKey] = b.targetPct; });
    return m;
  });
  const [catMap, setCatMap] = useState<Record<BucketKey, Set<string>>>(() => {
    const m: Record<BucketKey, Set<string>> = { needs: new Set(), wants: new Set(), savings: new Set() };
    initialBuckets.forEach(b => { m[b.bucket as BucketKey] = new Set(b.categories); });
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const total = pcts.needs + pcts.wants + pcts.savings;

  const applyPreset = (values: number[]) => {
    setPcts({ needs: values[0] ?? 50, wants: values[1] ?? 30, savings: values[2] ?? 20 });
  };

  const toggleCat = (cat: string, bucket: BucketKey) => {
    setCatMap(prev => {
      const next = { ...prev };
      // Remove from all buckets first
      BUCKETS.forEach(b => {
        next[b] = new Set(next[b]);
        next[b].delete(cat);
      });
      // Add to target bucket (unless it was already in that bucket — then leave unassigned)
      const wasIn = prev[bucket].has(cat);
      if (!wasIn) next[bucket].add(cat);
      return next;
    });
  };

  const assignedCats = new Set(BUCKETS.flatMap(b => [...catMap[b]]));
  const unassigned = CATEGORIES.filter(c => !assignedCats.has(c));

  const handleSave = async () => {
    setErr('');
    if (Math.abs(total - 100) > 0.01) {
      setErr('Percentages must sum to 100');
      return;
    }
    setSaving(true);
    try {
      const buckets: BucketConfig[] = BUCKETS.map(b => ({
        bucket: b,
        targetPct: pcts[b],
        categories: b === 'wants' ? [] : [...catMap[b]],
      }));
      const res = await fetch('/api/guidelines', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buckets }),
      });
      if (res.ok) {
        onSave(buckets);
      } else {
        const d = await res.json();
        setErr(d.error ?? 'Failed to save');
      }
    } catch {
      setErr('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-4 sm:pt-16 px-2 sm:px-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close guideline editor"
        className="absolute inset-0 w-full bg-black/40 backdrop-blur-sm cursor-default"
        onClick={onClose}
        tabIndex={-1}
      />

      <div className="relative bg-surface border border-border-soft rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] sm:max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-border-soft px-4 sm:px-6 py-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Configure Spending Guidelines</h2>
          <button onClick={onClose} className="text-fg-3 hover:text-foreground p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-6">
          {/* Presets */}
          <div>
            <div className="text-[11px] font-medium text-fg-3 uppercase tracking-wide mb-2">Presets</div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => (
                <button
                  key={p.label}
                  onClick={() => applyPreset(p.values)}
                  className={`px-3 py-1.5 text-[12px] font-medium rounded-md border transition-colors ${
                    pcts.needs === p.values[0] && pcts.wants === p.values[1] && pcts.savings === p.values[2]
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-surface-2 text-fg-2 border-border-soft hover:bg-[var(--border)]'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Percentage sliders */}
          <div className="space-y-4">
            <div className="text-[11px] font-medium text-fg-3 uppercase tracking-wide">Target Percentages</div>
            {BUCKETS.map(b => (
              <div key={b} className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 w-16 sm:w-24 shrink-0">
                  <span className="inline-block w-[8px] h-[8px] rounded-full shrink-0" style={{ background: BUCKET_COLORS[b] }} />
                  <span className="text-[13px] font-medium text-foreground">{BUCKET_LABELS[b]}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={pcts[b]}
                  onChange={e => setPcts(prev => ({ ...prev, [b]: Number(e.target.value) }))}
                  className="flex-1 min-w-0"
                  style={{ accentColor: BUCKET_COLORS[b] }}
                />
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={pcts[b]}
                    onChange={e => setPcts(prev => ({ ...prev, [b]: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                    className="w-10 px-1 py-0.5 border border-border-soft rounded bg-surface text-foreground text-[12px] text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <span className="text-[12px] text-fg-3">%</span>
                </div>
              </div>
            ))}
            <div className={`text-[12px] font-medium ${Math.abs(total - 100) > 0.01 ? 'text-red-600 dark:text-red-400' : 'text-pos'}`}>
              Total: {total.toFixed(0)}% {Math.abs(total - 100) > 0.01 ? '(must equal 100)' : '✓'}
            </div>
          </div>

          {/* Category assignment */}
          <div className="space-y-4">
            <div className="text-[11px] font-medium text-fg-3 uppercase tracking-wide">Category Assignment</div>
            <p className="text-[12px] text-fg-3">Click a category to move it between Needs and Savings. Wants automatically catches everything else.</p>
            {BUCKETS.filter(b => b !== 'wants').map(b => (
              <div key={b}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-block w-[8px] h-[8px] rounded-full" style={{ background: BUCKET_COLORS[b] }} />
                  <span className="text-[12px] font-semibold text-foreground">{BUCKET_LABELS[b]}</span>
                  <span className="text-[11px] text-fg-3">— {BUCKET_DESCRIPTIONS[b]}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                  {[...catMap[b]].map(cat => (
                    <button
                      key={cat}
                      onClick={() => toggleCat(cat, b)}
                      className="px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors text-white"
                      style={{ background: BUCKET_COLORS[b], borderColor: BUCKET_COLORS[b] }}
                      title="Click to unassign"
                    >
                      {cat} ×
                    </button>
                  ))}
                  {catMap[b].size === 0 && (
                    <span className="text-[11px] text-fg-3 italic">No categories assigned</span>
                  )}
                </div>
              </div>
            ))}

            {/* Wants: catch-all, no chip assignment needed */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-block w-[8px] h-[8px] rounded-full" style={{ background: BUCKET_COLORS.wants }} />
                <span className="text-[12px] font-semibold text-foreground">Wants</span>
                <span className="text-[11px] text-fg-3">— {BUCKET_DESCRIPTIONS.wants}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 px-2 py-1.5 rounded-lg bg-surface-2 border border-border-soft">
                <span className="text-[11px] text-fg-3 italic">Auto — captures all spending not assigned to Needs or Savings</span>
              </div>
            </div>

            {unassigned.length > 0 && (
              <div>
                <div className="text-[12px] font-semibold text-fg-3 mb-2">Unassigned — click to add to Needs or Savings</div>
                {(['needs', 'savings'] as const).map(b => (
                  <div key={b} className="flex flex-wrap gap-1.5 mb-2">
                    <span className="text-[11px] text-fg-3 w-full">→ {BUCKET_LABELS[b]}:</span>
                    {unassigned.map(cat => (
                      <button
                        key={cat}
                        onClick={() => toggleCat(cat, b)}
                        className="px-2.5 py-1 text-[11px] font-medium rounded-full border border-border-soft bg-surface-2 text-fg-2 hover:bg-[var(--border)] transition-colors"
                      >
                        + {cat}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface border-t border-border-soft px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          {err && <span className="text-[12px] text-red-600 dark:text-red-400">{err}</span>}
          {!err && <span />}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-surface-2 text-fg-2 text-[13px] font-medium rounded-md hover:bg-[var(--border)]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || Math.abs(total - 100) > 0.01}
              className="px-4 py-2 bg-blue-600 text-white text-[13px] font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
