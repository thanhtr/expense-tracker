import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { revalidateTag } from '@/lib/cache-tags';
import { prisma } from '@/lib/db';
import { createPointsBalanceSchema, updatePointsBalanceSchema, parseBody, parseId, parseRouteId } from '@/lib/validation';
import { POINTS_GOAL_INCLUDE } from '@/lib/services/points-goal-service';
import { enrichPointsGoal } from '@/lib/services/points-goal-enrichment';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = await parseRouteId(params);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(createPointsBalanceSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { balance, amexMr, recordedAt, note } = parsed.data;

    await prisma.pointsBalance.create({
      data: { goalId: idResult.id, balance, amexMr, note, recordedAt: new Date(recordedAt) },
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
    console.error('Failed to add points balance:', error);
    return NextResponse.json({ error: 'Failed to add points balance' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = await parseRouteId(params);
    if ('error' in idResult) return idResult.error;

    const balanceIdStr = new URL(request.url).searchParams.get('balanceId');
    if (!balanceIdStr) return NextResponse.json({ error: 'balanceId is required' }, { status: 400 });
    const balanceIdResult = parseId(balanceIdStr);
    if ('error' in balanceIdResult) return balanceIdResult.error;

    const parsed = parseBody(updatePointsBalanceSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { balance, amexMr, recordedAt, note } = parsed.data;

    const data: Parameters<typeof prisma.pointsBalance.updateMany>[0]['data'] = {};
    if (balance !== undefined) data.balance = balance;
    if (amexMr !== undefined) data.amexMr = amexMr;
    if (recordedAt !== undefined) data.recordedAt = new Date(recordedAt);
    if (note !== undefined) data.note = note;

    // updateMany (not update), same reasoning as the flight edit route: the goalId check must be
    // a real filter, not just a selector alongside the unique id.
    const { count } = await prisma.pointsBalance.updateMany({
      where: { id: balanceIdResult.id, goalId: idResult.id },
      data,
    });
    if (count === 0) return NextResponse.json({ error: 'Balance not found' }, { status: 404 });
    revalidateTag('readings');

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: POINTS_GOAL_INCLUDE,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json(await enrichPointsGoal(goal));
  } catch (error) {
    console.error('Failed to update points balance:', error);
    return NextResponse.json({ error: 'Failed to update points balance' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const idResult = await parseRouteId(params);
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
    revalidateTag('readings');

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: POINTS_GOAL_INCLUDE,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json(await enrichPointsGoal(goal));
  } catch (error) {
    console.error('Failed to delete points balance:', error);
    return NextResponse.json({ error: 'Failed to delete points balance' }, { status: 500 });
  }
}
