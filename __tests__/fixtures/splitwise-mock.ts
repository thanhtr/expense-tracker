/**
 * Splitwise mock data factories for E2E tests
 * These factories create realistic Splitwise API response objects
 */

export interface SplitwiseMockExpense {
  id: number;
  date: string;
  description: string;
  cost: string;
  currency_code: string;
  category: {
    id: number;
    name: string;
  };
  users: Array<{
    user_id: number;
    user: {
      id: number;
      first_name: string;
      last_name: string;
    };
    paid_share: string;
    owed_share: string;
  }>;
  details: string | null;
  deleted_at: string | null;
}

export function mockExpense(overrides?: Partial<SplitwiseMockExpense>): SplitwiseMockExpense {
  const id = overrides?.id ?? 1;
  return {
    id,
    date: overrides?.date ?? '2026-04-10',
    description: overrides?.description ?? 'Test Transaction',
    cost: overrides?.cost ?? '45.67',
    currency_code: overrides?.currency_code ?? 'EUR',
    category: overrides?.category ?? {
      id: 18,
      name: 'General',
    },
    users: overrides?.users ?? [
      {
        user_id: 123,
        user: {
          id: 123,
          first_name: 'Tung',
          last_name: 'Trinh',
        },
        paid_share: overrides?.cost ?? '45.67',
        owed_share: String((parseFloat(overrides?.cost ?? '45.67') / 2).toFixed(2)),
      },
      {
        user_id: 456,
        user: {
          id: 456,
          first_name: 'Thuy',
          last_name: 'Trinh',
        },
        paid_share: '0.00',
        owed_share: String((parseFloat(overrides?.cost ?? '45.67') / 2).toFixed(2)),
      },
    ],
    details: overrides?.details ?? null,
    deleted_at: overrides?.deleted_at ?? null,
  };
}

export function mockExpenses(count: number, baseDate: Date = new Date('2026-04-10')): SplitwiseMockExpense[] {
  const categories = [
    { id: 41, name: 'Shopping' },
    { id: 25, name: 'Food & Dining' },
    { id: 12, name: 'Food & Groceries' },
    { id: 31, name: 'Transport' },
    { id: 19, name: 'Entertainment' },
  ];

  const merchants = [
    'Amazon',
    'Starbucks',
    'Whole Foods',
    'Uber',
    'Netflix',
    'Spotify',
    'Target',
    'Trader Joe\'s',
    'Restaurant',
    'Gas Station',
  ];

  const expenses: SplitwiseMockExpense[] = [];

  for (let i = 0; i < count; i++) {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + Math.floor(i / 2)); // Spread across days

    const amount = (Math.random() * 100 + 5).toFixed(2);
    const category = categories[i % categories.length];
    const merchant = merchants[i % merchants.length];

    expenses.push(
      mockExpense({
        id: i + 1,
        date: date.toISOString().split('T')[0],
        description: merchant,
        cost: amount,
        category,
      })
    );
  }

  return expenses;
}

/**
 * Helper to set up page.route interceptor for Splitwise API
 * Usage: await setupSplitwise(page, { get_expenses: mockExpenseArray })
 */
export async function setupSplitwise(
  page: any,
  mocks: {
    get_expenses?: SplitwiseMockExpense[];
    create_expense?: boolean;
    delete_expense?: boolean;
  }
) {
  await page.route('https://secure.splitwise.com/**', async (route: any) => {
    const url = new URL(route.request().url());

    if (url.pathname.includes('get_expenses')) {
      await route.fulfill({
        json: { expenses: mocks.get_expenses ?? [] },
      });
    } else if (url.pathname.includes('create_expense')) {
      if (mocks.create_expense === false) {
        await route.abort();
      } else {
        await route.fulfill({
          json: { success: true },
        });
      }
    } else if (url.pathname.includes('delete_expense')) {
      if (mocks.delete_expense === false) {
        await route.abort();
      } else {
        await route.fulfill({
          json: { success: true },
        });
      }
    } else {
      // Pass through or reject other routes
      await route.abort();
    }
  });
}
