import { NextRequest, NextResponse } from 'next/server';
import {
  getLearnedRulesStore,
  invalidateRulesCache,
} from '@/lib/services/learned-rules-service';

interface Keyword {
  id: number;
  keyword: string;
  category: string;
  priority: number;
}

async function readKeywords(): Promise<Keyword[]> {
  try {
    // Read learned rules from Splitwise sentinel
    const store = await getLearnedRulesStore();

    const keywords: Keyword[] = [];
    let priority = 0;

    // Convert learned rules to keyword format
    for (const [normalizedKey, rule] of Object.entries(store.rules || {})) {
      keywords.push({
        id: priority,
        keyword: normalizedKey,
        category: rule.category,
        priority,
      });
      priority++;
    }

    return keywords;
  } catch (error) {
    console.error('Failed to read learned rules:', error);
    return [];
  }
}

export async function GET() {
  try {
    // Always invalidate cache to get fresh rules
    invalidateRulesCache();
    const keywords = await readKeywords();
    return NextResponse.json(keywords);
  } catch (error) {
    console.error('Failed to read learned rules:', error);
    return NextResponse.json(
      { error: 'Failed to read learned rules' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { keyword, category } = await request.json();

    if (!keyword || !category) {
      return NextResponse.json(
        { error: 'Keyword and category are required' },
        { status: 400 }
      );
    }

    // Get existing rules
    const store = await getLearnedRulesStore();
    const normalizedKeyword = keyword.toLowerCase().trim();

    // Check for duplicate
    if (store.rules[normalizedKeyword]) {
      return NextResponse.json(
        { error: 'Rule already exists for this keyword' },
        { status: 409 }
      );
    }

    // Add new rule to store
    store.rules[normalizedKeyword] = {
      category,
      learnedFrom: keyword,
      learnedAt: new Date().toISOString(),
      count: 1,
    };

    // Save back to Splitwise
    const { saveLearnedRules } = await import('@/lib/services/learned-rules-service');
    await saveLearnedRules(store);

    const keywords = await readKeywords();
    const newKeyword = keywords.find((k) => k.keyword === normalizedKeyword);

    return NextResponse.json(newKeyword || { keyword: normalizedKeyword, category }, { status: 201 });
  } catch (error) {
    console.error('Failed to add rule:', error);
    return NextResponse.json(
      { error: 'Failed to add rule' },
      { status: 500 }
    );
  }
}
