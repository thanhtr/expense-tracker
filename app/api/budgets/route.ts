import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';
import { createBudgetSchema, parseBody } from '@/lib/validation';

function prevMonthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start, end };
}

export async function GET() {
  try {
    const budgets = await prisma.budget.findMany({ orderBy: { category: 'asc' } });

    const rolloverBudgets = budgets.filter(b => b.rollover);
    const prevSpentMap: Record<string, number> = {};

    if (rolloverBudgets.length > 0) {
      const { start, end } = prevMonthRange();
      const groups = await prisma.transaction.groupBy({
        by: ['category'],
        where: {
          type: 'Expense',
          date: { gte: start, lte: end },
          category: { in: rolloverBudgets.map(b => b.category) },
        },
        _sum: { amount: true },
      });
      for (const g of groups) {
        prevSpentMap[g.category] = Math.abs(g._sum.amount ?? 0);
      }
    }

    const result = budgets.map(b => {
      let rolloverAmount = 0;
      if (b.rollover) {
        const prevSpent = prevSpentMap[b.category] ?? 0;
        const underspend = b.monthlyLimit - prevSpent;
        if (underspend > 0) rolloverAmount = underspend;
      }
      return {
        id: b.id,
        category: b.category,
        monthlyLimit: b.monthlyLimit,
        rollover: b.rollover,
        rolloverAmount,
        effectiveLimit: b.monthlyLimit + rolloverAmount,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to fetch budgets:', error);
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const parsed = parseBody(createBudgetSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { category, monthlyLimit, rollover } = parsed.data;

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const budget = await prisma.budget.upsert({
      where: { category },
      update: { monthlyLimit, ...(rollover !== undefined ? { rollover } : {}) },
      create: { category, monthlyLimit, rollover: rollover ?? false },
    });

    return NextResponse.json({ ...budget, rolloverAmount: 0, effectiveLimit: budget.monthlyLimit });
  } catch (error) {
    console.error('Failed to save budget:', error);
    return NextResponse.json({ error: 'Failed to save budget' }, { status: 500 });
  }
}
