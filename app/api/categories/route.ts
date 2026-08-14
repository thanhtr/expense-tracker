import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { getCategoriesCached } from '@/lib/categories-cache';
import { createCategorySchema, parseBody } from '@/lib/validation';

export async function GET(request: NextRequest) {
  const full = new URL(request.url).searchParams.get('full') === '1';
  if (full) {
    // Full mode returns { id, name, sortOrder }[] — CategoryManager needs this.
    // Can't use the string-only cache here, but still seed if needed.
    await getCategoriesCached(); // ensures seeding has run
    const rows = await prisma.category.findMany({ orderBy: { sortOrder: 'asc' } });
    return NextResponse.json({ categories: rows });
  }
  const names = await getCategoriesCached();
  return NextResponse.json({ categories: names });
}

export async function POST(request: NextRequest) {
  const parsed = parseBody(createCategorySchema, await request.json());
  if ('error' in parsed) return parsed.error;
  const { name } = parsed.data;

  // Ensure seeded before reading max sort order
  await getCategoriesCached();
  const maxOrder = await prisma.category.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;

  try {
    const cat = await prisma.category.create({ data: { name, sortOrder } });
    revalidateTag('categories', 'max');
    return NextResponse.json(cat, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Category already exists' }, { status: 409 });
  }
}
