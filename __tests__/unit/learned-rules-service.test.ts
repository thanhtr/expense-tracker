import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordCorrection,
  lookupLearnedCategory,
  deleteLearnedRule,
  invalidateRulesCache,
  getLearnedRulesStore,
} from '@/lib/services/learned-rules-service';

vi.mock('@/lib/db', () => ({
  prisma: {
    learnedRule: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db';

function makeRule(overrides: Partial<{
  id: number; normalizedKey: string; category: string; learnedFrom: string;
  count: number; learnedAt: Date; updatedAt: Date;
}> = {}) {
  return {
    id: 1,
    normalizedKey: 'amazon',
    category: 'Shopping',
    learnedFrom: 'AMAZON',
    count: 1,
    learnedAt: new Date('2026-04-01'),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('learned-rules-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateRulesCache();
  });

  describe('getLearnedRulesStore', () => {
    it('should convert DB rows to LearnedRulesStore shape', async () => {
      vi.mocked(prisma.learnedRule.findMany).mockResolvedValueOnce([
        makeRule({ normalizedKey: 'amazon', category: 'Shopping', count: 2 }),
      ]);

      const store = await getLearnedRulesStore();

      expect(store.rules['amazon']).toBeDefined();
      expect(store.rules['amazon'].category).toBe('Shopping');
      expect(store.rules['amazon'].count).toBe(2);
    });

    it('should return empty rules when no rows', async () => {
      vi.mocked(prisma.learnedRule.findMany).mockResolvedValueOnce([]);

      const store = await getLearnedRulesStore();

      expect(store.rules).toEqual({});
    });

    it('should use cache on second call within TTL', async () => {
      vi.mocked(prisma.learnedRule.findMany).mockResolvedValue([makeRule()]);

      await getLearnedRulesStore();
      await getLearnedRulesStore();

      expect(prisma.learnedRule.findMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordCorrection', () => {
    it('should upsert a rule with count=1 for new merchant', async () => {
      vi.mocked(prisma.learnedRule.findUnique).mockResolvedValueOnce(null);
      vi.mocked(prisma.learnedRule.upsert).mockResolvedValueOnce(makeRule());

      await recordCorrection('AMAZON', 'Shopping');

      expect(prisma.learnedRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { normalizedKey: 'amazon' },
          create: expect.objectContaining({ category: 'Shopping', count: 1 }),
          update: expect.objectContaining({ category: 'Shopping', count: 1 }),
        })
      );
    });

    it('should increment count on repeat correction', async () => {
      vi.mocked(prisma.learnedRule.findUnique).mockResolvedValueOnce(makeRule({ count: 3 }));
      vi.mocked(prisma.learnedRule.upsert).mockResolvedValueOnce(makeRule());

      await recordCorrection('AMAZON', 'Shopping');

      expect(prisma.learnedRule.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ count: 4 }),
        })
      );
    });

    it('should skip empty merchant or category', async () => {
      await recordCorrection('', 'Shopping');
      await recordCorrection('AMAZON', '');

      expect(prisma.learnedRule.upsert).not.toHaveBeenCalled();
    });

    it('should invalidate cache after saving', async () => {
      vi.mocked(prisma.learnedRule.findMany).mockResolvedValue([makeRule()]);
      vi.mocked(prisma.learnedRule.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.learnedRule.upsert).mockResolvedValue(makeRule());

      await getLearnedRulesStore(); // populate cache
      await recordCorrection('AMAZON', 'Shopping'); // invalidates cache
      await getLearnedRulesStore(); // re-fetches from DB

      expect(prisma.learnedRule.findMany).toHaveBeenCalledTimes(2);
    });
  });

  describe('lookupLearnedCategory', () => {
    it('should return category for known merchant', async () => {
      vi.mocked(prisma.learnedRule.findUnique).mockResolvedValueOnce(
        makeRule({ normalizedKey: 'espresso house', category: 'Dining Out' })
      );

      const result = await lookupLearnedCategory('ESPRESSO HOUSE OY');

      expect(result).toBe('Dining Out');
    });

    it('should return null for unknown merchant', async () => {
      vi.mocked(prisma.learnedRule.findUnique).mockResolvedValueOnce(null);

      const result = await lookupLearnedCategory('Unknown Merchant');

      expect(result).toBeNull();
    });

    it('should return null for empty input', async () => {
      const result = await lookupLearnedCategory('');
      expect(result).toBeNull();
    });
  });

  describe('deleteLearnedRule', () => {
    it('should call deleteMany with the normalizedKey', async () => {
      vi.mocked(prisma.learnedRule.deleteMany).mockResolvedValueOnce({ count: 1 });

      await deleteLearnedRule('amazon');

      expect(prisma.learnedRule.deleteMany).toHaveBeenCalledWith({ where: { normalizedKey: 'amazon' } });
    });

    it('should skip empty key', async () => {
      await deleteLearnedRule('');
      expect(prisma.learnedRule.deleteMany).not.toHaveBeenCalled();
    });
  });
});
