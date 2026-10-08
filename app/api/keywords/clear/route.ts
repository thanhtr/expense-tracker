import { NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/cache-tags';
import { prisma } from '@/lib/db';

export async function POST() {
  try {
    const result = await prisma.learnedRule.deleteMany({});
    revalidateTag('config');

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
