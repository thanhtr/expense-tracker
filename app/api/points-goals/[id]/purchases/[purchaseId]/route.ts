import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updatePointsPurchaseSchema, parseBody, parseId } from '@/lib/validation';
import { POINTS_GOAL_INCLUDE } from '@/lib/services/points-goal-service';
import { enrichPointsGoal } from '@/lib/services/points-goal-enrichment';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; purchaseId: string }> }
) {
  try {
    const { id: idStr, purchaseId: purchaseIdStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;
    const purchaseIdResult = parseId(purchaseIdStr);
    if ('error' in purchaseIdResult) return purchaseIdResult.error;

    const parsed = parseBody(updatePointsPurchaseSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { points, costEur, purchasedAt, kind, note } = parsed.data;

    const data: Parameters<typeof prisma.pointsPurchase.updateMany>[0]['data'] = {};
    if (points !== undefined) data.points = points;
    if (costEur !== undefined) data.costEur = costEur;
    if (purchasedAt !== undefined) data.purchasedAt = new Date(purchasedAt);
    if (kind !== undefined) data.kind = kind;
    if (note !== undefined) data.note = note;

    // updateMany (not update) so the goalId check is a real filter, same reasoning as the
    // flight/balance edit routes.
    const { count } = await prisma.pointsPurchase.updateMany({
      where: { id: purchaseIdResult.id, goalId: idResult.id },
      data,
    });
    if (count === 0) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: POINTS_GOAL_INCLUDE,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json(await enrichPointsGoal(goal));
  } catch (error) {
    console.error('Failed to update points purchase:', error);
    return NextResponse.json({ error: 'Failed to update points purchase' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; purchaseId: string }> }
) {
  try {
    const { id: idStr, purchaseId: purchaseIdStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;
    const purchaseIdResult = parseId(purchaseIdStr);
    if ('error' in purchaseIdResult) return purchaseIdResult.error;

    const { count } = await prisma.pointsPurchase.deleteMany({
      where: { id: purchaseIdResult.id, goalId: idResult.id },
    });
    if (count === 0) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 });

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: POINTS_GOAL_INCLUDE,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json(await enrichPointsGoal(goal));
  } catch (error) {
    console.error('Failed to delete points purchase:', error);
    return NextResponse.json({ error: 'Failed to delete points purchase' }, { status: 500 });
  }
}
