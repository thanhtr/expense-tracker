import { describe, it, expect } from 'vitest';
import { computePointsGoalProgress, type PointsGoalInput } from '../../lib/services/points-goal-service';

const LEVELS = [
  { id: 1, label: 'Minimum', targetPoints: 80_000 },
  { id: 2, label: 'Extended', targetPoints: 160_000 },
];

function goal(overrides: Partial<PointsGoalInput> = {}): PointsGoalInput {
  return {
    periodStart: '2026-01-01',
    periodEnd: '2026-12-31',
    levels: LEVELS,
    balances: [],
    ...overrides,
  };
}

describe('computePointsGoalProgress', () => {
  it('reports 0 balance and 0% for a goal with no readings', () => {
    const p = computePointsGoalProgress(goal(), new Date('2026-07-01'));
    expect(p.latestBalance).toBe(0);
    expect(p.latestRecordedAt).toBeNull();
    expect(p.observedPointsPerMonth).toBeNull();
    expect(p.projectedEndBalance).toBeNull();
    for (const l of p.levels) {
      expect(l.reached).toBe(false);
      expect(l.pctOfTarget).toBe(0);
    }
  });

  it('uses the latest reading as the current balance regardless of period boundaries', () => {
    const p = computePointsGoalProgress(
      goal({ balances: [{ id: 1, balance: 50_000, recordedAt: '2026-06-01' }] }),
      new Date('2026-07-01'),
    );
    expect(p.latestBalance).toBe(50_000);
    expect(p.latestRecordedAt).toBe('2026-06-01');
  });

  it('does not compute pace or a projection from a single reading', () => {
    const p = computePointsGoalProgress(
      goal({ balances: [{ id: 1, balance: 50_000, recordedAt: '2026-06-01' }] }),
      new Date('2026-07-01'),
    );
    expect(p.observedPointsPerMonth).toBeNull();
    expect(p.projectedEndBalance).toBeNull();
  });

  it('computes pace and a projection from two readings inside the period', () => {
    const p = computePointsGoalProgress(
      goal({
        balances: [
          { id: 1, balance: 0, recordedAt: '2026-01-01' },
          { id: 2, balance: 30_000, recordedAt: '2026-07-01' }, // ~6 months, ~5000/mo
        ],
      }),
      new Date('2026-07-01'),
    );
    expect(p.observedPointsPerMonth).not.toBeNull();
    expect(p.observedPointsPerMonth!).toBeCloseTo(5_000, -2);
    expect(p.projectedEndBalance).not.toBeNull();
    // ~6 more months at ~5000/mo on top of 30,000
    expect(p.projectedEndBalance!).toBeCloseTo(60_000, -3);
  });

  it('ignores a reading taken before the period when computing pace', () => {
    const p = computePointsGoalProgress(
      goal({
        balances: [
          { id: 1, balance: 10_000, recordedAt: '2025-06-01' }, // outside the 2026 period
          { id: 2, balance: 30_000, recordedAt: '2026-07-01' },
        ],
      }),
      new Date('2026-07-01'),
    );
    // Only one reading falls inside the period, so no pace/projection is computed.
    expect(p.observedPointsPerMonth).toBeNull();
    // But the latest reading overall still sets the current balance.
    expect(p.latestBalance).toBe(30_000);
  });

  it('marks the minimum level reached while the extended level is not', () => {
    const p = computePointsGoalProgress(
      goal({ balances: [{ id: 1, balance: 90_000, recordedAt: '2026-06-01' }] }),
      new Date('2026-07-01'),
    );
    const min = p.levels.find((l) => l.targetPoints === 80_000)!;
    const ext = p.levels.find((l) => l.targetPoints === 160_000)!;
    expect(min.reached).toBe(true);
    expect(min.pointsPerMonthNeeded).toBeNull();
    expect(min.onTrack).toBe(true);
    expect(ext.reached).toBe(false);
    expect(ext.remaining).toBe(70_000);
    expect(ext.pointsPerMonthNeeded).not.toBeNull();
  });

  it('marks both levels reached once the balance clears the higher target', () => {
    const p = computePointsGoalProgress(
      goal({ balances: [{ id: 1, balance: 200_000, recordedAt: '2026-06-01' }] }),
      new Date('2026-07-01'),
    );
    expect(p.levels.every((l) => l.reached)).toBe(true);
    expect(p.levels.every((l) => l.remaining === 0)).toBe(true);
  });

  it('flags a level as behind pace when the projection falls short of its target', () => {
    const p = computePointsGoalProgress(
      goal({
        balances: [
          { id: 1, balance: 0, recordedAt: '2026-01-01' },
          { id: 2, balance: 1_000, recordedAt: '2026-07-01' }, // far too slow for 80k/yr
        ],
      }),
      new Date('2026-07-01'),
    );
    const min = p.levels.find((l) => l.targetPoints === 80_000)!;
    expect(min.onTrack).toBe(false);
  });

  it('clamps period-elapsed percentage to [0, 100] outside the period', () => {
    const before = computePointsGoalProgress(goal(), new Date('2025-01-01'));
    expect(before.periodElapsedPct).toBe(0);
    const after = computePointsGoalProgress(goal(), new Date('2027-06-01'));
    expect(after.periodElapsedPct).toBe(100);
  });
});
