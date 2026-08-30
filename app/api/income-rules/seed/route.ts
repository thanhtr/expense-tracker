import { NextResponse } from 'next/server';
import { seedDefaultIncomeRules } from '@/lib/services/income-rules-service';

export async function POST() {
  const seeded = await seedDefaultIncomeRules();
  return NextResponse.json({ success: true, seeded });
}
