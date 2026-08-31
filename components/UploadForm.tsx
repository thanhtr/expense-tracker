'use client';

import { useState, useRef, useEffect } from 'react';
import { detectBank, detectColumnMapping } from '@/lib/parsers';
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
  headers?: string[];
  sampleRows?: Record<string, string>[];
  savedProfile?: boolean;
  owner: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  result?: { created: number; skipped: number; total: number };
  error?: string;
}

interface UploadFormProps {
  onSuccess?: () => void;
}

const TRACKED_ACCOUNTS = ['OP Bank', 'Amex', 'Finnair Visa', 'Aktia'];
const PROFILE_KEY_PREFIX = 'bankProfile:';

function daysAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1 day ago';
  return `${diff} days ago`;
}

function profileKey(headers: string[]): string {
  return PROFILE_KEY_PREFIX + JSON.stringify([...headers].sort());
}

function loadProfileLocal(headers: string[]): ColumnMapping | null {
  try {
    const raw = localStorage.getItem(profileKey(headers));
    return raw ? (JSON.parse(raw) as ColumnMapping) : null;
  } catch {
    return null;
  }
}

function saveProfileLocal(headers: string[], mapping: ColumnMapping) {
  try {
    localStorage.setItem(profileKey(headers), JSON.stringify(mapping));
  } catch { /* quota exceeded, ignore */ }
}

function saveProfileDB(fingerprint: string, mapping: ColumnMapping) {
  fetch('/api/bank-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint, mapping }),
  }).catch(() => {});
}

export function UploadForm({ onSuccess }: UploadFormProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastImports, setLastImports] = useState<Record<string, string | null>>({});
  const [members, setMembers] = useState<HouseholdMember[]>([{ id: 0, name: 'Tung', slug: 'tung' }]);
  const [dbProfiles, setDbProfiles] = useState<Map<string, ColumnMapping>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/household-members')
      .then(r => r.ok ? r.json() as Promise<HouseholdMember[]> : [])
      .then(data => { if (data.length) setMembers(data); })
      .catch(() => {});

    fetch('/api/bank-profiles')
      .then(r => r.ok ? r.json() as Promise<{ fingerprint: string; columnMapping: ColumnMapping }[]> : [])
      .then(profiles => {
        const map = new Map<string, ColumnMapping>();
        for (const p of profiles) map.set(p.fingerprint, p.columnMapping);
        setDbProfiles(map);
      })
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

  async function addFiles(files: File[]) {
    const csvFiles = files.filter(f => f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv');
    if (csvFiles.length === 0) return;

    const defaultOwner = members[0]?.slug ?? 'tung';
    const items = await Promise.all(csvFiles.map(async file => {
      const header = await file.slice(0, 500).text();
      const bank = detectBank(header);

      if (bank !== null) {
        return {
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          file,
          detectedBank: bank,
          owner: defaultOwner,
          status: 'pending' as const,
        };
      }

      // Unknown bank — run heuristic on first 4KB
      const preview = await file.slice(0, 4096).text();
      const heuristic = detectColumnMapping(preview);

      // Check DB (in-memory) then localStorage for a saved profile
      const key = profileKey(heuristic.headers);
      const saved = heuristic.headers.length > 0
        ? (dbProfiles.get(key) ?? loadProfileLocal(heuristic.headers))
        : null;
      const mapping: ColumnMapping = saved ?? heuristic;

      return {
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        detectedBank: 'generic' as const,
        columnMapping: mapping,
        headers: heuristic.headers,
        sampleRows: heuristic.sampleRows,
        savedProfile: !!saved,
        owner: defaultOwner,
        status: 'pending' as const,
      };
    }));

    setQueue(prev => [...prev, ...items]);
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
      if (item.detectedBank === 'generic') {
        const m = item.columnMapping;
        if (!m?.dateColumn || !m?.amountColumn || !m?.merchantColumn) {
          updateItem(item.id, { status: 'error', error: 'Map all required columns first' });
          continue;
        }
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
          // Save profile to localStorage + DB on success
          if (item.detectedBank === 'generic' && item.columnMapping && item.headers?.length) {
            saveProfileLocal(item.headers, item.columnMapping);
            saveProfileDB(profileKey(item.headers), item.columnMapping);
          }
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

                  {/* Known bank (OP / Amex / Finnair) */}
                  {item.detectedBank !== 'generic' && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <select
                        value={item.detectedBank ?? ''}
                        onChange={e => updateItem(item.id, {
                          detectedBank: (e.target.value as 'op' | 'amex' | 'finnair') || null,
                          columnMapping: undefined,
                          headers: undefined,
                          sampleRows: undefined,
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
                      <OwnerSelect item={item} members={members} updateItem={updateItem} />
                    </div>
                  )}

                  {/* Generic / unknown bank — mapping editor */}
                  {item.detectedBank === 'generic' && item.status === 'pending' && (
                    <GenericMappingEditor
                      item={item}
                      members={members}
                      updateItem={updateItem}
                    />
                  )}

                  {/* Generic done/error state — just show owner */}
                  {item.detectedBank === 'generic' && item.status !== 'pending' && (
                    <div className="mt-2">
                      <OwnerSelect item={item} members={members} updateItem={updateItem} />
                    </div>
                  )}
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

function OwnerSelect({ item, members, updateItem }: {
  item: QueueItem;
  members: { id: number; name: string; slug: string }[];
  updateItem: (id: string, patch: Partial<QueueItem>) => void;
}) {
  return (
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
  );
}

function GenericMappingEditor({ item, members, updateItem }: {
  item: QueueItem;
  members: { id: number; name: string; slug: string }[];
  updateItem: (id: string, patch: Partial<QueueItem>) => void;
}) {
  const headers = item.headers ?? [];
  const sampleRows = item.sampleRows ?? [];
  const mapping = item.columnMapping;
  const isSaved = item.savedProfile;
  const [showEditor, setShowEditor] = useState(!isSaved);

  function setMapping(patch: Partial<ColumnMapping>) {
    updateItem(item.id, {
      columnMapping: { ...(mapping!), ...patch },
      savedProfile: false,
    });
  }

  const previewCols = [mapping?.dateColumn, mapping?.amountColumn, mapping?.merchantColumn].filter((c): c is string => !!c);

  return (
    <div className="mt-3 space-y-3">
      {/* Profile badge row */}
      <div className="flex items-center gap-2 flex-wrap">
        {isSaved && !showEditor ? (
          <>
            <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
              Saved: {mapping?.bankLabel ?? 'Unknown Bank'}
            </span>
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              Edit
            </button>
          </>
        ) : (
          <>
            {isSaved && (
              <span className="text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 px-2 py-0.5 rounded-full">
                Saved: {mapping?.bankLabel ?? 'Unknown Bank'}
              </span>
            )}
            {!isSaved && <span className="text-xs text-fg-3 font-medium">Map columns</span>}
          </>
        )}
        <OwnerSelect item={item} members={members} updateItem={updateItem} />
      </div>

      {/* Column mapping dropdowns — hidden in badge mode */}
      {showEditor && (<>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: 'Date *', field: 'dateColumn' as const },
          { label: 'Amount *', field: 'amountColumn' as const },
          { label: 'Merchant *', field: 'merchantColumn' as const },
          { label: 'Note', field: 'noteColumn' as const },
        ].map(({ label, field }) => (
          <div key={field}>
            <label className="block text-[10px] text-fg-3 mb-0.5">{label}</label>
            <select
              value={(mapping?.[field] as string | null | undefined) ?? ''}
              onChange={e => setMapping({ [field]: e.target.value || null })}
              className="w-full text-xs border border-border-soft rounded px-1.5 py-1 bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">{field === 'noteColumn' ? '(none)' : 'Select…'}</option>
              {headers.map(h => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Advanced options row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label htmlFor={`${item.id}-amt-fmt`} className="block text-[10px] text-fg-3 mb-0.5">Amount format</label>
          <select
            id={`${item.id}-amt-fmt`}
            value={mapping?.amountFormat ?? 'standard'}
            onChange={e => setMapping({ amountFormat: e.target.value as 'standard' | 'finnish' })}
            className="text-xs border border-border-soft rounded px-1.5 py-1 bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="standard">1234.56 (dot)</option>
            <option value="finnish">1 234,56 (comma)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${item.id}-sign`} className="block text-[10px] text-fg-3 mb-0.5">Expense sign</label>
          <select
            id={`${item.id}-sign`}
            value={mapping?.amountSign ?? 'standard'}
            onChange={e => setMapping({ amountSign: e.target.value as 'standard' | 'inverted' })}
            className="text-xs border border-border-soft rounded px-1.5 py-1 bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="standard">Negative = expense</option>
            <option value="inverted">Positive = expense</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${item.id}-bank`} className="block text-[10px] text-fg-3 mb-0.5">Bank name</label>
          <input
            id={`${item.id}-bank`}
            type="text"
            value={mapping?.bankLabel ?? ''}
            onChange={e => setMapping({ bankLabel: e.target.value })}
            placeholder="e.g. Nordea"
            className="text-xs border border-border-soft rounded px-1.5 py-1 bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-blue-500 w-28"
          />
        </div>
      </div>

      {/* Sample preview table */}
      {previewCols.length > 0 && sampleRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border-soft">
                {previewCols.map(col => (
                  <th key={col} className="text-left py-1 pr-3 text-fg-3 font-medium truncate max-w-[120px]">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, i) => (
                <tr key={i} className="border-b border-border-soft/50">
                  {previewCols.map(col => (
                    <td key={col} className="py-1 pr-3 text-fg-2 truncate max-w-[120px]">{row[col] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {headers.length === 0 && (
        <p className="text-xs text-red-500">Could not read columns from this file. Check that it&apos;s a valid CSV.</p>
      )}
      </>)}
    </div>
  );
}
