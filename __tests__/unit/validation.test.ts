import { describe, it, expect } from 'vitest';
import {
  parseId,
  parseBody,
  createGoalSchema,
  updateGoalSchema,
  createAssetSchema,
  updateAssetSchema,
  createBudgetSchema,
  createKeywordSchema,
  updateTransactionSchema,
  updateSplitsSchema,
  bulkCategorizeSchema,
  updateGuidelinesSchema,
} from '../../lib/validation';


describe('parseId', () => {
  it('returns id for valid positive integer string', () => {
    const result = parseId('42');
    expect('id' in result).toBe(true);
    if ('id' in result) expect(result.id).toBe(42);
  });

  it('returns error for non-numeric string', () => {
    const result = parseId('abc');
    expect('error' in result).toBe(true);
  });

  it('returns error for zero', () => {
    const result = parseId('0');
    expect('error' in result).toBe(true);
  });

  it('returns error for negative integer', () => {
    const result = parseId('-5');
    expect('error' in result).toBe(true);
  });

  it('returns error for empty string', () => {
    const result = parseId('');
    expect('error' in result).toBe(true);
  });
});


describe('parseBody', () => {
  it('returns data on successful parse', () => {
    const result = parseBody(createBudgetSchema, { category: 'Groceries', monthlyLimit: 500 });
    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.category).toBe('Groceries');
      expect(result.data.monthlyLimit).toBe(500);
    }
  });

  it('returns error response on failed parse', () => {
    const result = parseBody(createBudgetSchema, { category: '' });
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error.status).toBe(400);
    }
  });

  it('returns error for completely wrong type', () => {
    const result = parseBody(createBudgetSchema, 'not an object');
    expect('error' in result).toBe(true);
  });
});


describe('createGoalSchema', () => {
  const valid = { name: 'Vacation', targetAmount: 3000, targetDate: '2026-12-31' };

  it('accepts valid input', () => {
    const r = createGoalSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('trims name', () => {
    const r = createGoalSchema.safeParse({ ...valid, name: '  Vacation  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.name).toBe('Vacation');
  });

  it('rejects empty name', () => {
    expect(createGoalSchema.safeParse({ ...valid, name: '' }).success).toBe(false);
  });

  it('rejects negative targetAmount', () => {
    expect(createGoalSchema.safeParse({ ...valid, targetAmount: -100 }).success).toBe(false);
  });

  it('rejects zero targetAmount', () => {
    expect(createGoalSchema.safeParse({ ...valid, targetAmount: 0 }).success).toBe(false);
  });

  it('rejects invalid date format', () => {
    expect(createGoalSchema.safeParse({ ...valid, targetDate: '31/12/2026' }).success).toBe(false);
  });

  it('rejects non-date string matching YYYY-MM-DD pattern', () => {
    expect(createGoalSchema.safeParse({ ...valid, targetDate: '2026-13-99' }).success).toBe(false);
  });

  it('defaults currentAmount to 0', () => {
    const r = createGoalSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.currentAmount).toBe(0);
  });
});


describe('updateGoalSchema', () => {
  it('accepts partial updates', () => {
    expect(updateGoalSchema.safeParse({ currentAmount: 500 }).success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid targetDate in update', () => {
    expect(updateGoalSchema.safeParse({ targetDate: 'bad-date' }).success).toBe(false);
  });
});


describe('createAssetSchema', () => {
  const valid = { name: 'OP Savings', type: 'bank', balance: 10000, recordedAt: '2026-08-01' };

  it('accepts valid input', () => {
    expect(createAssetSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid asset type', () => {
    expect(createAssetSchema.safeParse({ ...valid, type: 'gold' }).success).toBe(false);
  });

  it('accepts all valid asset types', () => {
    for (const type of ['bank', 'investment', 'property', 'crypto', 'liability']) {
      expect(createAssetSchema.safeParse({ ...valid, type }).success).toBe(true);
    }
  });

  it('rejects non-date recordedAt', () => {
    expect(createAssetSchema.safeParse({ ...valid, recordedAt: 'today' }).success).toBe(false);
  });

  it('accepts negative balance (liabilities)', () => {
    expect(createAssetSchema.safeParse({ ...valid, type: 'liability', balance: -5000 }).success).toBe(true);
  });

  it('rejects Infinity balance', () => {
    expect(createAssetSchema.safeParse({ ...valid, balance: Infinity }).success).toBe(false);
  });
});


describe('updateAssetSchema', () => {
  it('accepts partial updates', () => {
    expect(updateAssetSchema.safeParse({ balance: 12000 }).success).toBe(true);
  });

  it('rejects invalid type in update', () => {
    expect(updateAssetSchema.safeParse({ type: 'invalid' }).success).toBe(false);
  });
});


describe('createBudgetSchema', () => {
  it('accepts valid input', () => {
    expect(createBudgetSchema.safeParse({ category: 'Groceries', monthlyLimit: 400 }).success).toBe(true);
  });

  it('rejects negative monthlyLimit', () => {
    expect(createBudgetSchema.safeParse({ category: 'Groceries', monthlyLimit: -1 }).success).toBe(false);
  });

  it('accepts zero monthlyLimit', () => {
    expect(createBudgetSchema.safeParse({ category: 'Groceries', monthlyLimit: 0 }).success).toBe(true);
  });

  it('accepts rollover flag', () => {
    const r = createBudgetSchema.safeParse({ category: 'Groceries', monthlyLimit: 400, rollover: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rollover).toBe(true);
  });
});


describe('createKeywordSchema', () => {
  it('accepts valid keyword and category', () => {
    expect(createKeywordSchema.safeParse({ keyword: 'amazon', category: 'Shopping' }).success).toBe(true);
  });

  it('rejects empty keyword', () => {
    expect(createKeywordSchema.safeParse({ keyword: '', category: 'Shopping' }).success).toBe(false);
  });
});


describe('updateTransactionSchema', () => {
  it('accepts category update', () => {
    expect(updateTransactionSchema.safeParse({ category: 'Groceries' }).success).toBe(true);
  });

  it('accepts tags update', () => {
    expect(updateTransactionSchema.safeParse({ tags: ['work', 'reimbursable'] }).success).toBe(true);
  });

  it('accepts empty object', () => {
    expect(updateTransactionSchema.safeParse({}).success).toBe(true);
  });

  it('rejects non-string tags', () => {
    expect(updateTransactionSchema.safeParse({ tags: [1, 2] }).success).toBe(false);
  });
});


describe('updateSplitsSchema', () => {
  const valid = { splits: [{ category: 'Groceries', amount: 30 }, { category: 'Shopping', amount: 20 }] };

  it('accepts valid splits', () => {
    expect(updateSplitsSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects empty splits array', () => {
    expect(updateSplitsSchema.safeParse({ splits: [] }).success).toBe(false);
  });

  it('rejects zero amount in split', () => {
    expect(updateSplitsSchema.safeParse({ splits: [{ category: 'Groceries', amount: 0 }] }).success).toBe(false);
  });

  it('rejects negative amount in split', () => {
    expect(updateSplitsSchema.safeParse({ splits: [{ category: 'Groceries', amount: -5 }] }).success).toBe(false);
  });
});


describe('bulkCategorizeSchema', () => {
  it('accepts ids array', () => {
    expect(bulkCategorizeSchema.safeParse({ category: 'Shopping', ids: [1, 2, 3] }).success).toBe(true);
  });

  it('accepts merchant string', () => {
    expect(bulkCategorizeSchema.safeParse({ category: 'Shopping', merchant: 'Amazon' }).success).toBe(true);
  });

  it('accepts category only (routing logic handles missing ids/merchant)', () => {
    expect(bulkCategorizeSchema.safeParse({ category: 'Shopping' }).success).toBe(true);
  });

  it('rejects non-integer ids', () => {
    expect(bulkCategorizeSchema.safeParse({ category: 'Shopping', ids: [1.5, 2] }).success).toBe(false);
  });

  it('rejects negative ids', () => {
    expect(bulkCategorizeSchema.safeParse({ category: 'Shopping', ids: [-1] }).success).toBe(false);
  });
});


describe('updateGuidelinesSchema', () => {
  const valid = {
    buckets: [
      { bucket: 'needs', targetPct: 50, categories: ['Groceries'] },
      { bucket: 'wants', targetPct: 30, categories: ['Dining Out'] },
      { bucket: 'savings', targetPct: 20, categories: ['Investments'] },
    ],
  };

  it('accepts valid 3-bucket config', () => {
    expect(updateGuidelinesSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects fewer than 3 buckets', () => {
    expect(updateGuidelinesSchema.safeParse({ buckets: valid.buckets.slice(0, 2) }).success).toBe(false);
  });

  it('rejects more than 3 buckets', () => {
    expect(updateGuidelinesSchema.safeParse({
      buckets: [...valid.buckets, { bucket: 'needs', targetPct: 10, categories: [] }],
    }).success).toBe(false);
  });

  it('rejects invalid bucket name', () => {
    const bad = { buckets: [{ bucket: 'misc', targetPct: 50, categories: [] }, ...valid.buckets.slice(1)] };
    expect(updateGuidelinesSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects targetPct > 100', () => {
    const bad = { buckets: [{ ...valid.buckets[0], targetPct: 110 }, ...valid.buckets.slice(1)] };
    expect(updateGuidelinesSchema.safeParse(bad).success).toBe(false);
  });
});
