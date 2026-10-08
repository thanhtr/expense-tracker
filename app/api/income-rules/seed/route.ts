import { NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { seedDefaultIncomeRules } from '@/lib/services/income-rules-service';

export async function POST() {
  const seeded = await seedDefaultIncomeRules();
  if (seeded > 0) revalidateTag('config', { expire: 0 });
  return NextResponse.json({ success: true, seeded });
}
