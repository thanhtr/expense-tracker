import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateGoalSchema, parseBody, parseId } from '@/lib/validation';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(updateGoalSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, targetAmount, currentAmount, targetDate } = parsed.data;

    const data: Parameters<typeof prisma.savingsGoal.update>[0]['data'] = {};
    if (name !== undefined) data.name = name;
    if (targetAmount !== undefined) data.targetAmount = targetAmount;
    if (currentAmount !== undefined) data.currentAmount = currentAmount;
    if (targetDate !== undefined) data.targetDate = new Date(targetDate);

    const goal = await prisma.savingsGoal.update({ where: { id: idResult.id }, data });
    return NextResponse.json(goal);
  } catch (error) {
    console.error('Failed to update goal:', error);
    return NextResponse.json({ error: 'Failed to update goal' }, { status: 500 });
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

    await prisma.savingsGoal.delete({ where: { id: idResult.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete goal:', error);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
