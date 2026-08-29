import { CategoryManager } from '@/components/CategoryManager';
import { HouseholdManager } from '@/components/HouseholdManager';

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-12">
      <div>
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">Settings</h1>
        <p className="text-[13px] text-[var(--fg-3)]">Manage your household and spending categories</p>
      </div>

      <section>
        <h2 className="text-[16px] font-semibold mb-1">Household members</h2>
        <p className="text-[13px] text-[var(--fg-3)] mb-4">
          Members shown in the upload form when assigning who a CSV belongs to.
        </p>
        <HouseholdManager />
      </section>

      <section>
        <h2 className="text-[16px] font-semibold mb-1">Spending categories</h2>
        <p className="text-[13px] text-[var(--fg-3)] mb-4">
          Categories available when categorizing transactions.
        </p>
        <CategoryManager />
      </section>
    </div>
  );
}
