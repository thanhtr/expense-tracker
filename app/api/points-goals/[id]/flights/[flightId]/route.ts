import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updatePointsFlightSchema, parseBody, parseId } from '@/lib/validation';
import { POINTS_GOAL_INCLUDE } from '@/lib/services/points-goal-service';
import { enrichPointsGoal } from '@/lib/services/points-goal-enrichment';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; flightId: string }> }
) {
  try {
    const { id: idStr, flightId: flightIdStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;
    const flightIdResult = parseId(flightIdStr);
    if ('error' in flightIdResult) return flightIdResult.error;

    const parsed = parseBody(updatePointsFlightSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { label, points, economyFareEur, neededBy, status, redeemedAt, note } = parsed.data;

    const data: Parameters<typeof prisma.pointsFlight.updateMany>[0]['data'] = {};
    if (label !== undefined) data.label = label;
    if (points !== undefined) data.points = points;
    if (economyFareEur !== undefined) data.economyFareEur = economyFareEur;
    if (neededBy !== undefined) data.neededBy = new Date(neededBy);
    if (status !== undefined) data.status = status;
    if (redeemedAt !== undefined) data.redeemedAt = redeemedAt ? new Date(redeemedAt) : null;
    if (note !== undefined) data.note = note;

    // updateMany (not update) so the goalId check is a real filter, not just a selector
    // alongside the unique id — this rejects editing a flight that belongs to a different goal.
    const { count } = await prisma.pointsFlight.updateMany({
      where: { id: flightIdResult.id, goalId: idResult.id },
      data,
    });
    if (count === 0) return NextResponse.json({ error: 'Flight not found' }, { status: 404 });

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: POINTS_GOAL_INCLUDE,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json(await enrichPointsGoal(goal));
  } catch (error) {
    console.error('Failed to update points flight:', error);
    return NextResponse.json({ error: 'Failed to update points flight' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; flightId: string }> }
) {
  try {
    const { id: idStr, flightId: flightIdStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;
    const flightIdResult = parseId(flightIdStr);
    if ('error' in flightIdResult) return flightIdResult.error;

    const { count } = await prisma.pointsFlight.deleteMany({
      where: { id: flightIdResult.id, goalId: idResult.id },
    });
    if (count === 0) return NextResponse.json({ error: 'Flight not found' }, { status: 404 });

    const goal = await prisma.pointsGoal.findUnique({
      where: { id: idResult.id },
      include: POINTS_GOAL_INCLUDE,
    });
    if (!goal) return NextResponse.json({ error: 'Goal not found' }, { status: 404 });

    return NextResponse.json(await enrichPointsGoal(goal));
  } catch (error) {
    console.error('Failed to delete points flight:', error);
    return NextResponse.json({ error: 'Failed to delete points flight' }, { status: 500 });
  }
}
