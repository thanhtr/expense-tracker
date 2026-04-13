import { NextRequest, NextResponse } from 'next/server';
import { deleteExpense, getExpenseById } from '@/lib/splitwise';
import { invalidateCache } from '@/lib/cache';
import { recordCorrection } from '@/lib/services/learned-rules-service';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { category } = await request.json();
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    if (!category) {
      return NextResponse.json(
        { error: 'Category is required' },
        { status: 400 }
      );
    }

    // Fetch the expense to get merchant name
    const expense = await getExpenseById(id);
    const merchant = expense.description;

    // Record the correction in learned rules
    await recordCorrection(merchant, category);

    // Invalidate cache so next fetch gets fresh data
    invalidateCache('expenses:');

    return NextResponse.json({
      id,
      category,
      success: true,
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
