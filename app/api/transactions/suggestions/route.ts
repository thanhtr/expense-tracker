import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getLearnedRulesStore } from '@/lib/services/learned-rules-service';
import { normalizeMerchant } from '@/lib/merchant-normalizer';

export interface SuggestionGroup {
  merchant: string;
  suggestedCategory: string;
  transactions: {
    id: number;
    currentCategory: string;
    date: string;
    amount: number;
  }[];
}

export interface SuggestionsResponse {
  suggestions: SuggestionGroup[];
  totalCount: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    // Fetch all expense transactions (no pagination — we need all to find matches)
    const rows = await prisma.transaction.findMany({
      where: { type: 'Expense' },
      select: { id: true, merchant: true, category: true, date: true, amount: true },
      orderBy: { date: 'desc' },
    });

    const rulesStore = await getLearnedRulesStore();

    // Group candidates by (normalizedMerchant, suggestedCategory) where suggestion ≠ current
    const groups = new Map<string, SuggestionGroup>();

    for (const row of rows) {
      const normalized = normalizeMerchant(row.merchant);
      if (!normalized) continue;
      const suggested = rulesStore.rules[normalized]?.category ?? null;
      if (!suggested) continue;

      const currentCat = row.category ?? '';
      // Flag if: (a) no current category, or (b) current category differs from suggestion
      if (suggested === currentCat) continue;

      const key = `${normalized}|||${suggested}`;
      if (!groups.has(key)) {
        groups.set(key, {
          merchant: row.merchant,
          suggestedCategory: suggested,
          transactions: [],
        });
      }
      groups.get(key)!.transactions.push({
        id: row.id,
        currentCategory: currentCat,
        date: row.date.toISOString().split('T')[0],
        amount: Math.abs(row.amount),
      });
    }

    const suggestions = Array.from(groups.values())
      .sort((a, b) => b.transactions.length - a.transactions.length);

    return NextResponse.json({
      suggestions,
      totalCount: suggestions.reduce((s, g) => s + g.transactions.length, 0),
    } satisfies SuggestionsResponse);
  } catch (error) {
    console.error('Suggestions fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestions' }, { status: 500 });
  }
}
