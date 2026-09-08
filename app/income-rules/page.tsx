import { redirect } from 'next/navigation';

export default function IncomeRulesPage() {
  redirect('/settings?tab=income-rules');
}
