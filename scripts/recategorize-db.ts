/**
 * Retroactively applies current learned rules to uncategorized transactions (category = '').
 * Only touches rows with no category; does not overwrite existing categories.
 *
 * Run locally:  DATABASE_URL=... npx tsx scripts/recategorize-db.ts [--dry-run]
 * In CI:        npx tsx scripts/recategorize-db.ts  (DATABASE_URL from environment)
 */

import { loadEnvConfig } from '@next/env';
import path from 'path';

loadEnvConfig(path.resolve(__dirname, '..'));

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Mirrors lib/merchant-normalizer.ts
function normalizeMerchant(merchant: string): string {
  if (!merchant) return '';

  let normalized = merchant.toLowerCase().trim();

  const suffixes = [
    /\s+o\.?y\.?$/i,
    /\s+a\.?b\.?$/i,
    /\s+ltd\.?$/i,
    /\s+inc\.?$/i,
    /\s+gmbh\.?$/i,
    /\s+sa\.?$/i,
    /\s+s\.?p\.?a\.?$/i,
    /\s+d\.?o\.?o\.?$/i,
    /\s+s\.?r\.?o\.?$/i,
    /\s+spółka\s+z\s+ograniczoną\s+odpowiedzialnością$/i,
  ];
  for (const suffix of suffixes) {
    normalized = normalized.replace(suffix, '');
  }

  const finnishCities = [
    'helsinki', 'espoo', 'vantaa', 'tampere', 'turku', 'oulu',
    'kerava', 'järvenpää', 'hyvinkää', 'kirkkonummi', 'nurmijärvi',
    'tuusula', 'klaukkala', 'lohja', 'porvoo', 'lahti', 'kuopio',
  ];
  for (const city of finnishCities) {
    const candidate = normalized.replace(new RegExp(`\\s+${city}$`, 'i'), '').trim();
    if (candidate.length > 3) normalized = candidate;
  }

  const candidateBranch = normalized.replace(/\s+\d{1,3}$/, '').trim();
  if (candidateBranch.length > 3) normalized = candidateBranch;

  return normalized.replace(/\s+/g, ' ').trim();
}

// Mirrors lib/categorizer.ts
function resolveCategory(merchant: string, rules: Record<string, string>): string {
  const normalized = normalizeMerchant(merchant);
  if (!normalized) return '';

  if (rules[normalized]) return rules[normalized];

  const MIN_KEY = 4;
  let best: string | null = null;
  let bestLen = 0;
  let ambiguous = false;

  for (const [key, category] of Object.entries(rules)) {
    if (key.length < MIN_KEY || !normalized.includes(key)) continue;
    if (key.length > bestLen) {
      best = category; bestLen = key.length; ambiguous = false;
    } else if (key.length === bestLen) {
      ambiguous = true;
    }
  }

  return !ambiguous && best ? best : '';
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL env var is required');

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN — no changes will be written\n');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // Load learned rules
  const learnedRows = await prisma.learnedRule.findMany();
  const rules: Record<string, string> = {};
  for (const row of learnedRows) {
    rules[row.normalizedKey] = row.category;
  }
  console.log(`Loaded ${learnedRows.length} learned rules`);

  // Fetch all uncategorized transactions
  const uncategorized = await prisma.transaction.findMany({
    where: { category: '' },
    select: { id: true, merchant: true },
  });
  console.log(`Found ${uncategorized.length} uncategorized transactions`);

  if (uncategorized.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  // Resolve category for each transaction, group by category for batch update
  const byCategory = new Map<string, number[]>();
  let stillUncategorized = 0;

  for (const tx of uncategorized) {
    const category = resolveCategory(tx.merchant, rules);
    if (!category) {
      stillUncategorized++;
      continue;
    }
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category)!.push(tx.id);
  }

  // Log breakdown
  let totalWillUpdate = 0;
  for (const [cat, ids] of byCategory) {
    console.log(`  ${ids.length.toString().padStart(4)}  ${cat}`);
    totalWillUpdate += ids.length;
  }
  console.log(`\n${totalWillUpdate} will be updated, ${stillUncategorized} have no matching rule`);

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  // Batch update per category
  for (const [category, ids] of byCategory) {
    await prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { category },
    });
    console.log(`Updated ${ids.length} → "${category}"`);
  }

  console.log(`\nDone. ${totalWillUpdate} transactions categorized, ${stillUncategorized} still uncategorized.`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
