/**
 * Learned Rules Service
 *
 * Manages learned merchant→category mappings stored in a Splitwise sentinel expense.
 * The sentinel is a special expense with description "__learned_rules__" that persists
 * learned rules across serverless cold starts.
 */

import {
  getAllExpenses,
  parseExpenseDetails,
  createExpense,
  deleteExpense,
} from '@/lib/splitwise';
import { normalizeMerchant } from '@/lib/merchant-normalizer';
import * as pako from 'pako';

export interface LearnedRule {
  category: string;
  learnedFrom: string; // original raw merchant name
  learnedAt: string; // ISO timestamp
  count: number; // how many corrections confirmed this rule
}

export interface LearnedRulesStore {
  rules: Record<string, LearnedRule>; // key = normalizeMerchant() output
  version: number;
  updatedAt: string;
}

// Module-level cache to avoid re-fetching sentinel on every request
let _rulesCache: LearnedRulesStore | null = null;
let _rulesCacheExpiry: number = 0;
const RULES_CACHE_TTL_SECONDS = 300; // 5 minutes, same as other caches

const SENTINEL_DESCRIPTION = '__learned_rules__';
const SENTINEL_COST = '0.01';
const SENTINEL_DATE = '2000-01-01';

/**
 * Load learned rules from Splitwise sentinel
 * Uses module-level cache to avoid fetching on every request
 */
async function loadLearnedRules(): Promise<LearnedRulesStore> {
  const now = Date.now();

  // Check cache
  if (_rulesCache && now < _rulesCacheExpiry) {
    console.log('[loadLearnedRules] Using cache, rules count:', Object.keys(_rulesCache.rules).length);
    return _rulesCache;
  }

  // Fetch all expenses (no date filter - sentinel is at year 2000)
  const expenses = await getAllExpenses({});

  // Find the sentinel expense(s) - skip soft-deleted ones
  const sentinels = expenses.filter(
    (e) => e.description === SENTINEL_DESCRIPTION && !e.deleted_at
  );

  const sentinel = sentinels[0]; // Use first if multiple exist

  let store: LearnedRulesStore;

  if (sentinel && sentinel.details) {
    try {
      const parsed = parseExpenseDetails(sentinel.details) as unknown;
      let storeData: LearnedRulesStore | undefined;

      // Check if data is compressed
      const parsedObj = parsed as Record<string, unknown>;
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        parsedObj.__compressed === true &&
        parsedObj.data
      ) {
        // Decompress the data
        const base64Data = String(parsedObj.data);
        const compressedBuffer = Buffer.from(base64Data, 'base64');
        const decompressed = pako.ungzip(compressedBuffer, { to: 'string' });
        storeData = JSON.parse(decompressed);
      } else {
        // Regular uncompressed data (backwards compatibility)
        storeData = (parsed as LearnedRulesStore);
      }

      const parsedStore = (storeData || {}) as Partial<LearnedRulesStore>;
      store = {
        rules: parsedStore.rules || {},
        version: parsedStore.version || 0,
        updatedAt: parsedStore.updatedAt || new Date().toISOString(),
      };
    } catch (error) {
      console.error(
        'Failed to parse learned rules from sentinel, starting fresh',
        error
      );
      store = {
        rules: {},
        version: 0,
        updatedAt: new Date().toISOString(),
      };
    }
  } else {
    store = {
      rules: {},
      version: 0,
      updatedAt: new Date().toISOString(),
    };
  }

  // Update cache
  _rulesCache = store;
  _rulesCacheExpiry = now + RULES_CACHE_TTL_SECONDS * 1000;

  return store;
}

/**
 * Save learned rules back to Splitwise sentinel
 * Deletes old sentinel and creates new one (since Splitwise has no update endpoint)
 */
export async function saveLearnedRules(store: LearnedRulesStore): Promise<void> {
  // Increment version
  store.version += 1;
  store.updatedAt = new Date().toISOString();

  // Find and delete ALL existing sentinels (there may be duplicates from failed saves)
  const expenses = await getAllExpenses({});
  const sentinels = expenses.filter((e) => e.description === SENTINEL_DESCRIPTION);

  if (sentinels.length > 0) {
    for (const sentinel of sentinels) {
      try {
        await deleteExpense(sentinel.id);
      } catch (error) {
        console.error('Failed to delete old sentinel:', sentinel.id, error);
        throw error;
      }
    }
  }

  // Create new sentinel with updated rules
  const storeJson = JSON.stringify(store);

  // Compress using gzip and encode as base64 to avoid encoding issues
  const compressed = pako.gzip(storeJson);
  const detailsBase64 = Buffer.from(compressed).toString('base64');

  // Wrap in a simple object so we can detect it's compressed on read
  const details = JSON.stringify({ __compressed: true, data: detailsBase64 });

  try {
    // Personal expense: use equal split (simplest format, avoids share validation issues)
    const payload = {
      cost: SENTINEL_COST,
      currency_code: 'EUR',
      date: `${SENTINEL_DATE}T00:00:00Z`,
      description: SENTINEL_DESCRIPTION,
      details,
      group_id: String(0), // Personal expense
      split_equally: true,
    } as Record<string, unknown>;

    await createExpense(payload);
  } catch (error) {
    console.error('Failed to create sentinel:', error);
    throw error;
  }

  // Invalidate cache
  _rulesCache = null;
  _rulesCacheExpiry = 0;
}

/**
 * Record a correction: when user manually sets category for a merchant
 */
export async function recordCorrection(
  rawMerchant: string,
  category: string
): Promise<void> {
  if (!rawMerchant || !category) {
    return; // Skip if either is empty
  }

  const normalized = normalizeMerchant(rawMerchant);

  if (!normalized) {
    return;
  }

  const store = await loadLearnedRules();

  const existing = store.rules[normalized];
  const now = new Date().toISOString();

  store.rules[normalized] = {
    category,
    learnedFrom: rawMerchant,
    learnedAt: now,
    count: (existing?.count || 0) + 1,
  };

  await saveLearnedRules(store);
}

/**
 * Look up learned category for a merchant
 * Returns null if not found
 */
export async function lookupLearnedCategory(
  rawMerchant: string
): Promise<string | null> {
  if (!rawMerchant) {
    return null;
  }

  const normalized = normalizeMerchant(rawMerchant);
  if (!normalized) {
    return null;
  }

  const store = await loadLearnedRules();
  const rule = store.rules[normalized];

  if (rule) {
    return rule.category;
  }

  return null;
}

/**
 * Clear the in-memory cache
 * Called after saving to force a re-fetch on next access
 */
export function invalidateRulesCache(): void {
  _rulesCache = null;
  _rulesCacheExpiry = 0;
}

/**
 * Export the store for direct access (used by API routes)
 */
export async function getLearnedRulesStore(): Promise<LearnedRulesStore> {
  return loadLearnedRules();
}

// History tracking starts from this date (first month of recorded Splitwise data)
const HISTORY_START_DATE = '2026-03-01';

/**
 * Bootstrap learned rules from historical Splitwise expenses.
 * Scans from HISTORY_START_DATE (2026-03-01) up to today,
 * groups by normalized merchant, and uses majority-vote category.
 * Merges with existing rules (existing corrections with count > 1 take precedence).
 */
export async function bootstrapRulesFromHistory(): Promise<{
  learned: number;
  skipped: number;
}> {
  const datedAfter = HISTORY_START_DATE;
  const datedBefore = new Date().toISOString().split('T')[0];

  const allExpenses = await getAllExpenses({ datedAfter, datedBefore });
  const store = await loadLearnedRules();

  // Group expenses by normalized merchant
  const merchantMap = new Map<
    string,
    Array<{ category: string; count: number }>
  >();

  for (const exp of allExpenses) {
    // Skip sentinel
    if (exp.description === SENTINEL_DESCRIPTION) {
      continue;
    }

    // Skip soft-deleted transactions (marked with deleted_at)
    if (exp.deleted_at) {
      continue;
    }

    // Use ONLY current Splitwise category (exp.category?.name)
    // Bootstrap is one-time initialization. Future keywords are manual inserts.
    // exp.category?.name reflects the current Splitwise state that user sees in the UI.
    // Details.category may be stale (from when transaction was created), not what user set later.
    const category = exp.category?.name;

    // Skip if no category
    if (!category) {
      continue;
    }

    const normalized = normalizeMerchant(exp.description);
    if (!normalized) {
      continue;
    }

    if (!merchantMap.has(normalized)) {
      merchantMap.set(normalized, []);
    }

    const categories = merchantMap.get(normalized)!;
    const existing = categories.find((c) => c.category === category);
    if (existing) {
      existing.count++;
    } else {
      categories.push({ category, count: 1 });
    }
  }

  // Merge into store: majority vote, but don't overwrite existing high-confidence rules
  let learned = 0;
  let skipped = 0;

  // Ensure rules is initialized
  if (!store.rules) {
    store.rules = {};
  }

  for (const [normalized, categoryList] of merchantMap.entries()) {
    // Skip if we already have a high-confidence rule (count > 1)
    if (store.rules[normalized] && store.rules[normalized].count > 1) {
      skipped++;
      continue;
    }

    // Find majority vote category
    const winner = categoryList.reduce((prev, curr) =>
      curr.count > prev.count ? curr : prev
    );

    // Only add if we have some historical evidence (count > 0)
    if (winner.count > 0) {
      store.rules[normalized] = {
        category: winner.category,
        learnedFrom: normalized, // Store normalized form as source
        learnedAt: new Date().toISOString(),
        count: winner.count,
      };
      learned++;
    } else {
      skipped++;
    }
  }

  // Save all at once
  if (learned > 0) {
    await saveLearnedRules(store);
  }

  return { learned, skipped };
}

/**
 * Delete a learned rule by its normalized merchant key
 */
export async function deleteLearnedRule(
  normalizedKey: string
): Promise<void> {
  if (!normalizedKey) {
    return;
  }

  const store = await loadLearnedRules();

  if (store.rules[normalizedKey]) {
    delete store.rules[normalizedKey];
    await saveLearnedRules(store);
  }
}
