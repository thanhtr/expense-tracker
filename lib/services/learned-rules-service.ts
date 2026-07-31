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

let _rulesCache: LearnedRulesStore | null = null;
let _rulesCacheExpiry: number = 0;
const RULES_CACHE_TTL_SECONDS = 300;

function rollingStartDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

async function loadLearnedRules(): Promise<LearnedRulesStore> {
  const now = Date.now();
  if (_rulesCache && now < _rulesCacheExpiry) {
    return _rulesCache;
  }

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

  const store: LearnedRulesStore = {
    rules,
    version: 0,
    updatedAt: new Date().toISOString(),
  };

  _rulesCache = store;
  _rulesCacheExpiry = now + RULES_CACHE_TTL_SECONDS * 1000;
  return store;
}

export async function saveLearnedRules(store: LearnedRulesStore): Promise<void> {
  store.updatedAt = new Date().toISOString();

  // Upsert all rules in the store
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

  _rulesCache = null;
  _rulesCacheExpiry = 0;
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

  _rulesCache = null;
  _rulesCacheExpiry = 0;
}

export async function lookupLearnedCategory(rawMerchant: string): Promise<string | null> {
  if (!rawMerchant) return null;

  const normalized = normalizeMerchant(rawMerchant);
  if (!normalized) return null;

  const row = await prisma.learnedRule.findUnique({ where: { normalizedKey: normalized } });
  return row?.category ?? null;
}

export function invalidateRulesCache(): void {
  _rulesCache = null;
  _rulesCacheExpiry = 0;
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

  // Group by normalized merchant, count votes per category
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

    // Majority vote
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

  _rulesCache = null;
  _rulesCacheExpiry = 0;
}
