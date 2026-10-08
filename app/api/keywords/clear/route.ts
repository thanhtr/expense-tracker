import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { invalidateRulesCache } from '@/lib/services/learned-rules-service';

export async function POST() {
  try {
    const result = await prisma.learnedRule.deleteMany({});
    invalidateRulesCache();
    revalidateTag('config', 'max');

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.count} learned rules`,
    });
  } catch (error) {
    console.error('Failed to clear learned rules:', error);
    return NextResponse.json(
      { error: 'Failed to clear learned rules', details: String(error) },
      { status: 500 }
    );
  }
}
