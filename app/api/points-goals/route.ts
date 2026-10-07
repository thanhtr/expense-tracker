import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createPointsGoalSchema, parseBody } from '@/lib/validation';
import { POINTS_GOAL_INCLUDE } from '@/lib/services/points-goal-service';
import { enrichPointsGoals, enrichPointsGoal } from '@/lib/services/points-goal-enrichment';

export async function GET() {
  try {
    const goals = await prisma.pointsGoal.findMany({
      orderBy: { createdAt: 'asc' },
      include: POINTS_GOAL_INCLUDE,
    });

    return NextResponse.json(await enrichPointsGoals(goals));
  } catch (error) {
    console.error('Failed to fetch points goals:', error);
    return NextResponse.json({ error: 'Failed to fetch points goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = parseBody(createPointsGoalSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, unit, note } = parsed.data;

    const goal = await prisma.pointsGoal.create({
      data: { name, unit, note },
      include: POINTS_GOAL_INCLUDE,
    });

    return NextResponse.json(await enrichPointsGoal(goal), { status: 201 });
  } catch (error) {
    console.error('Failed to create points goal:', error);
    return NextResponse.json({ error: 'Failed to create points goal' }, { status: 500 });
  }
}
