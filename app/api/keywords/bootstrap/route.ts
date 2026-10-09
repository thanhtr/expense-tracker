import { NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/cache-tags';
import { bootstrapRulesFromHistory } from '@/lib/services/learned-rules-service';

export async function POST() {
  try {
    const result = await bootstrapRulesFromHistory();
    if (result.learned > 0) revalidateTag('config');
    return NextResponse.json({
      success: true,
      learned: result.learned,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error('Failed to bootstrap rules:', error);
    return NextResponse.json(
      { error: 'Failed to bootstrap rules' },
      { status: 500 }
    );
  }
}
