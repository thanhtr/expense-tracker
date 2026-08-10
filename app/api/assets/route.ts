import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createAssetSchema, parseBody } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const history = new URL(request.url).searchParams.get('history') === '1';
  if (history) {
    try {
      const snapshots = await prisma.assetSnapshot.findMany({ orderBy: { recordedAt: 'asc' } });
      const monthMap: Record<string, { assets: number; liabilities: number }> = {};
      for (const s of snapshots) {
        const month = s.recordedAt instanceof Date
          ? s.recordedAt.toISOString().slice(0, 7)
          : String(s.recordedAt).slice(0, 7);
        if (!monthMap[month]) monthMap[month] = { assets: 0, liabilities: 0 };
        if (s.balance >= 0) {
          monthMap[month].assets += s.balance;
        } else {
          monthMap[month].liabilities += Math.abs(s.balance);
        }
      }
      const historyData = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { assets, liabilities }]) => ({ month, assets, liabilities, netWorth: assets - liabilities }));
      return NextResponse.json(historyData);
    } catch (error) {
      console.error('Failed to fetch asset history:', error);
      return NextResponse.json({ error: 'Failed to fetch asset history' }, { status: 500 });
    }
  }

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

    try {
      await prisma.assetSnapshot.create({
        data: { assetId: asset.id, name: asset.name, type: asset.type, balance: asset.balance, recordedAt: asset.recordedAt },
      });
    } catch {
      // assetSnapshot table may not exist yet — proceed without snapshot
    }

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error('Failed to create asset:', error);
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
  }
}
