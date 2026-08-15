import { NextResponse } from 'next/server';
import { listInstitutions } from '@/lib/services/enable-banking';

export async function GET() {
  const institutions = await listInstitutions('FI');
  return NextResponse.json(institutions);
}
