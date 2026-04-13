import { ParsedTransaction } from '@/lib/types';
import { getLearnedRulesStore } from '@/lib/services/learned-rules-service';
import { normalizeMerchant } from '@/lib/merchant-normalizer';

/**
 * Categorize transactions using learned rules from Splitwise sentinel
 * Learned rules are the only source for categorization
 */
export async function categorizeWithLearning(rows: ParsedTransaction[]): Promise<ParsedTransaction[]> {
  const store = await getLearnedRulesStore();

  return rows.map(row => {
    // Check learned rules (exact normalized merchant match)
    const normalized = normalizeMerchant(row.merchant);
    if (normalized && store.rules[normalized]) {
      return {
        ...row,
        category: store.rules[normalized].category
      };
    }

    // No match: leave uncategorized (user will categorize manually)
    return {
      ...row,
      category: ''
    };
  });
}
