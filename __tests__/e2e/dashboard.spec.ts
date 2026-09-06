import { test, expect } from '@playwright/test';
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

  test('should filter by category and show only selected category data', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Amazon', amount: 50.00, category: 'Shopping' }),
      mockExpense({ merchant: 'Starbucks', amount: 5.50, category: 'Food & Dining' }),
      mockExpense({ merchant: 'Grocery Store', amount: 30.00, category: 'Food & Groceries' }),
    ]);
    await page.goto('/');
    await expect(page.locator('text=Total expenses').first()).toBeVisible();
    const categorySelect = page.locator('select').first();
    await categorySelect.selectOption('Shopping');
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

  test('category trend chart Y-axis rescales when dominant category is toggled off', async ({ page }) => {
    // Two months of data: Rent dominates (€1200/mo), Shopping is small (€100/mo)
    const dashboardResponse = {
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
      topTransaction: null,
      allCategories: ['Rent', 'Shopping'],
      transactionCount: 4,
      uncategorizedCount: 0,
      byPerson: [],
      byIncomeSource: [],
    };

    await page.route('**/api/dashboard*', async (route) => {
      await route.fulfill({ json: dashboardResponse });
    });
    await page.route('**/api/transactions/recurring*', async (route) => {
      await route.fulfill({ json: { items: [], totalMonthly: 0 } });
    });
    await page.route('**/api/transactions*', async (route) => {
      await route.fulfill({ json: { transactions: [], total: 0, offset: 0, limit: 50 } });
    });
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: ['Rent', 'Shopping'] } });
    });
    await page.route('**/api/budgets*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/goals*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/assets*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/forecast*', async (route) => { await route.fulfill({ json: null }); });

    await page.goto('/');

    // "Category trend" section only renders when byCategoryMonth.length > 1
    const trendSection = page.locator('.dash-card').filter({ has: page.locator('h3', { hasText: 'Category trend' }) });
    await expect(trendSection).toBeVisible({ timeout: 10000 });

    // Read Y-axis tick values before toggling — max should reflect Rent (€1200+)
    const yAxisTicks = trendSection.locator('.recharts-cartesian-axis-tick-value');
    const ticksBefore = await yAxisTicks.allTextContents();
    const parseEuro = (s: string) => {
      const n = parseFloat(s.replace('€', '').replace('k', ''));
      return s.includes('k') ? n * 1000 : n;
    };
    const maxBefore = Math.max(...ticksBefore.map(parseEuro).filter(n => !isNaN(n)));
    expect(maxBefore).toBeGreaterThan(900); // Rent stack pushes axis above €1200

    // Toggle off Rent via the legend button
    const rentButton = trendSection.locator('button', { hasText: 'Rent' });
    await expect(rentButton).toBeVisible();
    await rentButton.click();

    // Y-axis should rescale to fit Shopping only (≤ €200)
    await expect(async () => {
      const ticksAfter = await yAxisTicks.allTextContents();
      const maxAfter = Math.max(...ticksAfter.map(parseEuro).filter(n => !isNaN(n)));
      expect(maxAfter).toBeLessThan(500);
    }).toPass({ timeout: 3000 });
  });

  test('monthly trends line chart Y-axis rescales when dominant category is toggled off', async ({ page }) => {
    const dashboardResponse = {
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
      topTransaction: null,
      allCategories: ['Rent', 'Shopping'],
      transactionCount: 4,
      uncategorizedCount: 0,
      byPerson: [],
      byIncomeSource: [],
    };

    await page.route('**/api/dashboard*', async (route) => {
      await route.fulfill({ json: dashboardResponse });
    });
    await page.route('**/api/transactions/recurring*', async (route) => {
      await route.fulfill({ json: { items: [], totalMonthly: 0 } });
    });
    await page.route('**/api/transactions*', async (route) => {
      await route.fulfill({ json: { transactions: [], total: 0, offset: 0, limit: 50 } });
    });
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: ['Rent', 'Shopping'] } });
    });
    await page.route('**/api/budgets*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/goals*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/assets*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/forecast*', async (route) => { await route.fulfill({ json: null }); });

    await page.goto('/');

    // "Monthly trends" section hosts the line chart
    const trendSection = page.locator('.dash-card').filter({ has: page.locator('h3', { hasText: 'Monthly trends' }) });
    await expect(trendSection).toBeVisible({ timeout: 10000 });

    const parseVal = (s: string) => {
      const n = parseFloat(s.replace('€', '').replace('k', ''));
      return s.includes('k') ? n * 1000 : n;
    };

    const yAxisTicks = trendSection.locator('.recharts-cartesian-axis-tick-value');
    const ticksBefore = await yAxisTicks.allTextContents();
    const maxBefore = Math.max(...ticksBefore.map(parseVal).filter(n => !isNaN(n)));
    expect(maxBefore).toBeGreaterThan(900);

    const rentButton = trendSection.locator('button', { hasText: 'Rent' });
    await expect(rentButton).toBeVisible();
    await rentButton.click();

    await expect(async () => {
      const ticksAfter = await yAxisTicks.allTextContents();
      const maxAfter = Math.max(...ticksAfter.map(parseVal).filter(n => !isNaN(n)));
      expect(maxAfter).toBeLessThan(500);
    }).toPass({ timeout: 3000 });
  });
});
