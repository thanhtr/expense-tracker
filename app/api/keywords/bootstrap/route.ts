import { NextResponse } from 'next/server';
import { bootstrapRulesFromHistory } from '@/lib/services/learned-rules-service';

export async function POST() {
  try {
    const result = await bootstrapRulesFromHistory();
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
