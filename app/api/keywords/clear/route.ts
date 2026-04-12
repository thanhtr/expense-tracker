import { NextResponse } from 'next/server';
import { deleteExpense } from '@/lib/splitwise';
import { getAllExpenses } from '@/lib/splitwise';
import { invalidateRulesCache } from '@/lib/services/learned-rules-service';

export async function POST() {
  try {
    // Find and delete ALL sentinel expenses
    const expenses = await getAllExpenses({});
    const sentinels = expenses.filter((e) => e.description === '__learned_rules__');

    if (sentinels.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No learned rules found to clear',
      });
    }

    // Delete ALL sentinels
    for (const sentinel of sentinels) {
      try {
        await deleteExpense(sentinel.id);
      } catch (deleteError) {
        throw deleteError;
      }
    }

    invalidateRulesCache();

    // Wait a brief moment for Splitwise API to process deletions
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify ALL deletions by fetching again (skip soft-deleted)
    const expensesAfter = await getAllExpenses({});
    const sentinelsStillExist = expensesAfter.filter((e) => e.description === '__learned_rules__' && !e.deleted_at);

    if (sentinelsStillExist.length > 0) {
      return NextResponse.json(
        { error: 'Failed to delete all sentinels, ' + sentinelsStillExist.length + ' still exist' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cleared ' + sentinels.length + ' learned rules sentinels',
    });
  } catch (error) {
    console.error('Failed to clear learned rules:', error);
    return NextResponse.json(
      { error: 'Failed to clear learned rules', details: String(error) },
      { status: 500 }
    );
  }
}
