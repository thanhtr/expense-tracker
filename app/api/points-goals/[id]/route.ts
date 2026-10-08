import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { updatePointsGoalSchema, parseBody, parseRouteId } from '@/lib/validation';
import { POINTS_GOAL_INCLUDE } from '@/lib/services/points-goal-service';
import { enrichPointsGoal } from '@/lib/services/points-goal-enrichment';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = await parseRouteId(params);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(updatePointsGoalSchema, await request.json());
    if ('error' in parsed) return parsed.error;

    const goal = await prisma.pointsGoal.update({
      where: { id: idResult.id },
      data: parsed.data,
      include: POINTS_GOAL_INCLUDE,
    });
    revalidateTag('readings', { expire: 0 });

    return NextResponse.json(await enrichPointsGoal(goal));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    console.error('Failed to update points goal:', error);
    return NextResponse.json({ error: 'Failed to update points goal' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = await parseRouteId(params);
    if ('error' in idResult) return idResult.error;

    await prisma.pointsGoal.delete({ where: { id: idResult.id } });
    revalidateTag('readings', { expire: 0 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    console.error('Failed to delete points goal:', error);
    return NextResponse.json({ error: 'Failed to delete points goal' }, { status: 500 });
  }
}
