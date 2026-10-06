import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createPointsBalanceSchema, parseBody, parseId } from '@/lib/validation';
import { computePointsGoalProgress } from '@/lib/services/points-goal-service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(createPointsBalanceSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { balance, recordedAt, note } = parsed.data;

    await prisma.pointsBalance.create({
      data: { goalId: idResult.id, balance, note, recordedAt: new Date(recordedAt) },
    });

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: {
        levels: { orderBy: { targetPoints: 'asc' } },
        balances: { orderBy: { recordedAt: 'asc' } },
      },
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json({ ...goal, progress: computePointsGoalProgress(goal) }, { status: 201 });
  } catch (error) {
    console.error('Failed to add points balance:', error);
    return NextResponse.json({ error: 'Failed to add points balance' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const balanceIdStr = new URL(request.url).searchParams.get('balanceId');
    if (!balanceIdStr) return NextResponse.json({ error: 'balanceId is required' }, { status: 400 });
    const balanceIdResult = parseId(balanceIdStr);
    if ('error' in balanceIdResult) return balanceIdResult.error;

    // deleteMany (not delete) so the goalId check is enforced as a real filter, not just a
    // selector alongside the unique id — this rejects deleting a reading that belongs to a
    // different goal instead of silently deleting it anyway.
    const { count } = await prisma.pointsBalance.deleteMany({
      where: { id: balanceIdResult.id, goalId: idResult.id },
    });
    if (count === 0) return NextResponse.json({ error: 'Balance not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete points balance:', error);
    return NextResponse.json({ error: 'Failed to delete points balance' }, { status: 500 });
  }
}
