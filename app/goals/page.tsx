import { PointsGoalCard } from '@/components/PointsGoalCard';

export default function GoalsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] mb-1">Goals</h1>
        <p className="text-[13px] text-[var(--fg-3)]">
          Track a points target (e.g. airline miles) over a year or other period. Balances are
          entered manually — see the goal&apos;s note for where each reading comes from.
        </p>
      </div>
      <PointsGoalCard />
    </div>
  );
}
