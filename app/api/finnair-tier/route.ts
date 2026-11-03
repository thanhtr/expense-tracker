import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/cache-tags';
import { prisma } from '@/lib/db';
import { updateFinnairTierSchema, parseBody } from '@/lib/validation';

function serialize(row: { tier: string; amexCancelDate: Date | null } | null) {
  return {
    tier: row?.tier ?? 'basic',
    amexCancelDate: row?.amexCancelDate ? row.amexCancelDate.toISOString().slice(0, 10) : null,
  };
}

export async function GET() {
  const row = await prisma.finnairPlusTier.findUnique({ where: { id: 1 } });
  return NextResponse.json(serialize(row));
}

export async function PATCH(request: NextRequest) {
  const parsed = parseBody(updateFinnairTierSchema, await request.json());
  if ('error' in parsed) return parsed.error;
  const { tier, amexCancelDate } = parsed.data;
  const row = await prisma.finnairPlusTier.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      tier: tier ?? 'basic',
      amexCancelDate: amexCancelDate ? new Date(amexCancelDate) : null,
    },
    update: {
      ...(tier !== undefined && { tier }),
      ...(amexCancelDate !== undefined && { amexCancelDate: amexCancelDate ? new Date(amexCancelDate) : null }),
    },
  });
  revalidateTag('config');
  return NextResponse.json(serialize(row));
}
