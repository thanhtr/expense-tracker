import { z } from 'zod';
import { NextResponse } from 'next/server';
import { PAID_BY, TRANSACTION_TYPES, ASSET_TYPES } from './constants';

const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine(s => !isNaN(new Date(s).getTime()), 'must be a valid date')
  .optional();

export const dashboardQuerySchema = z.object({
  date_from: dateParam,
  date_to: dateParam,
  category: z.string().max(100).optional(),
  paid_by: z.enum(PAID_BY).optional(),
  account: z.string().max(100).optional(),
  refresh: z.literal('1').optional(),
});

export const transactionQuerySchema = z.object({
  date_from: dateParam,
  date_to: dateParam,
  account: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  merchant: z.string().max(200).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  paid_by: z.enum(PAID_BY).optional(),
  amount_min: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'must be a number')
    .transform(Number)
    .optional(),
  amount_max: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/, 'must be a number')
    .transform(Number)
    .optional(),
  tag: z.string().max(100).optional(),
  sort_by: z.enum(['date', 'amount', 'merchant', 'category']).default('date'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z
    .string()
    .regex(/^\d+$/, 'must be a positive integer')
    .transform(Number)
    .refine(n => n <= 500, 'limit cannot exceed 500')
    .default(100),
  offset: z
    .string()
    .regex(/^\d+$/, 'must be a non-negative integer')
    .transform(Number)
    .default(0),
});

export const bulkDeleteQuerySchema = z.object({
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine(s => !isNaN(new Date(s).getTime()), 'must be a valid date'),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').refine(s => !isNaN(new Date(s).getTime()), 'must be a valid date'),
});

export const exportQuerySchema = z.object({
  date_from: dateParam,
  date_to: dateParam,
  account: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  merchant: z.string().max(200).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  paid_by: z.enum(PAID_BY).optional(),
});

// ── Body schemas ──────────────────────────────────────────────────────────────

const dateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine(s => !isNaN(new Date(s).getTime()), 'must be a valid date');

export const createGoalSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()),
  targetAmount: z.number().positive().finite(),
  currentAmount: z.number().min(0).finite().optional().default(0),
  targetDate: dateField,
  linkedCategory: z.string().max(100).optional().nullable(),
});

export const updateGoalSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()).optional(),
  targetAmount: z.number().positive().finite().optional(),
  currentAmount: z.number().min(0).finite().optional(),
  targetDate: dateField.optional(),
  linkedCategory: z.string().max(100).optional().nullable(),
});

export const createAssetSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()),
  type: z.enum(ASSET_TYPES),
  balance: z.number().finite(),
  recordedAt: dateField,
});

export const updateAssetSchema = z.object({
  name: z.string().min(1).max(200).transform(s => s.trim()).optional(),
  type: z.enum(ASSET_TYPES).optional(),
  balance: z.number().finite().optional(),
  recordedAt: dateField.optional(),
});

export const createBudgetSchema = z.object({
  category: z.string().min(1).max(100),
  monthlyLimit: z.number().nonnegative().finite(),
  rollover: z.boolean().optional(),
});

export const createKeywordSchema = z.object({
  keyword: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
});

export const updateKeywordSchema = z.object({
  keyword: z.string().min(1).max(200),
  category: z.string().min(1).max(100),
});

export const updateTransactionSchema = z.object({
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).optional(),
  note: z.string().max(500).optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
});

export const createIncomeRuleSchema = z.object({
  label: z.string().max(200).default(''),
  merchantPattern: z.string().max(200).optional(),
  category: z.string().max(100).optional(),
}).refine(d => d.merchantPattern || d.category, {
  message: 'At least one of merchantPattern or category is required',
});

export const updateSplitsSchema = z.object({
  splits: z.array(z.object({
    category: z.string().min(1).max(100),
    amount: z.number().positive().finite(),
  })).min(1),
});

export const bulkCategorizeSchema = z.object({
  category: z.string().min(1).max(100),
  ids: z.array(z.number().int().positive()).optional(),
  merchant: z.string().max(200).optional(),
});

export const bulkDeleteSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
});

export const bulkRetypeSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1),
  type: z.enum(TRANSACTION_TYPES),
});

export const updateGuidelinesSchema = z.object({
  buckets: z.array(z.object({
    bucket: z.enum(['needs', 'wants', 'savings']),
    targetPct: z.number().positive().max(100),
    categories: z.array(z.string().max(100)),
  })).length(3),
});

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100).transform(s => s.trim()),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).transform(s => s.trim()),
});

export const fireConfigSchema = z.object({
  dateOfBirth:         z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD').optional(),
  retirementAge:       z.number().int().min(30).max(90).optional(),
  mortgageEndAge:      z.number().int().min(30).max(90).optional(),
  pensionAge:          z.number().int().min(55).max(75).optional(),
  lifeExpectancy:      z.number().int().min(70).max(110).optional(),
  monthlyContribution: z.number().min(0).finite().optional(),
  accumulationReturn:  z.number().min(0).max(0.20).optional(),
  drawdownReturn:      z.number().min(0).max(0.15).optional(),
  capitalGainsTaxRate: z.number().min(0).max(0.50).optional(),
  phase1aNetMonthly:   z.number().min(0).finite().optional(),
  phase1bNetMonthly:   z.number().min(0).finite().optional(),
  phase2NetMonthly:    z.number().min(0).finite().optional(),
  pensionNetMonthly:   z.number().min(0).finite().optional(),
}).superRefine((d, ctx) => {
  // Age ordering must be monotonically increasing to keep simulation loops valid.
  // Only validate fields that are present in this partial update.
  const ages = [
    { key: 'retirementAge',   val: d.retirementAge },
    { key: 'mortgageEndAge',  val: d.mortgageEndAge },
    { key: 'pensionAge',      val: d.pensionAge },
    { key: 'lifeExpectancy',  val: d.lifeExpectancy },
  ].filter(a => a.val !== undefined) as { key: string; val: number }[];

  for (let i = 1; i < ages.length; i++) {
    if (ages[i]!.val <= ages[i - 1]!.val) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [ages[i]!.key],
        message: `must be greater than ${ages[i - 1]!.key} (${ages[i - 1]!.val})`,
      });
    }
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

export function parseQuery<T>(
  schema: z.ZodType<T>,
  params: URLSearchParams,
): { data: T } | { error: NextResponse } {
  const raw = Object.fromEntries(
    [...params.entries()].filter(([, v]) => v !== ''),
  );
  const result = schema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return {
      error: NextResponse.json(
        { error: 'Invalid query parameters', details: messages },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}

export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
): { data: T } | { error: NextResponse } {
  const result = schema.safeParse(body);
  if (!result.success) {
    const messages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    return {
      error: NextResponse.json(
        { error: 'Invalid request body', details: messages },
        { status: 400 },
      ),
    };
  }
  return { data: result.data };
}

export function parseId(idStr: string): { id: number } | { error: NextResponse } {
  const id = parseInt(idStr, 10);
  if (isNaN(id) || id <= 0) {
    return { error: NextResponse.json({ error: 'Invalid id' }, { status: 400 }) };
  }
  return { id };
}
