import { ParsedTransaction } from '@/lib/types';
import { getLearnedRulesStore } from '@/lib/services/learned-rules-service';
import { normalizeMerchant } from '@/lib/merchant-normalizer';

export async function categorizeWithLearning(rows: ParsedTransaction[]): Promise<ParsedTransaction[]> {
  const store = await getLearnedRulesStore();

  return rows.map(row => {
    const normalized = normalizeMerchant(row.merchant);

    // Exact match
    if (normalized && store.rules[normalized]) {
      return { ...row, category: store.rules[normalized].category };
    }

    // Substring fallback: find rules whose key appears inside the merchant name.
    // Longest match wins; equal-length tie → leave uncategorized (safe over wrong).
    const MIN_KEY = 4;
    let best: { category: string } | null = null;
    let bestLen = 0;
    let ambiguous = false;

    for (const [key, rule] of Object.entries(store.rules)) {
      if (key.length < MIN_KEY || !normalized.includes(key)) continue;
      if (key.length > bestLen) {
        best = rule; bestLen = key.length; ambiguous = false;
      } else if (key.length === bestLen) {
        ambiguous = true;
      }
    }

    return { ...row, category: (!ambiguous && best) ? best.category : '' };
  });
}
