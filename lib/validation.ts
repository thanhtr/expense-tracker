import { z } from 'zod';
import { NextResponse } from 'next/server';

const dateParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine(s => !isNaN(new Date(s).getTime()), 'must be a valid date')
  .optional();

export const dashboardQuerySchema = z.object({
  date_from: dateParam,
  date_to: dateParam,
  category: z.string().max(100).optional(),
  paid_by: z.enum(['tung', 'thuy', 'other']).optional(),
  account: z.string().max(100).optional(),
});

export const transactionQuerySchema = z.object({
  date_from: dateParam,
  date_to: dateParam,
  account: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  merchant: z.string().max(200).optional(),
  type: z.enum(['Income', 'Expense']).optional(),
  paid_by: z.enum(['tung', 'thuy', 'other']).optional(),
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

export const exportQuerySchema = z.object({
  date_from: dateParam,
  date_to: dateParam,
  account: z.string().max(100).optional(),
  category: z.string().max(100).optional(),
  merchant: z.string().max(200).optional(),
  type: z.enum(['Income', 'Expense']).optional(),
  paid_by: z.enum(['tung', 'thuy', 'other']).optional(),
});

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
