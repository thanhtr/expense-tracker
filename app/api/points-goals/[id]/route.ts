import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { updatePointsGoalSchema, parseBody, parseId } from '@/lib/validation';
import { computePointsGoalProgress } from '@/lib/services/points-goal-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(updatePointsGoalSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, unit, periodStart, periodEnd, note, levels } = parsed.data;

    const data: Parameters<typeof prisma.pointsGoal.update>[0]['data'] = {};
    if (name !== undefined) data.name = name;
    if (unit !== undefined) data.unit = unit;
    if (note !== undefined) data.note = note;
    if (periodStart !== undefined) data.periodStart = new Date(periodStart);
    if (periodEnd !== undefined) data.periodEnd = new Date(periodEnd);

    if (levels !== undefined) {
      // Levels have no independent identity worth preserving across an edit (they're just
      // named thresholds) — replace the set wholesale rather than diffing by id.
      data.levels = {
        deleteMany: {},
        create: levels.map((l, i) => ({ label: l.label, targetPoints: l.targetPoints, sortOrder: i })),
      };
    }

    const goal = await prisma.$transaction(
      (tx) =>
        tx.pointsGoal.update({
          where: { id: idResult.id },
          data,
          include: {
            levels: { orderBy: { targetPoints: 'asc' } },
            balances: { orderBy: { recordedAt: 'asc' } },
          },
        }),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return NextResponse.json({ ...goal, progress: computePointsGoalProgress(goal) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
      if (error.code === 'P2034') {
        return NextResponse.json({ error: 'Conflicting update, please retry' }, { status: 409 });
      }
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
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    await prisma.pointsGoal.delete({ where: { id: idResult.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
    }
    console.error('Failed to delete points goal:', error);
    return NextResponse.json({ error: 'Failed to delete points goal' }, { status: 500 });
  }
}
