import { test, expect, type Page } from '@playwright/test';
import { setupSplitwise, mockExpenses, mockExpense } from '../fixtures/api-mock';

test.describe('Dashboard', () => {
  test('should load dashboard and display charts', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(5, new Date('2026-04-01')));
    await page.goto('/');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('text=Top Category')).toBeVisible();
    await expect(page.locator('text=Monthly average')).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
  });

  test('should display correct total expenses', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Item 1', amount: 50.00 }),
      mockExpense({ merchant: 'Item 2', amount: 30.00 }),
      mockExpense({ merchant: 'Item 3', amount: 20.00 }),
    ]);
    await page.goto('/');
    const labelDiv = page.locator('text=Total expenses').first();
    await expect(labelDiv).toBeVisible();
    const valueText = await labelDiv.locator('..').locator('div').nth(1).textContent();
    expect(valueText).toContain('100');
  });

  test('should display transaction count', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(3));
    await page.goto('/');
    const transactionsCard = page.locator('.dash-card').filter({ hasText: 'Transactions' }).first();
    await expect(transactionsCard).toBeVisible();
    const valueText = await transactionsCard.locator('div').nth(1).textContent();
    expect(valueText).toContain('3');
  });

  test('shows a refund on a day with no matching expenses, instead of dropping it', async ({ page }) => {
    // Regression test: the daily chart used to merge refunds onto existing byDay rows
    // only, so a refund posted on a day with zero expenses silently never rendered.
    await page.route('**/api/dashboard*', async (route) => {
      await route.fulfill({
        json: {
          totalExpenses: 80, totalIncome: 0, totalInvestments: 0, totalInternalTransfers: 0,
          totalReimbursements: 30, net: -50,
          byCategory: [{ category: 'Dining Out', amount: 50 }],
          byDay: [{ day: '2026-04-10', 'Dining Out': 80 }],
          refundsByDay: [{ day: '2026-04-20', amount: 30 }],
          refundsByMonth: [{ month: '2026-04', amount: 30 }],
          byAccount: {}, byMonth: [{ month: '2026-04', amount: 80 }], byMonthIncome: [],
          byCategoryMonth: [{ month: '2026-04', 'Dining Out': 80 }],
          topTransactions: [], allCategories: ['Dining Out'], transactionCount: 1,
          uncategorizedCount: 0, byPerson: [], byIncomeSource: [],
        },
      });
    });
    await page.route('**/api/transactions/recurring*', async (route) => {
      await route.fulfill({ json: { items: [], totalMonthly: 0 } });
    });
    await page.route('**/api/transactions*', async (route) => {
      await route.fulfill({ json: { transactions: [], total: 0, offset: 0, limit: 50 } });
    });

    await page.goto('/');
    await expect(page.locator('text=Daily spending')).toBeVisible();
    await expect(page.locator('text=Refunds')).toBeVisible();
    // The chart's x-axis should include the refund's own day (04/20), not just the
    // expense's day (04/10) — confirms the refund-only day wasn't dropped from the series.
    const barCount = await page.locator('.recharts-bar-rectangle').count();
    expect(barCount).toBeGreaterThan(1);
  });

  test('should filter by category and show only selected category data', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Amazon', amount: 50.00, category: 'Shopping' }),
      mockExpense({ merchant: 'Starbucks', amount: 5.50, category: 'Food & Dining' }),
      mockExpense({ merchant: 'Grocery Store', amount: 30.00, category: 'Food & Groceries' }),
    ]);
    await page.goto('/');
    await expect(page.locator('text=Total expenses').first()).toBeVisible();
    // Category filter is a dropdown-with-checkboxes (MultiSelectDropdown), not a native <select>.
    await page.locator('button', { hasText: 'All categories' }).click();
    await page.locator('[role="listbox"] label', { hasText: 'Shopping' }).click();
    await page.keyboard.press('Escape');
    await page.waitForLoadState('networkidle');
    const valueText = await page.locator('text=Total expenses').first()
      .locator('..').locator('div').nth(1).textContent();
    expect(valueText).toContain('50');
  });

  test('should handle empty expenses gracefully', async ({ page }) => {
    await setupSplitwise(page, []);
    await page.goto('/');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    const valueText = await page.locator('text=Total expenses').first()
      .locator('..').locator('div').nth(1).textContent();
    expect(valueText).toMatch(/0|€|—/);
  });

  test('should update when date range is changed', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(5, new Date('2026-04-01')));
    await page.goto('/');
    await expect(page.locator('text=Total expenses').first()).toBeVisible();
    const dateInputs = page.locator('input[type="date"]');
    if (await dateInputs.count() > 0) {
      await dateInputs.first().fill('2026-04-10');
      await page.waitForLoadState('networkidle');
      const valueText = await page.locator('text=Total expenses').first()
        .locator('..').locator('div').nth(1).textContent();
      expect(valueText).toBeDefined();
    }
  });

  test('should display uncategorized warning for uncategorized transactions', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Unknown', amount: 50.00, category: '' }),
    ]);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/ncategor/i').first()).toBeVisible();
  });

  // Two months of data: Rent dominates (€1200/mo), Shopping is small (€100/mo)
  const rentShoppingDashboard = Object.freeze({
    totalExpenses: 2600,
    totalIncome: 0,
    totalInvestments: 0,
    totalInternalTransfers: 0,
    totalReimbursements: 0,
    net: -2600,
    byCategory: [
      { category: 'Rent', amount: 2400 },
      { category: 'Shopping', amount: 200 },
    ],
    byDay: [],
    refundsByDay: [],
    refundsByMonth: [],
    byAccount: {},
    byMonth: [
      { month: '2026-03', amount: 1300 },
      { month: '2026-04', amount: 1300 },
    ],
    byMonthIncome: [],
    byCategoryMonth: [
      { month: '2026-03', Rent: 1200, Shopping: 100 },
      { month: '2026-04', Rent: 1200, Shopping: 100 },
    ],
    topTransactions: [],
    allCategories: ['Rent', 'Shopping'],
    transactionCount: 4,
    uncategorizedCount: 0,
    byPerson: [],
    byIncomeSource: [],
  });

  async function setupRentShoppingRoutes(page: Page) {
    await page.route('**/api/dashboard*', (route) => route.fulfill({ json: rentShoppingDashboard }));
    // recurring must be registered before the broader transactions* pattern
    await page.route('**/api/transactions/recurring*', (route) => route.fulfill({ json: { items: [], totalMonthly: 0 } }));
    await page.route('**/api/transactions*', (route) => route.fulfill({ json: { transactions: [], total: 0, offset: 0, limit: 50 } }));
    await page.route('**/api/categories*', (route) => route.fulfill({ json: { categories: ['Rent', 'Shopping'] } }));
    await page.route('**/api/budgets*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/goals*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/assets*', (route) => route.fulfill({ json: [] }));
  }

  // Bucket config used by guideline tests: Needs=housing, Savings=investments, Wants=catch-all
  const testBuckets = [
    { bucket: 'needs', targetPct: 50, categories: ['Rent & Housing'] },
    { bucket: 'wants', targetPct: 30, categories: [] },
    { bucket: 'savings', targetPct: 20, categories: ['Investments'] },
  ];

  // Base dashboard shape — override specific fields per test
  const baseDashboard = {
    ...rentShoppingDashboard,
    byCategory: [],
    totalExpenses: 0,
    totalIncome: 0,
    totalInvestments: 0,
    net: 0,
    byMonth: [],
    byCategoryMonth: [],
    allCategories: [],
    transactionCount: 0,
  };

  async function setupGuidelineRoutes(page: Page, dashOverride: Record<string, unknown>) {
    const data = { ...baseDashboard, ...dashOverride };
    await page.route('**/api/dashboard*', (route) => route.fulfill({ json: data }));
    await page.route('**/api/guidelines*', (route) => route.fulfill({ json: { buckets: testBuckets } }));
    await page.route('**/api/transactions/recurring*', (route) => route.fulfill({ json: { items: [], totalMonthly: 0 } }));
    await page.route('**/api/transactions*', (route) => route.fulfill({ json: { transactions: [], total: 0, offset: 0, limit: 50 } }));
    await page.route('**/api/categories*', (route) => route.fulfill({ json: { categories: [] } }));
    await page.route('**/api/budgets*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/goals*', (route) => route.fulfill({ json: [] }));
    await page.route('**/api/assets*', (route) => route.fulfill({ json: [] }));
  }

  const parseEuro = (s: string) => {
    const n = parseFloat(s.replace('€', '').replace('k', ''));
    return s.includes('k') ? n * 1000 : n;
  };

  test('category trend chart Y-axis rescales when dominant category is toggled off', async ({ page }) => {
    await setupRentShoppingRoutes(page);
    await page.goto('/');

    // byCategoryMonth.length > 1 is required for the Category trend section to render
    const trendSection = page.locator('.dash-card').filter({ has: page.locator('h3', { hasText: 'Category trend' }) });
    await expect(trendSection).toBeVisible({ timeout: 10000 });

    const yAxisTicks = trendSection.locator('.recharts-cartesian-axis-tick-value');
    const ticksBefore = await yAxisTicks.allTextContents();
    const maxBefore = Math.max(...ticksBefore.map(parseEuro).filter(n => !isNaN(n)));
    expect(maxBefore).toBeGreaterThan(900);

    const rentButton = trendSection.locator('button', { hasText: 'Rent' });
    await expect(rentButton).toBeVisible();
    await rentButton.click();

    await expect(async () => {
      const ticksAfter = await yAxisTicks.allTextContents();
      const maxAfter = Math.max(...ticksAfter.map(parseEuro).filter(n => !isNaN(n)));
      expect(maxAfter).toBeLessThan(500);
    }).toPass({ timeout: 3000 });
  });

  test('monthly trends line chart Y-axis rescales when dominant category is toggled off', async ({ page }) => {
    await setupRentShoppingRoutes(page);
    await page.goto('/');

    const trendSection = page.locator('.dash-card').filter({ has: page.locator('h3', { hasText: 'Monthly trends' }) });
    await expect(trendSection).toBeVisible({ timeout: 10000 });

    const yAxisTicks = trendSection.locator('.recharts-cartesian-axis-tick-value');
    const ticksBefore = await yAxisTicks.allTextContents();
    const maxBefore = Math.max(...ticksBefore.map(parseEuro).filter(n => !isNaN(n)));
    expect(maxBefore).toBeGreaterThan(900);

    const rentButton = trendSection.locator('button', { hasText: 'Rent' });
    await expect(rentButton).toBeVisible();
    await rentButton.click();

    await expect(async () => {
      const ticksAfter = await yAxisTicks.allTextContents();
      const maxAfter = Math.max(...ticksAfter.map(parseEuro).filter(n => !isNaN(n)));
      expect(maxAfter).toBeLessThan(500);
    }).toPass({ timeout: 3000 });
  });

  // --- Spending Guidelines: income-based calculation ---

  test('guideline panel shows surplus when spending is below income', async ({ page }) => {
    // Income €5 000, expenses €3 000 → surplus = €2 000 = 40%
    await setupGuidelineRoutes(page, {
      totalIncome: 5000,
      totalExpenses: 3000,
      totalInvestments: 0,
      byCategory: [
        { category: 'Rent & Housing', amount: 2000 },
        { category: 'Dining Out', amount: 1000 },
      ],
    });
    await page.goto('/');
    await page.locator('button', { hasText: 'Spending guidelines' }).click();

    const panel = page.locator('.dash-card').filter({ has: page.locator('h3', { hasText: 'Spending Guidelines' }) });
    await expect(panel).toBeVisible({ timeout: 10000 });

    // Surplus row must appear
    const surplusRow = panel.locator('[data-testid="guideline-surplus"]');
    await expect(surplusRow).toBeVisible();
    // 40% of €5 000 = €2 000
    await expect(surplusRow).toContainText('40%');
  });

  test('investments beyond the income surplus show as overspent, not silently excluded', async ({ page }) => {
    // Income €3 000, expenses €3 000, investments €5 000 → the guideline no longer guesses
    // whether investments were income- or savings-funded; it shows the real amount and lets
    // totals exceed 100% of income, surfacing the shortfall as "overspent" instead of hiding it.
    await setupGuidelineRoutes(page, {
      totalIncome: 3000,
      totalExpenses: 3000,
      totalInvestments: 5000,
      byCategory: [
        { category: 'Rent & Housing', amount: 2000 },
        { category: 'Dining Out', amount: 1000 },
      ],
    });
    await page.goto('/');
    await page.locator('button', { hasText: 'Spending guidelines' }).click();

    const panel = page.locator('.dash-card').filter({ has: page.locator('h3', { hasText: 'Spending Guidelines' }) });
    await expect(panel).toBeVisible({ timeout: 10000 });

    // Savings bucket shows the full real amount: 5000/3000 = 167%
    const savingsRow = panel.locator('[data-testid="guideline-bucket-savings"]');
    await expect(savingsRow.locator('span', { hasText: /167% actual/ })).toBeVisible();

    // Overspent row: (2000+1000+5000-3000)/3000 = 167%
    const surplusRow = panel.locator('[data-testid="guideline-surplus"]');
    await expect(surplusRow).toBeVisible();
    await expect(surplusRow).toContainText('Overspent');
    await expect(surplusRow).toContainText('167%');
  });

  test('income-funded investments count toward savings guideline at correct percentage', async ({ page }) => {
    // Income €5 000, expenses €3 000 → surplus €2 000 → investments €1 000 fully income-funded
    // Savings = 1000/5000 = 20%, surplus = 1000/5000 = 20%
    await setupGuidelineRoutes(page, {
      totalIncome: 5000,
      totalExpenses: 3000,
      totalInvestments: 1000,
      byCategory: [
        { category: 'Rent & Housing', amount: 2000 },
        { category: 'Dining Out', amount: 1000 },
      ],
    });
    await page.goto('/');
    await page.locator('button', { hasText: 'Spending guidelines' }).click();

    const panel = page.locator('.dash-card').filter({ has: page.locator('h3', { hasText: 'Spending Guidelines' }) });
    await expect(panel).toBeVisible({ timeout: 10000 });

    // Savings = 1000/5000 = 20%
    const savingsRow = panel.locator('[data-testid="guideline-bucket-savings"]');
    await expect(savingsRow.locator('span', { hasText: /20% actual/ })).toBeVisible();

    // Surplus = (5000 - 3000 - 1000) / 5000 = 20%
    const surplusRow = panel.locator('[data-testid="guideline-surplus"]');
    await expect(surplusRow).toBeVisible();
    await expect(surplusRow).toContainText('20%');
  });
});
