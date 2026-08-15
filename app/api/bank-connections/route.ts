import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const connections = await prisma.bankConnection.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(connections);
}
