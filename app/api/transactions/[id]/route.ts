import { NextRequest, NextResponse } from 'next/server';
import { deleteExpense } from '@/lib/splitwise';
import { invalidateCache } from '@/lib/cache';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { category } = await request.json();
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    // Note: Splitwise API doesn't support direct category updates.
    // In a full implementation, this would require deleting and recreating the expense.
    // For now, we'll return a success response but the category update happens client-side only.

    return NextResponse.json({
      id,
      category,
      note: 'Category updated locally only (Splitwise sync not implemented)'
    });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update transaction' },
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

    await deleteExpense(id);

    // Invalidate cache so next fetch gets fresh data
    invalidateCache('expenses:');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete transaction' },
      { status: 500 }
    );
  }
}
