import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { invalidateRulesCache } from '@/lib/services/learned-rules-service';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);
    const { keyword, category } = await request.json();

    if (keyword === undefined || category === undefined) {
      return NextResponse.json({ error: 'Keyword and category are required' }, { status: 400 });
    }

    const normalizedKeyword = keyword.toLowerCase().trim();

    const existing = await prisma.learnedRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    // If the normalized key changed, check for conflicts
    if (existing.normalizedKey !== normalizedKeyword) {
      const conflict = await prisma.learnedRule.findUnique({ where: { normalizedKey: normalizedKeyword } });
      if (conflict) {
        return NextResponse.json({ error: 'Rule already exists for this keyword' }, { status: 409 });
      }
    }

    const updated = await prisma.learnedRule.update({
      where: { id },
      data: {
        normalizedKey: normalizedKeyword,
        category,
        learnedFrom: keyword,
      },
    });

    invalidateRulesCache();

    return NextResponse.json({
      id: updated.id,
      keyword: updated.normalizedKey,
      category: updated.category,
      priority: updated.id,
    });
  } catch (error) {
    console.error('Failed to update rule:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    const existing = await prisma.learnedRule.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await prisma.learnedRule.delete({ where: { id } });
    invalidateRulesCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete rule:', error);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
