import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { invalidateRulesCache } from '@/lib/services/learned-rules-service';
import { CATEGORIES } from '@/lib/constants';
import { updateKeywordSchema, parseBody, parseId } from '@/lib/validation';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: idStr } = await (params);
    const idResult = parseId(idStr);
    if ('error' in idResult) return idResult.error;

    const parsed = parseBody(updateKeywordSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { keyword, category } = parsed.data;

    if (!(CATEGORIES as readonly string[]).includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const normalizedKeyword = keyword.toLowerCase().trim();

    const existing = await prisma.learnedRule.findUnique({ where: { id: idResult.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    if (existing.normalizedKey !== normalizedKeyword) {
      const conflict = await prisma.learnedRule.findUnique({ where: { normalizedKey: normalizedKeyword } });
      if (conflict) {
        return NextResponse.json({ error: 'Rule already exists for this keyword' }, { status: 409 });
      }
    }

    const updated = await prisma.learnedRule.update({
      where: { id: idResult.id },
      data: { normalizedKey: normalizedKeyword, category, learnedFrom: keyword },
    });

    invalidateRulesCache();

    return NextResponse.json({
      id: updated.id,
      keyword: updated.normalizedKey,
      category: updated.category,
      count: updated.count,
    });
  } catch (error) {
    console.error('Failed to update rule:', error);
    return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
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

    const existing = await prisma.learnedRule.findUnique({ where: { id: idResult.id } });
    if (!existing) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await prisma.learnedRule.delete({ where: { id: idResult.id } });
    invalidateRulesCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete rule:', error);
    return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
  }
}
