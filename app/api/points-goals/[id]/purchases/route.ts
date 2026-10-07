import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { createPointsPurchaseSchema, parseBody, parseRouteId } from '@/lib/validation';
import { POINTS_GOAL_INCLUDE } from '@/lib/services/points-goal-service';
import { enrichPointsGoal } from '@/lib/services/points-goal-enrichment';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = await parseRouteId(params);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(createPointsPurchaseSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { points, costEur, purchasedAt, kind, note } = parsed.data;

    await prisma.pointsPurchase.create({
      data: { goalId: idResult.id, points, costEur, purchasedAt: new Date(purchasedAt), kind, note },
    });

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: POINTS_GOAL_INCLUDE,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json(await enrichPointsGoal(goal), { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    console.error('Failed to add points purchase:', error);
    return NextResponse.json({ error: 'Failed to add points purchase' }, { status: 500 });
  }
}
