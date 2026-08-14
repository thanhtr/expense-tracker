import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { updateCategorySchema, parseBody, parseId } from '@/lib/validation';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const idResult = parseId(idStr);
  if ('error' in idResult) return idResult.error;

  try {
    await prisma.category.delete({ where: { id: idResult.id } });
    revalidateTag('categories', 'max');
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idStr } = await params;
  const idResult = parseId(idStr);
  if ('error' in idResult) return idResult.error;

  const parsed = parseBody(updateCategorySchema, await request.json());
  if ('error' in parsed) return parsed.error;

  try {
    const cat = await prisma.category.update({ where: { id: idResult.id }, data: { name: parsed.data.name } });
    revalidateTag('categories', 'max');
    return NextResponse.json(cat);
  } catch {
    return NextResponse.json({ error: 'Not found or duplicate name' }, { status: 404 });
  }
}
