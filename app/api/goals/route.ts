import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const goals = await prisma.savingsGoal.findMany({ orderBy: { targetDate: 'asc' } });
    return NextResponse.json(goals);
  } catch (error) {
    console.error('Failed to fetch goals:', error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; targetAmount?: number; currentAmount?: number; targetDate?: string };
    const { name, targetAmount, currentAmount, targetDate } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!targetAmount || targetAmount <= 0) return NextResponse.json({ error: 'targetAmount must be positive' }, { status: 400 });
    if (!targetDate) return NextResponse.json({ error: 'targetDate is required' }, { status: 400 });

    const goal = await prisma.savingsGoal.create({
      data: {
        name: name.trim(),
        targetAmount,
        currentAmount: currentAmount ?? 0,
        targetDate: new Date(targetDate),
      },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error('Failed to create goal:', error);
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}
