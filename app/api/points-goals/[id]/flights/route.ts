import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { revalidateTag } from '@/lib/cache-tags';
import { prisma } from '@/lib/db';
import { createPointsFlightSchema, parseBody, parseRouteId } from '@/lib/validation';
import { POINTS_GOAL_INCLUDE } from '@/lib/services/points-goal-service';
import { enrichPointsGoal } from '@/lib/services/points-goal-enrichment';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = await parseRouteId(params);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(createPointsFlightSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { label, points, economyFareEur, neededBy, note } = parsed.data;

    await prisma.pointsFlight.create({
      data: {
        goalId: idResult.id,
        label,
        points,
        economyFareEur: economyFareEur ?? null,
        neededBy: new Date(neededBy),
        note,
      },
    });
    revalidateTag('readings');

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
    console.error('Failed to add points flight:', error);
    return NextResponse.json({ error: 'Failed to add points flight' }, { status: 500 });
  }
}
