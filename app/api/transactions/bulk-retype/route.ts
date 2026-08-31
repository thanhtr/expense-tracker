import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { bulkRetypeSchema, parseBody } from '@/lib/validation';
import { invalidateDashboardCache } from '@/lib/services/aggregation-service';

export async function POST(request: NextRequest) {
  try {
    const parsed = parseBody(bulkRetypeSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { ids, type } = parsed.data;

    if (type === 'Income') {
      const negativeCount = await prisma.transaction.count({
        where: { id: { in: ids }, amount: { lt: 0 } },
      });
      if (negativeCount > 0) {
        return NextResponse.json(
          { error: `${negativeCount} selected transaction(s) have negative amounts and cannot be set to Income` },
          { status: 422 },
        );
      }
    }

    const result = await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { type },
    });
    invalidateDashboardCache();
    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('Bulk retype error:', error);
    return NextResponse.json({ error: 'Failed to bulk retype' }, { status: 500 });
  }
}
