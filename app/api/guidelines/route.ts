import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { updateGuidelinesSchema, parseBody } from '@/lib/validation';

export interface BucketConfig {
  bucket: 'needs' | 'wants' | 'savings';
  targetPct: number;
  categories: string[];
}

export interface GuidelinesResponse {
  buckets: BucketConfig[];
}

const DEFAULTS: BucketConfig[] = [
  {
    bucket: 'needs',
    targetPct: 50,
    categories: ['Groceries', 'Rent & Housing', 'Utilities', 'Transportation', 'Pharmacy', 'Insurance', 'Car'],
  },
  {
    bucket: 'wants',
    targetPct: 30,
    categories: ['Dining Out', 'Shopping', 'Electronics', 'Entertainment', 'Subscriptions', 'Sports', 'Memberships', 'Travel & Flights', 'Gifts & Charity', 'Home Supplies'],
  },
  {
    bucket: 'savings',
    targetPct: 20,
    categories: ['Investments', 'Other'],
  },
];

export async function GET(): Promise<NextResponse> {
  try {
    const rows = await prisma.guidelineBucket.findMany();
    if (rows.length === 0) {
      return NextResponse.json({ buckets: DEFAULTS } satisfies GuidelinesResponse);
    }
    const buckets: BucketConfig[] = rows.map(r => ({
      bucket: r.bucket as BucketConfig['bucket'],
      targetPct: r.targetPct,
      categories: JSON.parse(r.categories) as string[],
    }));
    const filled = (['needs', 'wants', 'savings'] as const).map(b =>
      buckets.find(x => x.bucket === b) ?? DEFAULTS.find(x => x.bucket === b)!
    );
    return NextResponse.json({ buckets: filled } satisfies GuidelinesResponse);
  } catch (error) {
    console.error('Guidelines GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch guidelines' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const parsed = parseBody(updateGuidelinesSchema, await request.json());
    if ('error' in parsed) return parsed.error;
    const { buckets } = parsed.data;

    const totalPct = buckets.reduce((s, b) => s + b.targetPct, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      return NextResponse.json({ error: 'Percentages must sum to 100' }, { status: 400 });
    }

    await Promise.all(buckets.map(b =>
      prisma.guidelineBucket.upsert({
        where: { bucket: b.bucket },
        create: { bucket: b.bucket, targetPct: b.targetPct, categories: JSON.stringify(b.categories) },
        update: { targetPct: b.targetPct, categories: JSON.stringify(b.categories) },
      })
    ));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Guidelines PUT error:', error);
    return NextResponse.json({ error: 'Failed to save guidelines' }, { status: 500 });
  }
}
