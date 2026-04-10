import { NextResponse } from 'next/server';
import { CATEGORY_MAP } from '@/lib/constants';

export async function GET() {
  const categories = Object.keys(CATEGORY_MAP).sort();
  return NextResponse.json({ categories });
}
