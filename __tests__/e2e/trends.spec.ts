import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

const DASHBOARD_RESPONSE = {
  totalExpenses: 3900,
  totalIncome: 0,
  net: -3900,
  byCategory: [
    { category: 'Rent', amount: 2400 },
    { category: 'Shopping', amount: 300 },
  ],
  byDay: [],
  refundsByDay: [],
  refundsByMonth: [],
  byAccount: {},
  byMonth: [
    { month: '2026-03', amount: 1300 },
    { month: '2026-04', amount: 1300 },
    { month: '2026-05', amount: 1300 },
  ],
  byMonthIncome: [],
  byCategoryMonth: [
    { month: '2026-03', Rent: 1200, Shopping: 100 },
    { month: '2026-04', Rent: 1200, Shopping: 100 },
    { month: '2026-05', Rent: 1200, Shopping: 100 },
  ],
  topTransactions: [],
  allCategories: ['Rent', 'Shopping'],
  transactionCount: 6,
  uncategorizedCount: 0,
  byPerson: [],
  byIncomeSource: [],
};

const PREV_YEAR_RESPONSE = {
  ...DASHBOARD_RESPONSE,
  totalExpenses: 3300,
  byMonth: [
    { month: '2025-03', amount: 1100 },
    { month: '2025-04', amount: 1100 },
    { month: '2025-05', amount: 1100 },
  ],
  byCategoryMonth: [
    { month: '2025-03', Rent: 1000, Shopping: 100 },
    { month: '2025-04', Rent: 1000, Shopping: 100 },
    { month: '2025-05', Rent: 1000, Shopping: 100 },
  ],
};

test.describe('Trends page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    let call = 0;
    await page.route('**/api/dashboard*', async (route) => {
      call += 1;
      // First call is the current 12-month window, second is the prior-year window
      // (see the Promise.all order in app/trends/page.tsx).
      await route.fulfill({ json: call === 1 ? DASHBOARD_RESPONSE : PREV_YEAR_RESPONSE });
    });
  });

  test('renders the stacked chart and per-category totals table', async ({ page }) => {
    await page.goto('/trends');
    await expect(page.locator('text=Spending Trends')).toBeVisible();
    await expect(page.locator('text=Monthly spending by category')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    const rentRow = page.locator('tbody tr', { hasText: 'Rent' });
    await expect(rentRow).toBeVisible();
    await expect(rentRow.locator('td').nth(-2)).toHaveText(/3.?600/);
  });

  test('toggling a category pill hides it from the displayed totals row', async ({ page }) => {
    await page.goto('/trends');
    await expect(page.locator('text=Monthly spending by category')).toBeVisible();

    const shoppingRow = page.locator('tbody tr', { hasText: 'Shopping' });
    await expect(shoppingRow).toBeVisible();

    await page.locator('button', { hasText: 'Shopping' }).first().click();
    await page.waitForTimeout(100);

    await expect(page.locator('tbody tr', { hasText: 'Shopping' })).toHaveCount(0);
  });

  test('shows a fallback message when there is not enough data', async ({ page }) => {
    await page.route('**/api/dashboard*', async (route) => {
      await route.fulfill({ json: { ...DASHBOARD_RESPONSE, byCategoryMonth: [{ month: '2026-05', Rent: 1200 }] } });
    });
    await page.goto('/trends');
    await expect(page.locator('text=Not enough data for trends')).toBeVisible();
  });

  test('shows a "vs last year" column with the correct percentage change', async ({ page }) => {
    await page.goto('/trends');
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('th', { hasText: 'vs last year' })).toBeVisible();

    // Rent: 3600 this year vs 3000 last year → +20%
    const rentRow = page.locator('tbody tr', { hasText: 'Rent' });
    await expect(rentRow).toContainText('+20%');
  });

  test('toggling "Last year" adds an overlay line to the chart legend', async ({ page }) => {
    await page.goto('/trends');
    const yoyCheckbox = page.locator('label:has-text("Last year") input[type=checkbox]');
    await expect(yoyCheckbox).toBeEnabled();
    await expect(page.locator('.recharts-legend-wrapper')).not.toContainText('Last year');

    await yoyCheckbox.check();
    await expect(page.locator('.recharts-legend-wrapper')).toContainText('Last year');
  });

  test('toggling "3-mo avg" adds a moving-average line to the chart legend', async ({ page }) => {
    await page.goto('/trends');
    const avgCheckbox = page.locator('label:has-text("3-mo avg") input[type=checkbox]');
    await expect(page.locator('.recharts-legend-wrapper')).not.toContainText('3-mo avg');

    await avgCheckbox.check();
    await expect(page.locator('.recharts-legend-wrapper')).toContainText('3-mo avg');
  });
});
