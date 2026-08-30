'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useCategories } from '@/components/CategoriesProvider';

interface IncomeRule {
  id: number;
  label: string;
  merchantPattern: string | null;
  category: string | null;
  createdAt: string;
}

export function IncomeRuleManager() {
  const [rules, setRules] = useState<IncomeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const { categories } = useCategories();

  const [label, setLabel] = useState('');
  const [merchantPattern, setMerchantPattern] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/income-rules');
      if (res.ok) setRules(await res.json());
    } catch {
      toast.error('Failed to load income rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!merchantPattern.trim() && !category.trim()) {
      toast.error('Enter a merchant pattern, a category, or both');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/income-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: label.trim(),
          merchantPattern: merchantPattern.trim() || undefined,
          category: category.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        toast.error(d.error || 'Failed to add rule');
        return;
      }
      const rule = await res.json();
      setRules(r => [...r, rule]);
      setLabel('');
      setMerchantPattern('');
      setCategory('');
      toast.success('Income rule added');
    } catch {
      toast.error('An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this income rule?')) return;
    try {
      const res = await fetch(`/api/income-rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setRules(r => r.filter(x => x.id !== id));
      toast.success('Rule deleted');
    } catch {
      toast.error('Failed to delete rule');
    }
  };

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/income-rules/seed', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { toast.error(d.error || 'Seed failed'); return; }
      toast.success(d.seeded > 0 ? `Seeded ${d.seeded} default rules` : 'Default rules already present');
      fetchRules();
    } catch {
      toast.error('Failed to seed defaults');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Income Rules</h1>
        <p className="mt-1 text-sm text-fg-2">
          Positive incoming transfers that match a rule are classified as <strong>Income</strong>.
          Everything else is classified as <strong>Expense (reimbursement)</strong> — money back against an expense category.
        </p>
      </div>

      {/* Add rule form */}
      <form onSubmit={handleAdd} className="bg-surface border border-border-soft rounded-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">Add income rule</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="rule-label" className="block text-xs text-fg-2 mb-1">Label (optional)</label>
            <input
              id="rule-label"
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Salary"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="rule-merchant" className="block text-xs text-fg-2 mb-1">Merchant contains</label>
            <input
              id="rule-merchant"
              type="text"
              value={merchantPattern}
              onChange={e => setMerchantPattern(e.target.value)}
              placeholder="e.g. PALKKA"
              maxLength={200}
              className="w-full px-3 py-2 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="rule-category" className="block text-xs text-fg-2 mb-1">Category equals</label>
            <select
              id="rule-category"
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-border-soft rounded bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="">(any)</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-fg-3">
          If both fields are filled, both must match. At least one field is required.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            Add rule
          </button>
          <button
            type="button"
            onClick={handleSeedDefaults}
            disabled={seeding}
            className="px-4 py-2 text-sm bg-surface-2 text-fg-2 rounded hover:bg-[var(--border)] disabled:opacity-50"
          >
            {seeding ? 'Seeding…' : 'Seed defaults'}
          </button>
        </div>
      </form>

      {/* Rules table */}
      <div className="bg-surface border border-border-soft rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">
            {rules.length} {rules.length === 1 ? 'rule' : 'rules'}
          </span>
          <span className="text-xs text-fg-3">
            Positive transactions not matching any rule → Expense (reimbursement)
          </span>
        </div>
        {loading ? (
          <div className="px-4 py-6 text-sm text-fg-3 text-center">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="px-4 py-6 text-sm text-fg-3 text-center">
            No rules yet. Add one above or click &ldquo;Seed defaults&rdquo; to add common salary and capital income patterns.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-soft text-xs text-fg-3 uppercase tracking-wide">
                <th className="px-4 py-2 text-left">Label</th>
                <th className="px-4 py-2 text-left">Merchant contains</th>
                <th className="px-4 py-2 text-left">Category equals</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map(rule => (
                <tr key={rule.id} className="border-b border-border-soft hover:bg-surface-2 last:border-0">
                  <td className="px-4 py-2 text-foreground">{rule.label || <span className="text-fg-3 italic">—</span>}</td>
                  <td className="px-4 py-2">
                    {rule.merchantPattern
                      ? <code className="px-1.5 py-0.5 text-xs rounded bg-surface-2 text-foreground">{rule.merchantPattern}</code>
                      : <span className="text-fg-3">—</span>}
                  </td>
                  <td className="px-4 py-2 text-fg-2">{rule.category ?? <span className="text-fg-3">—</span>}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => handleDelete(rule.id)}
                      aria-label={`Delete rule ${rule.label}`}
                      className="text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
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
