/**
 * Reclassify OP Bank Income transactions that match no income rule as
 * Expense (positive-amount = reimbursement).
 *
 * Usage:
 *   npx tsx scripts/migrate-reimbursements.ts          # dry run
 *   npx tsx scripts/migrate-reimbursements.ts --apply  # apply changes
 */

import { PrismaClient } from '@prisma/client';
import {
  getIncomeRules,
  matchesAnyIncomeRule,
  seedDefaultIncomeRules,
  DEFAULT_INCOME_RULES,
} from '../lib/services/income-rules-service';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  // Seed default rules if the table is empty so the migration has something to match against
  const seeded = await seedDefaultIncomeRules();
  if (seeded > 0) {
    console.log(`Seeded ${seeded} default income rules:`);
    DEFAULT_INCOME_RULES.forEach(r => console.log(`  - ${r.label} (${r.merchantPattern ?? r.category})`));
  }

  const rules = await getIncomeRules();
  console.log(`\nUsing ${rules.length} income rule(s) to classify transactions.`);

  const incomeTransactions = await prisma.transaction.findMany({
    where: { type: 'Income' },
    select: { id: true, merchant: true, category: true, amount: true, date: true },
  });

  console.log(`\nFound ${incomeTransactions.length} Income transaction(s) to evaluate.`);

  const toReclassify = incomeTransactions.filter(tx => !matchesAnyIncomeRule(tx, rules));
  const toKeep = incomeTransactions.filter(tx => matchesAnyIncomeRule(tx, rules));

  console.log(`  → Keep as Income:       ${toKeep.length}`);
  console.log(`  → Reclassify to Expense (reimbursement): ${toReclassify.length}`);

  if (toReclassify.length === 0) {
    console.log('\nNothing to reclassify.');
    return;
  }

  if (!apply) {
    console.log('\nDry run — sample of transactions that would be reclassified:');
    toReclassify.slice(0, 20).forEach(tx => {
      const date = tx.date.toISOString().slice(0, 10);
      console.log(`  [${tx.id}] ${date}  ${tx.merchant}  €${tx.amount.toFixed(2)}`);
    });
    if (toReclassify.length > 20) {
      console.log(`  … and ${toReclassify.length - 20} more`);
    }
    console.log('\nRe-run with --apply to execute.');
    return;
  }

  const ids = toReclassify.map(tx => tx.id);
  const { count } = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { type: 'Expense' },
  });

  console.log(`\nDone. Reclassified ${count} transaction(s) to Expense (reimbursement).`);
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
