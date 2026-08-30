import { prisma } from '@/lib/db';
import type { IncomeRule } from '@prisma/client';

export type { IncomeRule };

export async function getIncomeRules(): Promise<IncomeRule[]> {
  return prisma.incomeRule.findMany({ orderBy: { id: 'asc' } });
}

export function matchesAnyIncomeRule(
  tx: { merchant: string; category?: string | null },
  rules: IncomeRule[],
): boolean {
  return rules.some(rule => {
    const mMatch = !rule.merchantPattern || tx.merchant.toUpperCase().includes(rule.merchantPattern.toUpperCase());
    const cMatch = !rule.category || (tx.category ?? '') === rule.category;
    return mMatch && cMatch;
  });
}

export const DEFAULT_INCOME_RULES: Array<{ label: string; merchantPattern?: string; category?: string }> = [
  { label: 'Salary (FI)', merchantPattern: 'PALKKA' },
  { label: 'Salary (EN)', merchantPattern: 'SALARY' },
  { label: 'Wages', merchantPattern: 'WAGES' },
  { label: 'Employer', merchantPattern: 'TYÖNANTAJA' },
  { label: 'TE-toimisto', merchantPattern: 'TE-TOIMISTO' },
  { label: 'Kela', merchantPattern: 'KELA' },
  { label: 'Dividends (FI)', merchantPattern: 'OSINKO' },
  { label: 'Dividends (EN)', merchantPattern: 'DIVIDEND' },
  { label: 'Interest (FI)', merchantPattern: 'KORKO' },
  { label: 'Interest (EN)', merchantPattern: 'INTEREST' },
];

export async function seedDefaultIncomeRules(): Promise<number> {
  const existing = await prisma.incomeRule.count();
  if (existing > 0) return 0;
  const result = await prisma.incomeRule.createMany({ data: DEFAULT_INCOME_RULES });
  return result.count;
}
