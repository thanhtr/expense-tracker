import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';

async function ensureSeeded() {
  const count = await prisma.category.count();
  if (count === 0) {
    await prisma.category.createMany({
      data: CATEGORIES.map((name, i) => ({ name, sortOrder: i })),
      skipDuplicates: true,
    });
  }
}

export async function GET(request: NextRequest) {
  await ensureSeeded();
  const full = new URL(request.url).searchParams.get('full') === '1';
  const rows = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
  if (full) return NextResponse.json({ categories: rows });
  return NextResponse.json({ categories: rows.map(r => r.name) });
}

export async function POST(request: NextRequest) {
  const body = await request.json() as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  await ensureSeeded();
  const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;

  try {
    const cat = await prisma.category.create({ data: { name, sortOrder } });
    return NextResponse.json(cat, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Category already exists' }, { status: 409 });
  }
}
