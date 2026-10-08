import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/cache-tags';
import { prisma } from '@/lib/db';
import { createAssetSchema, parseBody } from '@/lib/validation';
import { LIQUID_ASSET_TYPES } from '@/lib/constants';
import type { AssetHistoryPoint } from '@/lib/types';

export async function GET(request: NextRequest) {
  const history = new URL(request.url).searchParams.get('history') === '1';
  if (history) {
    try {
      const [snapshots, liveAssets] = await Promise.all([
        prisma.assetSnapshot.findMany({ orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }] }),
        prisma.asset.findMany({ select: { id: true } }),
      ]);
      if (snapshots.length === 0) return NextResponse.json([]);

      const liveIds = new Set(liveAssets.map((a) => a.id));
      const toMonth = (d: Date) => d.toISOString().slice(0, 7);
      const nextMonth = (m: string) => {
        const y = Number(m.slice(0, 4));
        const mo = Number(m.slice(5, 7)); // 1-indexed current month => 0-indexed next month
        return toMonth(new Date(Date.UTC(y, mo, 1)));
      };

      const snapshotsByAsset = new Map<number, typeof snapshots>();
      for (const s of snapshots) {
        const arr = snapshotsByAsset.get(s.assetId) ?? [];
        arr.push(s);
        snapshotsByAsset.set(s.assetId, arr);
      }

      const minMonth = toMonth(snapshots[0]!.recordedAt);
      const currentMonth = toMonth(new Date());

      // Build the full month range so assets with no activity in a given
      // month still carry forward their last known balance into it.
      const months: string[] = [];
      for (let m = minMonth; m <= currentMonth; m = nextMonth(m)) {
        months.push(m);
      }

      const monthMap = new Map<string, { assets: number; liabilities: number; liquidAssets: number }>();
      for (const m of months) monthMap.set(m, { assets: 0, liabilities: 0, liquidAssets: 0 });

      for (const [assetId, assetSnaps] of snapshotsByAsset) {
        const isLive = liveIds.has(assetId);
        const lastSnapMonth = toMonth(assetSnaps[assetSnaps.length - 1]!.recordedAt);
        let snapIdx = 0;
        let balance: number | null = null;
        let type: string | null = null;
        for (const month of months) {
          while (snapIdx < assetSnaps.length && toMonth(assetSnaps[snapIdx]!.recordedAt) <= month) {
            balance = assetSnaps[snapIdx]!.balance;
            type = assetSnaps[snapIdx]!.type;
            snapIdx++;
          }
          if (balance === null) continue; // before this asset's first snapshot
          // A deleted asset's balance is only carried through the month of
          // its last snapshot, not forward-filled indefinitely.
          if (!isLive && month > lastSnapMonth) continue;
          const totals = monthMap.get(month)!;
          if (balance >= 0) {
            totals.assets += balance;
            if (type && LIQUID_ASSET_TYPES.has(type)) totals.liquidAssets += balance;
          } else {
            totals.liabilities += Math.abs(balance);
          }
        }
      }

      const historyData: AssetHistoryPoint[] = months.map((month) => {
        const totals = monthMap.get(month)!;
        return {
          month,
          assets: totals.assets,
          liabilities: totals.liabilities,
          netWorth: totals.assets - totals.liabilities,
          liquidAssets: totals.liquidAssets,
        };
      });
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

    revalidateTag('readings');
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error('Failed to create asset:', error);
    return NextResponse.json({ error: 'Failed to create asset' }, { status: 500 });
  }
}
