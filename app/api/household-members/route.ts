import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const members = await prisma.householdMember.findMany({ orderBy: { createdAt: 'asc' } });
  return NextResponse.json(members);
}

export async function POST(req: Request) {
  const { name } = await req.json() as { name?: string };
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

  const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
  try {
    const member = await prisma.householdMember.create({ data: { name: name.trim(), slug } });
    return NextResponse.json(member, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'A member with that name already exists' }, { status: 409 });
  }
}
