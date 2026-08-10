import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    const body = await request.json() as { name?: string; targetAmount?: number; currentAmount?: number; targetDate?: string };

    const data: { name?: string; targetAmount?: number; currentAmount?: number; targetDate?: Date } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.targetAmount !== undefined) data.targetAmount = body.targetAmount;
    if (body.currentAmount !== undefined) data.currentAmount = body.currentAmount;
    if (body.targetDate !== undefined) data.targetDate = new Date(body.targetDate);

    const goal = await prisma.savingsGoal.update({ where: { id }, data });
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
    const id = parseInt(idStr);
    await prisma.savingsGoal.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete goal:', error);
    return NextResponse.json({ error: 'Failed to delete goal' }, { status: 500 });
  }
}
