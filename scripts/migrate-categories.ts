/**
 * One-time migration script: remap old Splitwise category names → new category list
 *
 * Run: npx tsx scripts/migrate-categories.ts [--dry-run]
 * Prerequisites: DATABASE_URL must be set in .env.local
 */

import { loadEnvConfig } from '@next/env';
import path from 'path';

loadEnvConfig(path.resolve(__dirname, '..'));

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const CATEGORIES = [
  'Groceries', 'Dining Out', 'Transportation', 'Travel & Flights', 'Pharmacy',
  'Sports', 'Shopping', 'Electronics', 'Home Supplies', 'Rent & Housing',
  'Utilities', 'Subscriptions', 'Entertainment', 'Gifts & Charity', 'Memberships',
  'Investments', 'Insurance', 'Car', 'Other',
] as const;

const MAPPING: Record<string, string> = {
  'Groceries':              'Groceries',
  'Food and drink':         'Groceries',
  'Food & Groceries':       'Groceries',
  'Dining out':             'Dining Out',
  'Dining Out':             'Dining Out',
  'Liquor':                 'Dining Out',
  'Bus/train':              'Transportation',
  'Gas/fuel':               'Transportation',
  'Parking':                'Transportation',
  'Taxi':                   'Transportation',
  'Transport':              'Transportation',
  'Transportation':         'Transportation',
  'Bicycle':                'Transportation',
  'Transportation - Other': 'Transportation',
  'Plane':                  'Travel & Flights',
  'Travel':                 'Travel & Flights',
  'Hotel':                  'Travel & Flights',
  'Medical expenses':       'Pharmacy',
  'Healthcare':             'Pharmacy',
  'Sports':                 'Sports',
  'Education':              'Sports',
  'Clothing':               'Shopping',
  'Shopping':               'Shopping',
  'Electronics':            'Electronics',
  'Furniture':              'Home Supplies',
  'Household supplies':     'Home Supplies',
  'Cleaning':               'Home Supplies',
  'Maintenance':            'Home Supplies',
  'Home':                   'Home Supplies',
  'Mortgage':               'Rent & Housing',
  'Rent':                   'Rent & Housing',
  'Housing':                'Rent & Housing',
  'Electricity':            'Utilities',
  'TV/Phone/Internet':      'Utilities',
  'Utilities':              'Utilities',
  'Utilities - Other':      'Utilities',
  'Water':                  'Utilities',
  'Heat/gas':               'Utilities',
  'Trash':                  'Utilities',
  'Movies':                 'Subscriptions',
  'Music':                  'Subscriptions',
  'Subscriptions':          'Subscriptions',
  'Entertainment':          'Entertainment',
  'Entertainment - Other':  'Entertainment',
  'Games':                  'Entertainment',
  'Gifts':                  'Gifts & Charity',
  'Charity':                'Gifts & Charity',
  'Services':               'Memberships',
  'Memberships':            'Memberships',
  'Investments':            'Investments',
  'Life - Other':           'Investments',
  'Insurance':              'Insurance',
  'Car':                    'Car',
  'General':                'Other',
  'Uncategorized':          'Other',
  'Life':                   'Other',
  'Pets':                   'Other',
  'Taxes':                  'Other',
  'Finance':                'Other',
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');

  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN — no changes will be written\n');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // --- Transactions ---
  console.log('=== Transactions ===');
  const groups = await prisma.transaction.groupBy({
    by: ['category'],
    _count: { id: true },
  });

  let txSkipped = 0, txUpdated = 0, txUnknown = 0;

  for (const { category: oldCat, _count } of groups) {
    const count = _count.id;

    if ((CATEGORIES as readonly string[]).includes(oldCat)) {
      console.log(`  SKIP     "${oldCat}" (${count}) — already valid`);
      txSkipped += count;
      continue;
    }

    const newCat = MAPPING[oldCat] ?? 'Other';
    if (!MAPPING[oldCat]) txUnknown += count;

    console.log(`  ${dryRun ? 'DRY' : 'UPDATE'} "${oldCat}" → "${newCat}" (${count})`);

    if (!dryRun) {
      await prisma.transaction.updateMany({
        where: { category: oldCat },
        data: { category: newCat },
      });
    }
    txUpdated += count;
  }

  // Handle empty-string category separately
  const emptyCount = await prisma.transaction.count({ where: { category: '' } });
  if (emptyCount > 0) {
    console.log(`  ${dryRun ? 'DRY' : 'UPDATE'} "" (empty) → "Other" (${emptyCount})`);
    if (!dryRun) {
      await prisma.transaction.updateMany({ where: { category: '' }, data: { category: 'Other' } });
    }
    txUpdated += emptyCount;
  }

  console.log(`\nTransactions: ${txSkipped} skipped, ${txUpdated} updated, ${txUnknown} unmapped→Other`);

  // --- LearnedRules ---
  console.log('\n=== Learned Rules ===');
  const rules = await prisma.learnedRule.findMany();
  let rulesSkipped = 0, rulesUpdated = 0;

  for (const rule of rules) {
    if ((CATEGORIES as readonly string[]).includes(rule.category)) {
      rulesSkipped++;
      continue;
    }
    const newCat = MAPPING[rule.category] ?? 'Other';
    console.log(`  ${dryRun ? 'DRY' : 'UPDATE'} rule "${rule.normalizedKey}": "${rule.category}" → "${newCat}"`);
    if (!dryRun) {
      await prisma.learnedRule.update({ where: { id: rule.id }, data: { category: newCat } });
    }
    rulesUpdated++;
  }

  console.log(`\nLearned rules: ${rulesSkipped} skipped, ${rulesUpdated} updated`);

  if (!dryRun) {
    const totalTx = await prisma.transaction.count();
    const byCategory = await prisma.transaction.groupBy({ by: ['category'], _count: { id: true }, orderBy: { _count: { id: 'desc' } } });
    console.log(`\n=== Final DB state: ${totalTx} transactions ===`);
    for (const { category, _count } of byCategory) {
      console.log(`  ${_count.id.toString().padStart(4)}  ${category}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
