import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const imports = await prisma.csvImport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return NextResponse.json(imports);
}
