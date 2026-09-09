'use client';

import { useEffect, useState } from 'react';

interface CsvImport {
  id: number;
  createdAt: string;
  bank: string;
  filename: string;
  owner: string;
  created: number;
  skipped: number;
  dateFrom: string | null;
  dateTo: string | null;
}

const BANK_LABELS: Record<string, string> = {
  op: 'OP Bank',
  amex: 'Amex',
  finnair: 'Finnair Visa',
  generic: 'Generic',
};

function formatImportDate(iso: string) {
  return new Intl.DateTimeFormat('fi-FI', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

function formatDateRange(from: string | null, to: string | null) {
  if (!from || !to) return null;
  const fmt = (s: string) => new Intl.DateTimeFormat('fi-FI', { day: 'numeric', month: 'short' }).format(new Date(s));
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function ImportHistory({ refreshKey }: { refreshKey?: number }) {
  const [imports, setImports] = useState<CsvImport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/imports')
      .then(r => r.ok ? r.json() as Promise<CsvImport[]> : [])
      .then(setImports)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="bg-surface rounded-lg border border-border-soft overflow-hidden animate-pulse">
        <div className="px-5 py-3 border-b border-border-soft bg-surface-2">
          <div className="h-4 w-32 bg-[var(--border)] rounded" />
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="px-5 py-3 border-b border-border-soft last:border-0 flex items-center gap-4">
            <div className="h-4 w-20 bg-[var(--border)] rounded" />
            <div className="h-4 w-32 bg-[var(--border)] rounded" />
            <div className="h-4 w-24 bg-[var(--border)] rounded ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <div className="bg-surface rounded-lg border border-border-soft px-5 py-8 text-center text-sm text-fg-3">
        No imports yet
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-lg border border-border-soft overflow-hidden">
      <div className="px-5 py-3 border-b border-border-soft bg-surface-2">
        <h2 className="text-sm font-medium text-fg-2">Recent imports</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-soft">
              <th className="px-5 py-2 text-left text-xs font-medium text-fg-3">When</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-fg-3">Bank</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-fg-3">File</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-fg-3">Owner</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-fg-3">Result</th>
              <th className="px-5 py-2 text-left text-xs font-medium text-fg-3">Date range</th>
            </tr>
          </thead>
          <tbody>
            {imports.map(imp => {
              const allSkipped = imp.created === 0;
              const range = formatDateRange(imp.dateFrom, imp.dateTo);
              return (
                <tr key={imp.id} className={`border-b border-border-soft last:border-0 ${allSkipped ? 'opacity-50' : ''}`}>
                  <td className="px-5 py-2.5 whitespace-nowrap text-fg-2">{formatImportDate(imp.createdAt)}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">{BANK_LABELS[imp.bank] ?? imp.bank}</td>
                  <td className="px-5 py-2.5 max-w-[180px] truncate text-fg-2" title={imp.filename}>{imp.filename}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">{capitalize(imp.owner)}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap">
                    <span className={imp.created > 0 ? 'text-green-600 dark:text-green-400' : 'text-fg-3'}>
                      +{imp.created} new
                    </span>
                    {imp.skipped > 0 && (
                      <span className="text-fg-3 ml-1">· {imp.skipped} skipped</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap text-fg-3">{range ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
