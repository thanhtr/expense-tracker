import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { CATEGORIES } from '@/lib/constants';
import { createCategorySchema, parseBody } from '@/lib/validation';

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
  const parsed = parseBody(createCategorySchema, await request.json());
  if ('error' in parsed) return parsed.error;
  const { name } = parsed.data;

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
