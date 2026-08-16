import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const { type, value } = await request.json();

    if ((type !== 'category' && type !== 'merchant') || !value) {
      return NextResponse.json({ error: 'type must be "category" or "merchant", value is required' }, { status: 400 });
    }

    const exclusion = await prisma.recurringExclusion.upsert({
      where: { type_value: { type, value } },
      update: {},
      create: { type, value },
    });

    return NextResponse.json(exclusion);
  } catch (error) {
    console.error('Failed to create exclusion:', error);
    return NextResponse.json({ error: 'Failed to create exclusion' }, { status: 500 });
  }
}
