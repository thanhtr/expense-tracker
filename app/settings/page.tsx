import { CategoryManager } from '@/components/CategoryManager';

export default function SettingsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">Settings</h1>
      <p className="text-[13px] text-[var(--fg-3)] mb-8">Manage your spending categories</p>
      <CategoryManager />
    </div>
  );
}
