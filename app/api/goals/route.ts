import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createGoalSchema, parseBody } from '@/lib/validation';

export async function GET() {
  try {
    const goals = await prisma.savingsGoal.findMany({ orderBy: { targetDate: 'asc' } });

    const goalsWithProgress = await Promise.all(goals.map(async (goal) => {
      if (!goal.linkedCategory) return goal;
      try {
        const agg = await prisma.transaction.aggregate({
          where: {
            type: 'Income',
            category: goal.linkedCategory,
            date: { gte: goal.createdAt },
          },
          _sum: { amount: true },
        });
        const computed = agg._sum.amount ?? 0;
        return { ...goal, currentAmount: computed };
      } catch {
        return goal;
      }
    }));

    return NextResponse.json(goalsWithProgress);
  } catch (error) {
    console.error('Failed to fetch goals:', error);
    return NextResponse.json({ error: 'Failed to fetch goals' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = parseBody(createGoalSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, targetAmount, currentAmount, targetDate, linkedCategory } = parsed.data;

    const goal = await prisma.savingsGoal.create({
      data: { name, targetAmount, currentAmount, targetDate: new Date(targetDate), ...(linkedCategory ? { linkedCategory } : {}) },
    });
    return NextResponse.json(goal, { status: 201 });
  } catch (error) {
    console.error('Failed to create goal:', error);
    return NextResponse.json({ error: 'Failed to create goal' }, { status: 500 });
  }
}
