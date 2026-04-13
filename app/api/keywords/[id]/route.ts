import { NextRequest, NextResponse } from 'next/server';
import {
  getLearnedRulesStore,
  saveLearnedRules,
} from '@/lib/services/learned-rules-service';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);
    const { keyword, category } = await request.json();

    if (keyword === undefined || category === undefined) {
      return NextResponse.json(
        { error: 'Keyword and category are required' },
        { status: 400 }
      );
    }

    const store = await getLearnedRulesStore();

    // Get all rules as array
    const rulesArray = Object.entries(store.rules).map(([key, rule]) => ({
      key,
      rule,
    }));

    // Find rule at index
    if (id < 0 || id >= rulesArray.length) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    const oldKey = rulesArray[id].key;
    const normalizedKeyword = keyword.toLowerCase().trim();

    // Delete old rule
    delete store.rules[oldKey];

    // Add updated rule with new keyword
    store.rules[normalizedKeyword] = {
      category,
      learnedFrom: keyword,
      learnedAt: new Date().toISOString(),
      count: store.rules[normalizedKeyword]?.count || 1,
    };

    await saveLearnedRules(store);

    return NextResponse.json({
      id,
      keyword: normalizedKeyword,
      category,
      priority: id,
    });
  } catch (error) {
    console.error('Failed to update rule:', error);
    return NextResponse.json(
      { error: 'Failed to update rule' },
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

    const store = await getLearnedRulesStore();

    // Get all rules as array
    const rulesArray = Object.entries(store.rules).map(([key, rule]) => ({
      key,
      rule,
    }));

    // Find rule at index
    if (id < 0 || id >= rulesArray.length) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    const keyToDelete = rulesArray[id].key;

    // Delete the rule
    delete store.rules[keyToDelete];

    await saveLearnedRules(store);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete rule:', error);
    return NextResponse.json(
      { error: 'Failed to delete rule' },
      { status: 500 }
    );
  }
}
