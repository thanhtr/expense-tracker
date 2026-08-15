'use client';

import { useEffect, useState, useCallback } from 'react';

interface BankConnection {
  id: number;
  aspspId: string;
  aspspName: string;
  accountLabel: string;
  owner: string;
  status: string;
  lastSyncAt: string | null;
}

interface Institution {
  name: string;
  id: string;
}

export default function BankConnectionsPage() {
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedAspsp, setSelectedAspsp] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [owner, setOwner] = useState('tung');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState<number | 'all' | null>(null);
  const [message, setMessage] = useState('');
  const [loadingInstitutions, setLoadingInstitutions] = useState(true);

  const loadConnections = useCallback(async () => {
    const res = await fetch('/api/bank-connections');
    if (res.ok) setConnections(await res.json());
  }, []);

  useEffect(() => {
    loadConnections();

    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setMessage('Bank connected successfully.');
    if (params.get('error')) setMessage(`Connection failed: ${params.get('error')}`);

    fetch('/api/bank-connections/institutions')
      .then(r => r.json())
      .then((data: Institution[]) => {
        setInstitutions(data);
        setLoadingInstitutions(false);
      })
      .catch(() => setLoadingInstitutions(false));
  }, [loadConnections]);

  async function handleConnect() {
    if (!selectedAspsp || !accountLabel) return;
    setConnecting(true);
    setMessage('');
    try {
      const inst = institutions.find(i => i.id === selectedAspsp);
      const res = await fetch('/api/bank-connections/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspspId: selectedAspsp, aspspName: inst?.name ?? selectedAspsp, accountLabel, owner }),
      });
      const { authUrl, error } = await res.json();
      if (error) { setMessage(error); return; }
      window.location.href = authUrl;
    } catch {
      setMessage('Failed to initiate connection.');
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync(connectionId?: number) {
    setSyncing(connectionId ?? 'all');
    setMessage('');
    try {
      const res = await fetch('/api/bank-connections/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(connectionId ? { connectionId } : {}),
      });
      const data = await res.json();
      if (data.errors?.length) {
        setMessage(`Sync done with errors: ${data.errors.join(', ')}`);
      } else {
        setMessage(`Synced — ${data.created} new, ${data.skipped} already imported.`);
      }
      await loadConnections();
    } catch {
      setMessage('Sync failed.');
    } finally {
      setSyncing(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Remove this bank connection?')) return;
    await fetch(`/api/bank-connections/${id}`, { method: 'DELETE' });
    await loadConnections();
  }

  const activeConnections = connections.filter(c => c.status === 'active');

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">Bank Connections</h1>
        <p className="text-[13px] text-[var(--fg-3)]">Connect your OP Bank or Aktia account for automatic transaction sync.</p>
      </div>

      {message && (
        <p className={`text-sm px-3 py-2 rounded-md ${message.includes('error') || message.includes('failed') || message.includes('Failed')
          ? 'bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400'
          : 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400'}`}>
          {message}
        </p>
      )}

      {/* Connected banks */}
      {connections.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[15px] font-medium">Connected banks</h2>
            {activeConnections.length > 0 && (
              <button
                onClick={() => handleSync()}
                disabled={syncing !== null}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
              >
                {syncing === 'all' ? 'Syncing…' : 'Sync all'}
              </button>
            )}
          </div>
          <div className="divide-y divide-border-soft border border-border-soft rounded-lg overflow-hidden">
            {connections.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 bg-surface">
                <div>
                  <p className="text-sm font-medium">{c.accountLabel}</p>
                  <p className="text-xs text-[var(--fg-3)]">
                    {c.aspspName} · {c.owner} ·{' '}
                    <span className={c.status === 'active' ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}>
                      {c.status}
                    </span>
                    {c.lastSyncAt && ` · Last synced ${new Date(c.lastSyncAt).toLocaleDateString('fi-FI')}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {c.status === 'active' && (
                    <button
                      onClick={() => handleSync(c.id)}
                      disabled={syncing !== null}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    >
                      {syncing === c.id ? 'Syncing…' : 'Sync'}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Connect a bank */}
      <div className="space-y-3">
        <h2 className="text-[15px] font-medium">Connect a bank</h2>
        <div className="border border-border-soft rounded-lg p-4 bg-surface space-y-3">
          <div>
            <label htmlFor="aspsp-select" className="block text-xs text-[var(--fg-3)] mb-1">Bank</label>
            {loadingInstitutions ? (
              <p className="text-sm text-[var(--fg-3)]">Loading banks…</p>
            ) : (
              <select
                id="aspsp-select"
                value={selectedAspsp}
                onChange={e => {
                  setSelectedAspsp(e.target.value);
                  const inst = institutions.find(i => i.id === e.target.value);
                  if (inst && !accountLabel) setAccountLabel(inst.name);
                }}
                className="w-full text-sm border border-border-soft rounded-md px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select a bank…</option>
                {institutions.map(i => (
                  <option key={i.id} value={i.id}>{i.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label htmlFor="account-label" className="block text-xs text-[var(--fg-3)] mb-1">Account label (shown in transactions)</label>
            <input
              id="account-label"
              type="text"
              value={accountLabel}
              onChange={e => setAccountLabel(e.target.value)}
              placeholder="e.g. OP Bank"
              className="w-full text-sm border border-border-soft rounded-md px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="owner-select" className="block text-xs text-[var(--fg-3)] mb-1">Owner</label>
            <select
              id="owner-select"
              value={owner}
              onChange={e => setOwner(e.target.value)}
              className="w-full text-sm border border-border-soft rounded-md px-3 py-2 bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="tung">Tung</option>
              <option value="thuy">Thuy</option>
            </select>
          </div>
          <button
            onClick={handleConnect}
            disabled={!selectedAspsp || !accountLabel || connecting}
            className="w-full text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium py-2 rounded-md transition-colors"
          >
            {connecting ? 'Redirecting to bank…' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}
