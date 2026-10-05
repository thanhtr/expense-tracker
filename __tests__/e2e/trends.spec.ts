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

test.describe('Trends page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/dashboard*', async (route) => {
      await route.fulfill({ json: DASHBOARD_RESPONSE });
    });
  });

  test('renders the stacked chart and per-category totals table', async ({ page }) => {
    await page.goto('/trends');
    await expect(page.locator('text=Spending Trends')).toBeVisible();
    await expect(page.locator('text=Monthly spending by category')).toBeVisible();
    await expect(page.locator('table')).toBeVisible();
    const rentRow = page.locator('tbody tr', { hasText: 'Rent' });
    await expect(rentRow).toBeVisible();
    await expect(rentRow.locator('td').last()).toHaveText(/3.?600/);
  });

  test('toggling a category pill hides it from the displayed totals row', async ({ page }) => {
    await page.goto('/trends');
    await expect(page.locator('text=Monthly spending by category')).toBeVisible();

    const shoppingRow = page.locator('tr', { hasText: 'Shopping' });
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
});
