import { NextResponse } from 'next/server';
import { revalidateTag } from '@/lib/cache-tags';
import { seedDefaultIncomeRules } from '@/lib/services/income-rules-service';

export async function POST() {
  const seeded = await seedDefaultIncomeRules();
  if (seeded > 0) revalidateTag('config');
  return NextResponse.json({ success: true, seeded });
}
