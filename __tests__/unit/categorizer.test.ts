import { describe, it, expect, vi, beforeEach } from 'vitest';
import { categorizeWithLearning } from '../../lib/categorizer';
import * as learnedRulesService from '@/lib/services/learned-rules-service';

vi.mock('@/lib/services/learned-rules-service');

describe('categorizeWithLearning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should apply learned rules before CSV keywords', async () => {
    vi.mocked(learnedRulesService.getLearnedRulesStore).mockResolvedValue({
      rules: {
        amazon: {
          category: 'Electronics',
          learnedFrom: 'AMAZON',
          learnedAt: '2026-04-01T00:00:00Z',
          count: 2,
        },
      },
      version: 1,
      updatedAt: '2026-04-01T00:00:00Z',
    });

    const rows = [
      {
        date: new Date('2026-04-01'),
        merchant: 'AMAZON',
        amount: 100,
        type: 'Expense' as const,
        category: '',
        account: 'OP',
        note: '',
      },
    ];

    const result = await categorizeWithLearning(rows);

    expect(result[0].category).toBe('Electronics');
  });

  it('should leave uncategorized when no learned rule exists', async () => {
    vi.mocked(learnedRulesService.getLearnedRulesStore).mockResolvedValue({
      rules: {},
      version: 1,
      updatedAt: '2026-04-01T00:00:00Z',
    });

    const rows = [
      {
        date: new Date('2026-04-01'),
        merchant: 'Unknown Store',
        amount: 100,
        type: 'Expense' as const,
        category: '',
        account: 'OP',
        note: '',
      },
    ];

    const result = await categorizeWithLearning(rows);

    // Should leave uncategorized since no learned rule matches
    expect(result[0].category).toBe('');
    expect(result[0].type).toBe('Expense');
  });

  it('should not modify other transaction fields', async () => {
    vi.mocked(learnedRulesService.getLearnedRulesStore).mockResolvedValue({
      rules: {
        spotify: {
          category: 'Subscriptions',
          learnedFrom: 'SPOTIFY',
          learnedAt: '2026-04-01T00:00:00Z',
          count: 1,
        },
      },
      version: 1,
      updatedAt: '2026-04-01T00:00:00Z',
    });

    const date = new Date('2026-04-01');
    const rows = [
      {
        date,
        merchant: 'SPOTIFY',
        amount: 12.99,
        type: 'Expense' as const,
        category: '',
        account: 'Amex',
        note: '',
      },
    ];

    const result = await categorizeWithLearning(rows);

    expect(result[0].date).toEqual(date);
    expect(result[0].merchant).toBe('SPOTIFY');
    expect(result[0].amount).toBe(12.99);
    expect(result[0].type).toBe('Expense');
    expect(result[0].account).toBe('Amex');
    expect(result[0].category).toBe('Subscriptions');
  });

  it('should handle multiple transactions with learned rules and leave others uncategorized', async () => {
    vi.mocked(learnedRulesService.getLearnedRulesStore).mockResolvedValue({
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
    });

    const rows = [
      {
        date: new Date('2026-04-01'),
        merchant: 'AMAZON',
        amount: 50,
        type: 'Expense' as const,
        category: '',
        account: 'OP',
        note: '',
      },
      {
        date: new Date('2026-04-02'),
        merchant: 'Unknown Store',
        amount: 25,
        type: 'Expense' as const,
        category: '',
        account: 'OP',
        note: '',
      },
    ];

    const result = await categorizeWithLearning(rows);

    expect(result[0].category).toBe('Shopping'); // From learned rule
    expect(result[1].category).toBe(''); // Uncategorized - no learned rule
  });
});
