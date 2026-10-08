import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { createCardEarnRuleSchema, parseBody } from '@/lib/validation';

export async function GET() {
  const rules = await prisma.cardEarnRule.findMany({ orderBy: { id: 'asc' } });
  return NextResponse.json(rules);
}

export async function POST(request: NextRequest) {
  const parsed = parseBody(createCardEarnRuleSchema, await request.json());
  if ('error' in parsed) return parsed.error;
  const { account, merchantPattern, classification, note } = parsed.data;
  const rule = await prisma.cardEarnRule.create({ data: { account, merchantPattern, classification, note } });
  revalidateTag('config', 'max');
  return NextResponse.json(rule, { status: 201 });
}
