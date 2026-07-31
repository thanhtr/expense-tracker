/**
 * One-time migration script: Splitwise → PostgreSQL
 *
 * Fetches all Splitwise expenses, migrates them to the local DB,
 * and migrates learned rules from the sentinel expense.
 *
 * Run: npx tsx scripts/migrate-from-splitwise.ts
 * Prerequisites: DATABASE_URL and SPLITWISE_API_KEY must be set in .env.local
 */

import { loadEnvConfig } from '@next/env';
import path from 'path';

// Load .env.local before anything else
loadEnvConfig(path.resolve(__dirname, '..'));

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as pako from 'pako';

const SPLITWISE_BASE = 'https://secure.splitwise.com/api/v3.0';
const USER_ID = parseInt(process.env.SPLITWISE_USER_ID || '2206773');
const WIFE_ID = parseInt(process.env.SPLITWISE_WIFE_ID || '14152499');

interface SplitwiseExpense {
  id: number;
  date: string;
  description: string;
  cost: string;
  payment?: boolean;
  deleted_at?: string | null;
  users: Array<{ user_id: number; paid_share: string | number }>;
  category?: { id: number; name: string };
  details?: string | null;
}

async function swFetch<T>(path: string): Promise<T> {
  const apiKey = process.env.SPLITWISE_API_KEY;
  if (!apiKey) throw new Error('SPLITWISE_API_KEY not set');

  const response = await fetch(`${SPLITWISE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = (await response.json()) as Record<string, unknown>;
  if (!response.ok || data.error) {
    throw new Error(`Splitwise API error: ${data.error ?? response.statusText}`);
  }
  return data as T;
}

async function getAllExpenses(): Promise<SplitwiseExpense[]> {
  const all: SplitwiseExpense[] = [];
  let offset = 0;

  while (true) {
    const res = await swFetch<{ expenses: SplitwiseExpense[] }>(
      `/get_expenses?limit=200&offset=${offset}`
    );
    const batch = res.expenses ?? [];
    all.push(...batch);
    if (batch.length < 200) break;
    offset += 200;
  }
  return all;
}

function parseDetails(str?: string | null): { account?: string; category?: string } {
  if (!str) return {};
  try { return JSON.parse(str); } catch { return {}; }
}

function makeDedupKey(date: string, merchant: string, cost: string, suffix = 0): string {
  return suffix === 0 ? `${date}|${merchant}|${cost}` : `${date}|${merchant}|${cost}|${suffix}`;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log('Fetching all Splitwise expenses...');
  const expenses = await getAllExpenses();
  console.log(`Fetched ${expenses.length} total expenses (including sentinel and deleted)`);

  // Extract sentinel for learned rules
  const sentinel = expenses
    .filter(e => e.description === '__learned_rules__' && !e.deleted_at)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  // Migrate transactions
  const toMigrate = expenses.filter(
    e => !e.deleted_at && !e.payment && e.description !== '__learned_rules__' && parseFloat(e.cost) !== 0
  );

  console.log(`Migrating ${toMigrate.length} transactions...`);

  const seenCount = new Map<string, number>();
  let created = 0;
  const skipped = 0;
  let errors = 0;

  for (const exp of toMigrate) {
    const details = parseDetails(exp.details);
    const category = details.category || exp.category?.name || '';
    const paidByUser = exp.users.find(u => parseFloat(String(u.paid_share)) > 0);
    const paidBy =
      paidByUser?.user_id === USER_ID ? 'tung'
      : paidByUser?.user_id === WIFE_ID ? 'thuy'
      : 'other';

    const dateStr = exp.date.slice(0, 10);
    const cost = parseFloat(exp.cost).toFixed(2);
    const baseKey = makeDedupKey(dateStr, exp.description, cost);
    const seen = seenCount.get(baseKey) ?? 0;
    seenCount.set(baseKey, seen + 1);
    const dedupKey = makeDedupKey(dateStr, exp.description, cost, seen);

    // Determine amount sign: positive cost in Splitwise = expense (stored negative)
    const isExpense = parseFloat(exp.cost) > 0;
    const amount = isExpense ? -parseFloat(exp.cost) : parseFloat(exp.cost);
    const type = isExpense ? 'Expense' : 'Income';

    try {
      await prisma.transaction.upsert({
        where: { dedupKey },
        update: {},
        create: {
          date: new Date(exp.date),
          account: details.account || 'Splitwise',
          merchant: exp.description,
          amount,
          note: '',
          type,
          category,
          paidBy,
          dedupKey,
        },
      });
      created++;
    } catch (err) {
      errors++;
      console.error(`  ERROR: ${exp.description} ${dateStr} €${cost} — ${err}`);
    }
  }

  console.log(`Transactions: ${created} migrated, ${skipped} skipped, ${errors} errors`);

  // Migrate learned rules from sentinel
  let rulesLearned = 0;
  if (sentinel?.details) {
    try {
      const parsed = parseDetails(sentinel.details) as Record<string, unknown>;
      let storeData: Record<string, unknown> | undefined;

      if (parsed.__compressed && parsed.data) {
        const compressed = Buffer.from(String(parsed.data), 'base64');
        const decompressed = pako.ungzip(compressed, { to: 'string' });
        storeData = JSON.parse(decompressed) as Record<string, unknown>;
      } else {
        storeData = parsed;
      }

      const rules = (storeData?.rules ?? {}) as Record<string, {
        category: string;
        learnedFrom: string;
        learnedAt: string;
        count: number;
      }>;

      console.log(`Migrating ${Object.keys(rules).length} learned rules...`);

      for (const [normalizedKey, rule] of Object.entries(rules)) {
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
        rulesLearned++;
      }
    } catch (err) {
      console.error('Failed to migrate learned rules:', err);
    }
  } else {
    console.log('No sentinel found — skipping learned rules migration');
  }

  console.log(`Learned rules: ${rulesLearned} migrated`);

  const totalTx = await prisma.transaction.count();
  const totalRules = await prisma.learnedRule.count();
  console.log(`\nDB state: ${totalTx} transactions, ${totalRules} learned rules`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
