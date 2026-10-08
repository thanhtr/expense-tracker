import { unstable_cache } from 'next/cache';
import { prisma } from '@/lib/db';
import { normalizeMerchant } from '@/lib/merchant-normalizer';

export interface LearnedRule {
  category: string;
  learnedFrom: string;
  learnedAt: string;
  count: number;
}

export interface LearnedRulesStore {
  rules: Record<string, LearnedRule>;
  version: number;
  updatedAt: string;
}

function rollingStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

async function loadLearnedRulesUncached(): Promise<LearnedRulesStore> {
  const rows = await prisma.learnedRule.findMany();
  const rules: Record<string, LearnedRule> = {};
  for (const row of rows) {
    rules[row.normalizedKey] = {
      category: row.category,
      learnedFrom: row.learnedFrom,
      learnedAt: row.learnedAt.toISOString(),
      count: row.count,
    };
  }

  return {
    rules,
    version: 0,
    updatedAt: new Date().toISOString(),
  };
}

// Cached via Next's shared Data Cache, tagged 'config' — not a per-process Map: Vercel Fluid
// Compute can run multiple concurrent instances, so a per-process cache cleared on a write to
// instance A would still be served stale on instance B. Every LearnedRule-mutating route already
// calls revalidateTag('config') (see app/api/keywords/*, app/api/transactions/[id]/route.ts),
// which invalidates this cache instance-wide.
const loadLearnedRulesCached = unstable_cache(
  loadLearnedRulesUncached,
  ['learned-rules-store'],
  { tags: ['config'], revalidate: false },
);

async function loadLearnedRules(): Promise<LearnedRulesStore> {
  return loadLearnedRulesCached();
}

export async function saveLearnedRules(store: LearnedRulesStore): Promise<void> {
  store.updatedAt = new Date().toISOString();

  for (const [normalizedKey, rule] of Object.entries(store.rules)) {
    await prisma.learnedRule.upsert({
      where: { normalizedKey },
      update: {
        category: rule.category,
        learnedFrom: rule.learnedFrom,
        count: rule.count,
      },
      create: {
        normalizedKey,
        category: rule.category,
        learnedFrom: rule.learnedFrom,
        learnedAt: new Date(rule.learnedAt),
        count: rule.count,
      },
    });
  }
}

export async function recordCorrection(rawMerchant: string, category: string): Promise<void> {
  if (!rawMerchant || !category) return;

  const normalized = normalizeMerchant(rawMerchant);
  if (!normalized) return;

  const existing = await prisma.learnedRule.findUnique({ where: { normalizedKey: normalized } });

  await prisma.learnedRule.upsert({
    where: { normalizedKey: normalized },
    update: {
      category,
      learnedFrom: rawMerchant,
      count: (existing?.count ?? 0) + 1,
    },
    create: {
      normalizedKey: normalized,
      category,
      learnedFrom: rawMerchant,
      learnedAt: new Date(),
      count: 1,
    },
  });
}

export async function lookupLearnedCategory(rawMerchant: string): Promise<string | null> {
  if (!rawMerchant) return null;

  const normalized = normalizeMerchant(rawMerchant);
  if (!normalized) return null;

  const store = await loadLearnedRules();
  return store.rules[normalized]?.category ?? null;
}

export async function getLearnedRulesStore(): Promise<LearnedRulesStore> {
  return loadLearnedRules();
}

export async function bootstrapRulesFromHistory(): Promise<{ learned: number; skipped: number }> {
  const datedAfter = new Date(rollingStartDate());

  const transactions = await prisma.transaction.findMany({
    where: {
      type: 'Expense',
      date: { gte: datedAfter },
      category: { not: '' },
    },
    select: { merchant: true, category: true },
  });

  const store = await loadLearnedRules();
  if (!store.rules) store.rules = {};

  const merchantMap = new Map<string, Map<string, number>>();
  for (const tx of transactions) {
    if (!tx.category || tx.category === 'General') continue;
    const normalized = normalizeMerchant(tx.merchant);
    if (!normalized) continue;

    if (!merchantMap.has(normalized)) merchantMap.set(normalized, new Map());
    const cats = merchantMap.get(normalized)!;
    cats.set(tx.category, (cats.get(tx.category) ?? 0) + 1);
  }

  let learned = 0;
  let skipped = 0;

  for (const [normalized, catVotes] of merchantMap) {
    // Don't overwrite high-confidence existing rules
    if (store.rules[normalized] && store.rules[normalized].count > 1) {
      skipped++;
      continue;
    }

    let winnerCat = '';
    let winnerCount = 0;
    for (const [cat, count] of catVotes) {
      if (count > winnerCount) {
        winnerCat = cat;
        winnerCount = count;
      }
    }

    if (winnerCat && winnerCount > 0) {
      store.rules[normalized] = {
        category: winnerCat,
        learnedFrom: normalized,
        learnedAt: new Date().toISOString(),
        count: winnerCount,
      };
      learned++;
    } else {
      skipped++;
    }
  }

  if (learned > 0) {
    await saveLearnedRules(store);
  }

  return { learned, skipped };
}

export async function deleteLearnedRule(normalizedKey: string): Promise<void> {
  if (!normalizedKey) return;

  await prisma.learnedRule.deleteMany({ where: { normalizedKey } });
}
