import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createAssetSchema, parseBody } from '@/lib/validation';

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
    const parsed = parseBody(createAssetSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { name, type, balance, recordedAt } = parsed.data;

    const asset = await prisma.asset.create({
      data: { name, type, balance, recordedAt: new Date(recordedAt) },
    });
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error('Failed to create asset:', error);
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
  }
}
