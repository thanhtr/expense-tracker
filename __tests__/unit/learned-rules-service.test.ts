import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recordCorrection,
  lookupLearnedCategory,
  bootstrapRulesFromHistory,
  deleteLearnedRule,
  invalidateRulesCache,
} from '@/lib/services/learned-rules-service';
import * as splitwise from '@/lib/splitwise';
import type { SplitwiseExpense } from '@/lib/splitwise';
import * as pako from 'pako';

vi.mock('@/lib/splitwise');

// Helper to provide real parseExpenseDetails implementation
function setupMocks() {
  vi.mocked(splitwise.parseExpenseDetails).mockImplementation((detailsStr) => {
    if (!detailsStr) return {};
    try {
      return JSON.parse(detailsStr);
    } catch {
      return {};
    }
  });
}

// Helper to decompress payload details in tests
function getDecompressedRulesFromPayload(payload: Record<string, unknown>) {
  const details = JSON.parse(payload.details as string);
  if (details.__compressed && details.data) {
    const compressedBuffer = Buffer.from(details.data as string, 'base64');
    const decompressed = pako.ungzip(compressedBuffer, { to: 'string' });
    return JSON.parse(decompressed);
  }
  return details;
}

describe('learned-rules-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateRulesCache();
  });

  afterEach(() => {
    invalidateRulesCache();
  });

  describe('recordCorrection', () => {
    it('should save a new rule with count=1', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: '{"rules":{}, "version":0, "updatedAt":"2026-04-11T00:00:00Z"}',
        },
      ];

      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      await recordCorrection('AMAZON', 'Shopping');

      expect(splitwise.deleteExpense).toHaveBeenCalled();
      expect(splitwise.createExpense).toHaveBeenCalled();

      const callArg = vi.mocked(splitwise.createExpense).mock.calls[0][0];
      const store = getDecompressedRulesFromPayload(callArg);
      expect(store.rules['amazon']).toBeDefined();
      expect(store.rules['amazon'].category).toBe('Shopping');
      expect(store.rules['amazon'].count).toBe(1);
    });

    it('should increment count on repeat corrections', async () => {
      const existingRule = {
        category: 'Shopping',
        learnedFrom: 'AMAZON',
        learnedAt: '2026-04-01T00:00:00Z',
        count: 1,
      };

      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: JSON.stringify({
            rules: { amazon: existingRule },
            version: 1,
            updatedAt: '2026-04-01T00:00:00Z',
          }),
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      await recordCorrection('AMAZON', 'Shopping');

      expect(vi.mocked(splitwise.createExpense)).toHaveBeenCalled();
      const callArg = vi.mocked(splitwise.createExpense).mock.calls[0][0];
      const store = getDecompressedRulesFromPayload(callArg);
      expect(store.rules['amazon'].count).toBe(2);
    });

    it('should normalize merchant before storing', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: '{"rules":{}, "version":0, "updatedAt":"2026-04-11T00:00:00Z"}',
        },
      ];

      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      await recordCorrection('K-MARKET OY', 'Food & Groceries');

      const callArg = vi.mocked(splitwise.createExpense).mock.calls[0][0];
      const store = getDecompressedRulesFromPayload(callArg);
      expect(Object.keys(store.rules)).toContain('k-market');
    });

    it('should skip if merchant is empty', async () => {
      await recordCorrection('', 'Shopping');
      expect(splitwise.createExpense).not.toHaveBeenCalled();
    });

    it('should skip if category is empty', async () => {
      await recordCorrection('AMAZON', '');
      expect(splitwise.createExpense).not.toHaveBeenCalled();
    });
  });

  describe('lookupLearnedCategory', () => {
    it('should return category for a known merchant', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: JSON.stringify({
            rules: {
              amazon: {
                category: 'Shopping',
                learnedFrom: 'AMAZON',
                learnedAt: '2026-04-01T00:00:00Z',
                count: 2,
              },
            },
            version: 1,
            updatedAt: '2026-04-01T00:00:00Z',
          }),
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);

      const result = await lookupLearnedCategory('AMAZON');
      expect(result).toBe('Shopping');
    });

    it('should return null for unknown merchant', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: '{"rules":{}, "version":0, "updatedAt":"2026-04-11T00:00:00Z"}',
        },
      ];

      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);

      const result = await lookupLearnedCategory('UNKNOWN');
      expect(result).toBeNull();
    });

    it('should use cache on second call', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: JSON.stringify({
            rules: {
              amazon: {
                category: 'Shopping',
                learnedFrom: 'AMAZON',
                learnedAt: '2026-04-01T00:00:00Z',
                count: 2,
              },
            },
            version: 1,
            updatedAt: '2026-04-01T00:00:00Z',
          }),
        },
      ];

      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);

      await lookupLearnedCategory('AMAZON');
      await lookupLearnedCategory('AMAZON');

      // Should only call getAllExpenses once due to caching
      expect(splitwise.getAllExpenses).toHaveBeenCalledTimes(1);
    });

    it('should return null for empty merchant', async () => {
      const result = await lookupLearnedCategory('');
      expect(result).toBeNull();
    });
  });

  describe('bootstrapRulesFromHistory', () => {
    it('should seed rules from historical expenses', async () => {
      const mockExpenses = [
        {
          id: 1,
          description: 'AMAZON',
          details: JSON.stringify({ account: 'OP' }),
          category: { id: 1, name: 'Shopping' },
          deleted_at: null,
        },
        {
          id: 2,
          description: 'AMAZON',
          details: JSON.stringify({ account: 'OP' }),
          category: { id: 1, name: 'Shopping' },
          deleted_at: null,
        },
        {
          id: 3,
          description: 'SPOTIFY',
          details: JSON.stringify({ account: 'OP' }),
          category: { id: 18, name: 'Subscriptions' },
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      const result = await bootstrapRulesFromHistory();

      expect(result.learned).toBe(2); // amazon and spotify
      expect(splitwise.createExpense).toHaveBeenCalled();
    });

    it('should skip sentinel expense', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: '{"rules":{}, "version":0}',
          deleted_at: null,
        },
        {
          id: 1,
          description: 'AMAZON',
          details: JSON.stringify({ account: 'OP' }),
          category: { id: 1, name: 'Shopping' },
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      const result = await bootstrapRulesFromHistory();

      expect(result.learned).toBe(1); // only amazon
    });

    it('should use majority vote when merchant has multiple categories', async () => {
      const mockExpenses = [
        {
          id: 1,
          description: 'MARKET',
          details: JSON.stringify({}),
          category: { id: 2, name: 'Food & Groceries' },
          deleted_at: null,
        },
        {
          id: 2,
          description: 'MARKET',
          details: JSON.stringify({}),
          category: { id: 2, name: 'Food & Groceries' },
          deleted_at: null,
        },
        {
          id: 3,
          description: 'MARKET',
          details: JSON.stringify({}),
          category: { id: 1, name: 'Shopping' },
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      await bootstrapRulesFromHistory();

      const callArg = vi.mocked(splitwise.createExpense).mock.calls[0][0];
      const store = getDecompressedRulesFromPayload(callArg);
      expect(store.rules['market'].category).toBe('Food & Groceries');
    });

    it('should not overwrite existing high-confidence rules', async () => {
      const existingRule = {
        category: 'Shopping',
        learnedFrom: 'AMAZON',
        learnedAt: '2026-04-01T00:00:00Z',
        count: 5, // High confidence
      };

      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: JSON.stringify({
            rules: { amazon: existingRule },
            version: 1,
            updatedAt: '2026-04-01T00:00:00Z',
          }),
          deleted_at: null,
        },
        {
          id: 1,
          description: 'AMAZON',
          details: JSON.stringify({}),
          category: { id: 14, name: 'Entertainment' },
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      const result = await bootstrapRulesFromHistory();

      expect(result.skipped).toBeGreaterThan(0);
    });
  });

  describe('deleteLearnedRule', () => {
    it('should delete a learned rule', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: JSON.stringify({
            rules: {
              amazon: {
                category: 'Shopping',
                learnedFrom: 'AMAZON',
                learnedAt: '2026-04-01T00:00:00Z',
                count: 2,
              },
            },
            version: 1,
            updatedAt: '2026-04-01T00:00:00Z',
          }),
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);
      vi.mocked(splitwise.deleteExpense).mockResolvedValue(undefined);
      vi.mocked(splitwise.createExpense).mockResolvedValue(undefined);

      await deleteLearnedRule('amazon');

      expect(vi.mocked(splitwise.createExpense)).toHaveBeenCalled();
      const callArg = vi.mocked(splitwise.createExpense).mock.calls[0][0];
      const store = getDecompressedRulesFromPayload(callArg);
      expect(store.rules['amazon']).toBeUndefined();
    });

    it('should skip if rule does not exist', async () => {
      const mockExpenses = [
        {
          id: 999,
          description: '__learned_rules__',
          details: '{"rules":{}, "version":0, "updatedAt":"2026-04-11T00:00:00Z"}',
          deleted_at: null,
        },
      ];

      invalidateRulesCache();
      vi.clearAllMocks();
      setupMocks();
      vi.mocked(splitwise.getAllExpenses).mockResolvedValue(mockExpenses as SplitwiseExpense[]);

      await deleteLearnedRule('nonexistent');

      expect(vi.mocked(splitwise.createExpense)).not.toHaveBeenCalled();
    });
  });
});
