import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';

export async function GET() {
  try {
    const budgets = await prisma.budget.findMany({ orderBy: { category: 'asc' } });
    return NextResponse.json(budgets);
  } catch (error) {
    console.error('Failed to fetch budgets:', error);
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { category, monthlyLimit } = await request.json();

    if (!category || monthlyLimit == null) {
      return NextResponse.json({ error: 'category and monthlyLimit are required' }, { status: 400 });
    }

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const limit = parseFloat(String(monthlyLimit));
    if (isNaN(limit) || limit < 0) {
      return NextResponse.json({ error: 'monthlyLimit must be a non-negative number' }, { status: 400 });
    }

    const budget = await prisma.budget.upsert({
      where: { category },
      update: { monthlyLimit: limit },
      create: { category, monthlyLimit: limit },
    });

    return NextResponse.json(budget);
  } catch (error) {
    console.error('Failed to save budget:', error);
    return NextResponse.json({ error: 'Failed to save budget' }, { status: 500 });
  }
}
