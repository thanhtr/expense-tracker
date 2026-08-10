import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createGoalSchema, parseBody } from '@/lib/validation';

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
    const parsed = parseBody(createGoalSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, targetAmount, currentAmount, targetDate } = parsed.data;

    const goal = await prisma.savingsGoal.create({
      data: { name, targetAmount, currentAmount, targetDate: new Date(targetDate) },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error('Failed to create goal:', error);
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}
