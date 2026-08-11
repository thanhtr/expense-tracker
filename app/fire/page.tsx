import { FireDashboard } from '@/components/FireDashboard';

export default function FirePage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">FIRE Tracker</h1>
        <p className="text-[13px] text-[var(--fg-3)]">Finland Pension Bridge model · hankintameno-olettama · TyEL offset</p>
      </div>
      <FireDashboard />
    </div>
  );
}
