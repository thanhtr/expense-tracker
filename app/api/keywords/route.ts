import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { invalidateRulesCache } from '@/lib/services/learned-rules-service';
import { CATEGORIES } from '@/lib/constants';

interface Keyword {
  id: number;
  keyword: string;
  category: string;
  count: number;
}

export async function GET() {
  try {
    const rows = await prisma.learnedRule.findMany({ orderBy: { id: 'asc' } });
    const keywords: Keyword[] = rows.map((row) => ({
      id: row.id,
      keyword: row.normalizedKey,
      category: row.category,
      count: row.count,
    }));
    return NextResponse.json(keywords);
  } catch (error) {
    console.error('Failed to read learned rules:', error);
    return NextResponse.json({ error: 'Failed to read learned rules' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { keyword, category } = await request.json();

    if (!keyword || !category) {
      return NextResponse.json({ error: 'Keyword and category are required' }, { status: 400 });
    }

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const normalizedKeyword = keyword.toLowerCase().trim();

    const existing = await prisma.learnedRule.findUnique({ where: { normalizedKey: normalizedKeyword } });
    if (existing) {
      return NextResponse.json({ error: 'Rule already exists for this keyword' }, { status: 409 });
    }

    const row = await prisma.learnedRule.create({
      data: {
        normalizedKey: normalizedKeyword,
        category,
        learnedFrom: keyword,
        count: 1,
      },
    });

    invalidateRulesCache();

    return NextResponse.json(
      { id: row.id, keyword: row.normalizedKey, category: row.category, count: row.count },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to add rule:', error);
    return NextResponse.json({ error: 'Failed to add rule' }, { status: 500 });
  }
}
