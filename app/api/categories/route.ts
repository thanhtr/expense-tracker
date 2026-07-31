import { NextResponse } from 'next/server';
import { CATEGORIES } from '@/lib/constants';

export async function GET() {
  return NextResponse.json({ categories: [...CATEGORIES].sort() });
}
