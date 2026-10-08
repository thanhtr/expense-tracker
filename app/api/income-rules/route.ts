import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/cache-tags';
import { prisma } from '@/lib/db';
import { createIncomeRuleSchema, parseBody } from '@/lib/validation';

export async function GET() {
  const rules = await prisma.incomeRule.findMany({ orderBy: { id: 'asc' } });
  return NextResponse.json(rules);
}

export async function POST(request: NextRequest) {
  const parsed = parseBody(createIncomeRuleSchema, await request.json());
  if ('error' in parsed) return parsed.error;
  const { label, merchantPattern, category } = parsed.data;
  const rule = await prisma.incomeRule.create({ data: { label, merchantPattern, category } });
  revalidateTag('config');
  return NextResponse.json(rule, { status: 201 });
}
