'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { CategoryManager } from '@/components/CategoryManager';
import { HouseholdManager } from '@/components/HouseholdManager';
import { KeywordManager } from '@/components/KeywordManager';
import { IncomeRuleManager } from '@/components/IncomeRuleManager';
import { AssetManager } from '@/components/AssetManager';

const TABS = [
  { slug: 'household',    label: 'Household' },
  { slug: 'categories',  label: 'Categories' },
  { slug: 'keywords',    label: 'Keywords' },
  { slug: 'income-rules', label: 'Income Rules' },
  { slug: 'assets',      label: 'Assets' },
] as const;

type TabSlug = typeof TABS[number]['slug'];

const TAB_DESCRIPTIONS: Record<TabSlug, string> = {
  'household':    'Members shown in the upload form when assigning who a CSV belongs to.',
  'categories':   'Categories available when categorizing transactions.',
  'keywords':     'Keyword-to-category rules for automatic transaction categorization.',
  'income-rules': 'Rules that classify incoming transactions as income or reimbursements.',
  'assets':       'Track bank accounts, investments, property, and liabilities. Each balance update creates a history snapshot.',
};

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawTab = searchParams.get('tab') ?? 'household';
  const activeTab: TabSlug = (TABS.some(t => t.slug === rawTab) ? rawTab : 'household') as TabSlug;

  function setTab(slug: TabSlug) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', slug);
    router.replace(`/settings?${params.toString()}`);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">Settings</h1>
        <p className="text-[13px] text-[var(--fg-3)]">Household, categories, keywords, income rules, and assets</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border-soft mb-6 overflow-x-auto">
        {TABS.map(({ slug, label }) => (
          <button
            key={slug}
            type="button"
            onClick={() => setTab(slug)}
            className={`px-3 py-2 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              activeTab === slug
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-[var(--fg-3)] hover:text-[var(--fg-2)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab description */}
      <p className="text-[13px] text-[var(--fg-3)] mb-4">{TAB_DESCRIPTIONS[activeTab]}</p>

      {/* Tab content */}
      {activeTab === 'household'    && <HouseholdManager />}
      {activeTab === 'categories'   && <CategoryManager />}
      {activeTab === 'keywords'     && <KeywordManager />}
      {activeTab === 'income-rules' && <IncomeRuleManager />}
      {activeTab === 'assets'       && <AssetManager />}
    </div>
  );
}
