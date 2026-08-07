import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const VALID_TYPES = ['bank', 'investment', 'property', 'crypto', 'liability'] as const;

export async function GET() {
  try {
    const assets = await prisma.asset.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    return NextResponse.json(assets);
  } catch (error) {
    console.error('Failed to fetch assets:', error);
    return NextResponse.json({ error: 'Failed to fetch assets' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; type?: string; balance?: number; recordedAt?: string };
    const { name, type, balance, recordedAt } = body;

    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (!type || !(VALID_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }
    if (balance == null || typeof balance !== 'number') {
      return NextResponse.json({ error: 'balance is required' }, { status: 400 });
    }
    if (!recordedAt) return NextResponse.json({ error: 'recordedAt is required' }, { status: 400 });

    const asset = await prisma.asset.create({
      data: {
        name: name.trim(),
        type,
        balance,
        recordedAt: new Date(recordedAt),
      },
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error('Failed to create asset:', error);
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
  }
}
