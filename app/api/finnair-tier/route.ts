import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { updateFinnairTierSchema, parseBody } from '@/lib/validation';

export async function GET() {
  const row = await prisma.finnairPlusTier.findUnique({ where: { id: 1 } });
  return NextResponse.json({ tier: row?.tier ?? 'basic' });
}

export async function PATCH(request: NextRequest) {
  const parsed = parseBody(updateFinnairTierSchema, await request.json());
  if ('error' in parsed) return parsed.error;
  const { tier } = parsed.data;
  const row = await prisma.finnairPlusTier.upsert({
    where: { id: 1 },
    create: { id: 1, tier },
    update: { tier },
  });
  revalidateTag('config', 'max');
  return NextResponse.json({ tier: row.tier });
}
