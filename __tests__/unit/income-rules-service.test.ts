import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({
  prisma: {
    incomeRule: {
      findMany: vi.fn(),
      count: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';
import { matchesAnyIncomeRule, seedDefaultIncomeRules, getIncomeRules, DEFAULT_INCOME_RULES, type IncomeRule } from '@/lib/services/income-rules-service';

function makeRule(overrides: Partial<IncomeRule> = {}): IncomeRule {
  return {
    id: 1,
    label: 'Test rule',
    merchantPattern: null,
    category: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('matchesAnyIncomeRule', () => {
  it('matches on merchant pattern, case-insensitively', () => {
    const rules = [makeRule({ merchantPattern: 'palkka' })];
    expect(matchesAnyIncomeRule({ merchant: 'TYÖNANTAJA PALKKA 04/2026' }, rules)).toBe(true);
    expect(matchesAnyIncomeRule({ merchant: 'Some Shop' }, rules)).toBe(false);
  });

  it('matches on category when merchantPattern is null', () => {
    const rules = [makeRule({ merchantPattern: null, category: 'Salary' })];
    expect(matchesAnyIncomeRule({ merchant: 'Anything', category: 'Salary' }, rules)).toBe(true);
    expect(matchesAnyIncomeRule({ merchant: 'Anything', category: 'Other' }, rules)).toBe(false);
  });

  it('requires both merchant and category to match when both are set', () => {
    const rules = [makeRule({ merchantPattern: 'KELA', category: 'Benefits' })];
    expect(matchesAnyIncomeRule({ merchant: 'KELA PAYMENT', category: 'Benefits' }, rules)).toBe(true);
    expect(matchesAnyIncomeRule({ merchant: 'KELA PAYMENT', category: 'Other' }, rules)).toBe(false);
    expect(matchesAnyIncomeRule({ merchant: 'Other merchant', category: 'Benefits' }, rules)).toBe(false);
  });

  it('returns false for an empty rule set', () => {
    expect(matchesAnyIncomeRule({ merchant: 'Salary' }, [])).toBe(false);
  });

  it('treats a missing category on the transaction as empty string for comparison', () => {
    const rules = [makeRule({ merchantPattern: null, category: 'Salary' })];
    expect(matchesAnyIncomeRule({ merchant: 'Anything' }, rules)).toBe(false);
  });
});

describe('getIncomeRules', () => {
  it('fetches all rules ordered by id', async () => {
    const rows = [makeRule({ id: 2 }), makeRule({ id: 1 })];
    vi.mocked(prisma.incomeRule.findMany).mockResolvedValueOnce(rows as never);
    const result = await getIncomeRules();
    expect(result).toBe(rows);
    expect(prisma.incomeRule.findMany).toHaveBeenCalledWith({ orderBy: { id: 'asc' } });
  });
});

describe('seedDefaultIncomeRules', () => {
  it('seeds the default rules when none exist', async () => {
    vi.mocked(prisma.incomeRule.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.incomeRule.createMany).mockResolvedValueOnce({ count: DEFAULT_INCOME_RULES.length } as never);

    const created = await seedDefaultIncomeRules();

    expect(created).toBe(DEFAULT_INCOME_RULES.length);
    expect(prisma.incomeRule.createMany).toHaveBeenCalledWith({ data: DEFAULT_INCOME_RULES });
  });

  it('skips seeding when rules already exist', async () => {
    vi.mocked(prisma.incomeRule.count).mockResolvedValueOnce(3);

    const created = await seedDefaultIncomeRules();

    expect(created).toBe(0);
    expect(prisma.incomeRule.createMany).not.toHaveBeenCalled();
  });
});
