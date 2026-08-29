'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { detectBank } from '@/lib/parsers';
import type { ColumnMapping } from '@/lib/parsers';

interface HouseholdMember {
  id: number;
  name: string;
  slug: string;
}

interface QueueItem {
  id: string;
  file: File;
  detectedBank: 'op' | 'amex' | 'finnair' | 'generic' | null;
  columnMapping?: ColumnMapping;
  detectingColumns?: boolean;
  owner: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  result?: { created: number; skipped: number; total: number };
  error?: string;
}

interface UploadFormProps {
  onSuccess?: () => void;
}

const TRACKED_ACCOUNTS = ['OP Bank', 'Amex', 'Finnair Visa', 'Aktia'];

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1 day ago';
  return `${diff} days ago`;
}

export function UploadForm({ onSuccess }: UploadFormProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastImports, setLastImports] = useState<Record<string, string | null>>({});
  const [members, setMembers] = useState<HouseholdMember[]>([{ id: 0, name: 'Tung', slug: 'tung' }]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/household-members')
      .then(r => r.ok ? r.json() as Promise<HouseholdMember[]> : [])
      .then(data => { if (data.length) setMembers(data); })
      .catch(() => {});
  }, []);

  function refreshLastImports() {
    fetch('/api/upload/last-import')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLastImports(data); })
      .catch(() => {});
  }

  useEffect(() => { refreshLastImports(); }, []);

  function updateItem(id: string, patch: Partial<QueueItem>) {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item));
  }

  const detectColumns = useCallback(async (itemId: string, file: File) => {
    try {
      const preview = await file.slice(0, 2000).text();
      const fd = new FormData();
      fd.append('content', preview);
      const res = await fetch('/api/upload/detect-columns', { method: 'POST', body: fd });
      if (!res.ok) {
        updateItem(itemId, { detectingColumns: false });
        return;
      }
      const mapping = await res.json() as ColumnMapping;
      if (mapping.confidence >= 0.5 && mapping.dateColumn && mapping.amountColumn && mapping.merchantColumn) {
        updateItem(itemId, { detectedBank: 'generic', columnMapping: mapping, detectingColumns: false });
      } else {
        updateItem(itemId, { detectingColumns: false });
      }
    } catch {
      updateItem(itemId, { detectingColumns: false });
    }
   
  }, []);

  async function addFiles(files: File[]) {
    const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv');
    if (csvFiles.length === 0) return;

    const defaultOwner = members[0]?.slug ?? 'tung';
    const items = await Promise.all(csvFiles.map(async file => {
      const header = await file.slice(0, 500).text();
      const bank = detectBank(header);
      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        detectedBank: bank,
        detectingColumns: bank === null,
        owner: defaultOwner,
        status: 'pending' as const,
      };
    }));

    setQueue(prev => [...prev, ...items]);

    for (const item of items) {
      if (item.detectedBank === null) {
        detectColumns(item.id, item.file);
      }
    }
  }

  async function uploadAll() {
    const pending = queue.filter(item => item.status === 'pending');
    if (pending.length === 0) return;
    setUploading(true);

    for (const item of pending) {
      if (!item.detectedBank) {
        updateItem(item.id, { status: 'error', error: 'Select bank type' });
        continue;
      }
      updateItem(item.id, { status: 'uploading' });
      try {
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('account_type', item.detectedBank);
        formData.append('account_owner', item.owner);
        if (item.detectedBank === 'generic' && item.columnMapping) {
          formData.append('column_mapping', JSON.stringify(item.columnMapping));
        }

        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
          updateItem(item.id, { status: 'done', result: data });
          onSuccess?.();
        } else {
          updateItem(item.id, { status: 'error', error: data.error || 'Upload failed' });
        }
      } catch {
        updateItem(item.id, { status: 'error', error: 'Network error' });
      }
    }

    setUploading(false);
    refreshLastImports();
  }

  const pendingCount = queue.filter(i => i.status === 'pending').length;
  const allDone = queue.length > 0 && queue.every(i => i.status === 'done' || i.status === 'error');

  return (
    <div className="space-y-6">
      {/* Last import status */}
      <div className="bg-surface rounded-lg border border-border-soft p-4">
        <h3 className="text-xs font-medium text-fg-3 uppercase tracking-wide mb-3">Last imported</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {TRACKED_ACCOUNTS.map(account => {
            const date = lastImports[account];
            return (
              <div key={account}>
                <p className="text-sm font-medium">{account}</p>
                {date ? (
                  <>
                    <p className="text-xs text-fg-2">{new Date(date).toLocaleDateString('fi-FI')}</p>
                    <p className="text-xs text-fg-3">{daysAgo(date)}</p>
                  </>
                ) : (
                  <p className="text-xs text-fg-3">Never</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop CSV files or click to select"
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false); }}
        onDrop={e => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
            : 'border-border-soft bg-surface hover:border-blue-400 hover:bg-surface-2'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={e => { if (e.target.files) addFiles(Array.from(e.target.files)); }}
          className="hidden"
        />
        <p className="text-sm text-fg-2">
          Drop CSV files here or <span className="text-blue-600 dark:text-blue-400">click to select</span>
        </p>
        <p className="text-xs text-fg-3 mt-1">Multiple files supported · bank detected automatically</p>
      </div>

      {/* Queue */}
      {queue.length > 0 && (
        <div className="space-y-3">
          {queue.map(item => (
            <div key={item.id} className="bg-surface border border-border-soft rounded-lg px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.file.name}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {item.detectingColumns ? (
                      <span className="text-xs text-fg-3 italic">Analyzing format…</span>
                    ) : item.detectedBank === 'generic' && item.columnMapping ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full">
                          {item.columnMapping.bankLabel}
                          {item.columnMapping.confidence < 0.75 && ' ⚠'}
                        </span>
                        <span className="text-xs text-fg-3">
                          Date: <span className="font-mono">{item.columnMapping.dateColumn}</span>
                          {' · '}Amount: <span className="font-mono">{item.columnMapping.amountColumn}</span>
                          {' · '}Merchant: <span className="font-mono">{item.columnMapping.merchantColumn}</span>
                        </span>
                        <button
                          onClick={() => updateItem(item.id, { detectedBank: null, columnMapping: undefined })}
                          className="text-xs text-fg-3 hover:text-foreground underline"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <>
                        <select
                          value={item.detectedBank ?? ''}
                          onChange={e => updateItem(item.id, {
                            detectedBank: (e.target.value as 'op' | 'amex' | 'finnair') || null,
                            columnMapping: undefined,
                          })}
                          disabled={item.status !== 'pending'}
                          className="text-xs border border-border-soft rounded px-2 py-1 bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                        >
                          <option value="" disabled>Select bank…</option>
                          <option value="op">OP Bank</option>
                          <option value="amex">Amex</option>
                          <option value="finnair">Finnair Visa</option>
                        </select>
                        {item.detectedBank && item.status === 'pending' && (
                          <span className="text-xs text-fg-3">auto-detected</span>
                        )}
                      </>
                    )}
                    <select
                      value={item.owner}
                      onChange={e => updateItem(item.id, { owner: e.target.value })}
                      disabled={item.status !== 'pending'}
                      className="text-xs border border-border-soft rounded px-2 py-1 bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.slug}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 pt-0.5">
                  {item.status === 'pending' && (
                    <button
                      onClick={() => setQueue(prev => prev.filter(i => i.id !== item.id))}
                      className="text-xs text-fg-3 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                  {item.status === 'uploading' && <span className="text-xs text-blue-500">Uploading…</span>}
                  {item.status === 'done' && item.result && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      +{item.result.created} new{item.result.skipped > 0 ? `, ${item.result.skipped} skipped` : ''}
                    </span>
                  )}
                  {item.status === 'error' && (
                    <span className="text-xs text-red-600 dark:text-red-400">{item.error}</span>
                  )}
                </div>
              </div>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <button
              onClick={uploadAll}
              disabled={uploading || pendingCount === 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading
                ? 'Uploading…'
                : pendingCount > 1
                  ? `Upload ${pendingCount} files`
                  : 'Upload'}
            </button>
            {!uploading && (
              <button onClick={() => setQueue([])} className="text-sm text-fg-3 hover:text-foreground">
                Clear all
              </button>
            )}
          </div>

          {allDone && (
            <a
              href="/transactions"
              className="inline-block px-4 py-2 bg-green-700 text-white text-sm font-medium rounded-md hover:bg-green-800"
            >
              View transactions →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
