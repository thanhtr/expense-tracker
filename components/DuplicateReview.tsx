'use client';

import { useEffect, useState } from 'react';
import type { DuplicatesResponse, DuplicateGroup, DuplicateRow } from '@/app/api/transactions/duplicates/route';

function fmtEUR(n: number) {
  return new Intl.NumberFormat('fi-FI', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n);
}

function isSuffixKey(key: string | null): boolean {
  if (!key) return false;
  // Keys with an integer suffix like "...|1", "...|2" are intra-batch collision entries
  return /\|\d+$/.test(key);
}

function RowCard({
  row,
  onDelete,
  deleting,
  isSuspect,
}: {
  row: DuplicateRow;
  onDelete: (id: number) => void;
  deleting: boolean;
  isSuspect: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded border text-sm ${
      isSuspect
        ? 'border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800'
        : 'border-border-soft bg-surface-2'
    }`}>
      <span className="text-fg-3 font-mono text-[11px] w-8">#{row.id}</span>
      <span className="text-fg-2 w-20 shrink-0">{row.account}</span>
      <span className="text-fg-2 w-12 shrink-0">{row.paidBy}</span>
      <span className={`flex-1 truncate ${row.category ? 'text-foreground' : 'text-fg-3 italic'}`}>
        {row.category || '⚠ uncategorized'}
      </span>
      <span className="font-mono text-[10px] text-fg-3 truncate max-w-[200px]" title={row.dedupKey ?? ''}>
        {row.dedupKey ?? 'no key'}
      </span>
      {isSuspect && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
          suspect
        </span>
      )}
      <button
        onClick={() => onDelete(row.id)}
        disabled={deleting}
        className="px-2 py-0.5 text-[11px] font-medium rounded border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-40 shrink-0"
      >
        {deleting ? '…' : 'Delete'}
      </button>
    </div>
  );
}

function GroupCard({ group, onDeleted }: { group: DuplicateGroup; onDeleted: (id: number) => void }) {
  const [deleting, setDeleting] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/transactions/${id}`, { method: 'DELETE' });
      if (res.ok) onDeleted(id);
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="bg-surface rounded-lg border border-border-soft p-4 space-y-2">
      <div className="flex items-baseline gap-3">
        <span className="font-medium text-foreground">{group.merchant}</span>
        <span className="text-fg-3 text-sm">{group.date}</span>
        <span className="font-mono text-sm text-fg-2 ml-auto">{fmtEUR(group.amount)} each</span>
        <span className="text-[11px] text-fg-3">{group.rows.length} rows</span>
      </div>
      <div className="space-y-1.5">
        {group.rows.map(row => (
          <RowCard
            key={row.id}
            row={row}
            onDelete={handleDelete}
            deleting={deleting === row.id}
            isSuspect={isSuffixKey(row.dedupKey)}
          />
        ))}
      </div>
    </div>
  );
}

export function DuplicateReview() {
  const [data, setData] = useState<DuplicatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/transactions/duplicates')
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(setData)
      .catch(() => setError('Failed to load duplicates'))
      .finally(() => setLoading(false));
  }, []);

  const handleDeleted = (deletedId: number) => {
    setData(prev => {
      if (!prev) return prev;
      const groups = prev.groups
        .map(g => ({ ...g, rows: g.rows.filter(r => r.id !== deletedId) }))
        .filter(g => g.rows.length > 1); // keep groups that still have duplicates
      return { total: groups.length, groups };
    });
  };

  if (loading) return <div className="text-center py-12 text-fg-3">Scanning for duplicates…</div>;
  if (error) return <div className="text-center py-8 text-red-600 dark:text-red-400">{error}</div>;
  if (!data || data.total === 0) {
    return (
      <div className="text-center py-12 text-fg-3">
        No duplicate groups found.
      </div>
    );
  }

  const suspectCount = data.groups.reduce(
    (n, g) => n + g.rows.filter(r => isSuffixKey(r.dedupKey)).length,
    0
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-sm text-fg-2">
        <span>{data.total} groups</span>
        <span className="text-fg-3">·</span>
        <span>
          <span className="text-amber-600 dark:text-amber-400 font-medium">{suspectCount}</span> suspect rows
          (suffix dedupKey — likely from overlapping CSV uploads)
        </span>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
        Rows marked <strong>suspect</strong> have a numbered suffix in their dedupKey (e.g. <code className="font-mono text-[11px]">…|1</code>),
        meaning they were created when the same transaction appeared in a second upload batch.
        Review each group — if both rows are from the same account on the same day, the suspect one is likely a duplicate and safe to delete.
        Rows from <em>different accounts</em> (e.g. Tung&apos;s OP Bank vs Thuy&apos;s OP Bank) may be legitimate.
      </div>

      <div className="space-y-3">
        {data.groups.map(group => (
          <GroupCard
            key={`${group.date}|${group.merchant}|${group.amount}`}
            group={group}
            onDeleted={handleDeleted}
          />
        ))}
      </div>
    </div>
  );
}
