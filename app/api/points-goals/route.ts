import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createPointsGoalSchema, parseBody } from '@/lib/validation';
import { computePointsGoalProgress } from '@/lib/services/points-goal-service';

export async function GET() {
  try {
    const goals = await prisma.pointsGoal.findMany({
      orderBy: { periodStart: 'asc' },
      include: {
        levels: { orderBy: { targetPoints: 'asc' } },
        balances: { orderBy: { recordedAt: 'asc' } },
      },
    });

    const withProgress = goals.map((goal) => ({
      ...goal,
      progress: computePointsGoalProgress(goal),
    }));

    return NextResponse.json(withProgress);
  } catch (error) {
    console.error('Failed to fetch points goals:', error);
    return NextResponse.json({ error: 'Failed to fetch points goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = parseBody(createPointsGoalSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, unit, periodStart, periodEnd, note, levels } = parsed.data;

    const goal = await prisma.pointsGoal.create({
      data: {
        name,
        unit,
        note,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        levels: {
          create: levels.map((l, i) => ({ label: l.label, targetPoints: l.targetPoints, sortOrder: i })),
        },
      },
      include: { levels: { orderBy: { targetPoints: 'asc' } }, balances: true },
    });

    return NextResponse.json({ ...goal, progress: computePointsGoalProgress(goal) }, { status: 201 });
  } catch (error) {
    console.error('Failed to create points goal:', error);
    return NextResponse.json({ error: 'Failed to create points goal' }, { status: 500 });
  }
}
