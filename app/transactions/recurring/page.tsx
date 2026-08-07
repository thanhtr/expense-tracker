import { RecurringTable } from '@/components/RecurringTable';

export default function RecurringPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">Recurring charges</h1>
      <p className="text-[13px] text-[var(--fg-3)] mb-8">
        Merchants that appear in 3+ consecutive months over the past year
      </p>
      <RecurringTable />
    </div>
  );
}
