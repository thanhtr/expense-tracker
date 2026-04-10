import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { keyword, category, priority } = await request.json();
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    const updated = await prisma.merchantKeyword.update({
      where: { id },
      data: {
        keyword: keyword.toLowerCase().trim(),
        category: category.trim(),
        priority
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update keyword error:', error);
    return NextResponse.json(
      { error: 'Failed to update keyword' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    await prisma.merchantKeyword.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete keyword error:', error);
    return NextResponse.json(
      { error: 'Failed to delete keyword' },
      { status: 500 }
    );
  }
}
