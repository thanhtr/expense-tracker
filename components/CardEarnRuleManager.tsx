'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AVIOS_SOURCES } from '@/lib/avios-facts';
import { SourceLinks } from './SourceLinks';

type Account = 'Amex' | 'Finnair Visa';
type Classification = 'normal' | 'bonus' | 'excluded';

interface CardEarnRule {
  id: number;
  account: string;
  merchantPattern: string;
  classification: string;
  note: string;
  createdAt: string;
}

const ACCOUNTS: Account[] = ['Amex', 'Finnair Visa'];

// 'bonus' (4 MR/€) is an Amex-only rate — the reconciliation math treats it as a no-op for
// Finnair Visa (see avios-earn-service.ts), so it isn't offered as a choice for that account to
// avoid a rule that silently does nothing.
function classificationsFor(account: Account): Classification[] {
  return account === 'Amex' ? ['normal', 'bonus', 'excluded'] : ['normal', 'excluded'];
}

export function CardEarnRuleManager() {
  const [rules, setRules] = useState<CardEarnRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [account, setAccount] = useState<Account>('Amex');
  const [merchantPattern, setMerchantPattern] = useState('');
  const [classification, setClassification] = useState<Classification>('bonus');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editClassification, setEditClassification] = useState<Classification>('normal');
  const [savingEdit, setSavingEdit] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/card-earn-rules');
      if (!res.ok) throw new Error('Failed to load card earn rules');
      setRules(await res.json());
    } catch {
      toast.error('Failed to load card earn rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantPattern.trim()) {
      toast.error('Enter a merchant pattern');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/card-earn-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account, merchantPattern: merchantPattern.trim(), classification, note: note.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Failed to add rule');
        return;
      }
      const rule = await res.json();
      setRules(r => [...r, rule]);
      setMerchantPattern('');
      setNote('');
      toast.success('Card earn rule added');
    } catch {
      toast.error('An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this card earn rule?')) return;
    try {
      const res = await fetch(`/api/card-earn-rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setRules(r => r.filter(x => x.id !== id));
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleSaveEdit = async (id: number) => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/card-earn-rules/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classification: editClassification }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setRules(r => r.map(x => (x.id === id ? updated : x)));
      setEditingId(null);
      toast.success('Rule updated');
    } catch {
      toast.error('Failed to update rule');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Card Earn Rules</h1>
        <p className="mt-1 text-sm text-fg-2">
          Classifies Amex and Finnair Visa card spend for the Avios/MR earn reconciliation on the Goals page.
          <strong> Normal</strong> is the default for anything unclassified. <strong>Bonus</strong> is Amex&apos;s 4
          MR/€ rate on selected airline/hotel partners (the official partner list isn&apos;t fetchable, so mark
          merchants here as you notice them). <strong>Excluded</strong> is for transfers, bill payments, cash
          withdrawals, or other non-purchase rows that earn no Avios/MR at all.
        </p>
        <p className="mt-2 text-xs text-fg-3">
          These are candidates worth checking, not confirmed rules: Finnair&apos;s Visa page states no Avios on
          bill payments/cash withdrawals/bank transfers, but what counts as one of these isn&apos;t always clear
          from a transaction row. Amex&apos;s transfer-partner page names Lufthansa, British Airways, Iberia, Air
          France-KLM, Qatar Airways, Emirates, Hilton and Marriott as partners — that page lists transfer partners,
          not confirmed as the same list as the 4 MR/€ earning partners.{' '}
          <SourceLinks sources={[AVIOS_SOURCES.visa, AVIOS_SOURCES.amexPlatinum]} />
        </p>
      </div>

      <form onSubmit={handleAdd} className="bg-surface border border-border-soft rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Add rule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label htmlFor="rule-account" className="block text-xs text-fg-2 mb-1">Account</label>
            <select
              id="rule-account"
              value={account}
              onChange={e => {
                const nextAccount = e.target.value as Account;
                setAccount(nextAccount);
                // Reset off 'bonus' when switching to an account it doesn't apply to, so the form
                // never silently submits a no-op rule.
                if (!classificationsFor(nextAccount).includes(classification)) setClassification('normal');
              }}
              className="w-full px-3 py-2 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rule-merchant" className="block text-xs text-fg-2 mb-1">Merchant contains</label>
            <input
              id="rule-merchant"
              type="text"
              value={merchantPattern}
              onChange={e => setMerchantPattern(e.target.value)}
              placeholder="e.g. BRITISH AIRWAYS"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="rule-classification" className="block text-xs text-fg-2 mb-1">Classification</label>
            <select
              id="rule-classification"
              value={classification}
              onChange={e => setClassification(e.target.value as Classification)}
              className="w-full px-3 py-2 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              {classificationsFor(account).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="rule-note" className="block text-xs text-fg-2 mb-1">Note (optional)</label>
            <input
              id="rule-note"
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. confirmed on Oct statement"
              maxLength={500}
              className="w-full px-3 py-2 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          Add rule
        </button>
      </form>

      <div className="bg-surface border border-border-soft rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
          </span>
          <span className="text-xs text-fg-3">Unmatched merchants default to normal</span>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-fg-3 text-center">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="px-4 py-6 text-sm text-fg-3 text-center">
            No rules yet. Add one above as you notice a bonus-rate or excluded merchant.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs text-fg-3 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Account</th>
                <th className="px-4 py-2 text-left">Merchant contains</th>
                <th className="px-4 py-2 text-left">Classification</th>
                <th className="px-4 py-2 text-left">Note</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b border-border-soft hover:bg-surface-2 last:border-0">
                  <td className="px-4 py-2 text-fg-2">{rule.account}</td>
                  <td className="px-4 py-2">
                    <code className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-foreground">{rule.merchantPattern}</code>
                  </td>
                  <td className="px-4 py-2">
                    {editingId === rule.id ? (
                      <select
                        value={editClassification}
                        onChange={e => setEditClassification(e.target.value as Classification)}
                        className="px-2 py-1 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                      >
                        {classificationsFor(rule.account as Account).map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    ) : (
                      <span className="text-foreground">{rule.classification}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-fg-2">{rule.note || <span className="text-fg-3">—</span>}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {editingId === rule.id ? (
                      <>
                        <button
                          onClick={() => void handleSaveEdit(rule.id)}
                          disabled={savingEdit}
                          className="text-blue-600 hover:text-blue-700 px-2 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={savingEdit}
                          className="text-fg-3 hover:text-fg-1 px-2"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditClassification(rule.classification as Classification); setEditingId(rule.id); }}
                          className="text-fg-3 hover:text-fg-1 px-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          aria-label={`Delete rule ${rule.merchantPattern}`}
                          className="text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
