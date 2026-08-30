import { IncomeRuleManager } from '@/components/IncomeRuleManager';

export const metadata = { title: 'Income Rules' };

export default function IncomeRulesPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <IncomeRuleManager />
    </main>
  );
}
