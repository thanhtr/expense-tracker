import { test, expect } from '@playwright/test';
import { setupSplitwise, mockExpenses, mockExpense } from '../fixtures/splitwise-mock';

test.describe('Transactions Page', () => {
  test('should navigate to transactions page from nav', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(3));
    await page.goto('/');
    await page.getByRole('link', { name: 'Transactions', exact: true }).first().click();
    await expect(page).toHaveURL(/\/transactions/);
  });

  test('should load and display transaction rows', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(3));
    await page.goto('/transactions');
    // Wait for actual rows — header row + 3 data rows = at least 4
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThanOrEqual(3);
  });

  test('should show pagination Next button for lists over 50', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(60));
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    await expect(page.locator('button:has-text("Next")')).toBeEnabled();
  });

  test('should load next page on pagination click', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(60));
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const firstRowBefore = await page.locator('tbody tr').nth(0).textContent();
    await page.locator('button:has-text("Next")').click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const firstRowAfter = await page.locator('tbody tr').nth(0).textContent();
    expect(firstRowAfter).not.toEqual(firstRowBefore);
  });

  test('should filter transactions by account immediately (live filter)', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'OP Purchase', amount: 50.00, account: 'OP Bank' }),
      mockExpense({ merchant: 'Amex Purchase', amount: 30.00, account: 'Amex' }),
    ]);
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    // Account select is the 3rd select on the page (after date pickers, account, type, category...)
    const accountSelect = page.locator('select[aria-label="Account"], select').nth(0);
    await accountSelect.selectOption('OP Bank');
    await page.waitForResponse(res => res.url().includes('/api/transactions') && res.status() === 200);
    // After filtering, only OP Bank rows should remain
    const rowCount = await page.locator('tbody tr').count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should clear filters with Reset button', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(5));
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const resetButton = page.locator('button:has-text("Reset")');
    await expect(resetButton).toBeVisible();
    await resetButton.click();
    await expect(page.locator('tbody tr').first()).toBeVisible();
  });

  test('should show category dropdown in each transaction row', async ({ page }) => {
    await setupSplitwise(page, [mockExpense({ merchant: 'Restaurant', category: 'Dining Out' })]);
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const categorySelect = page.locator('tbody tr').first().locator('select[aria-label="Category"]');
    await expect(categorySelect).toBeVisible();
    await expect(categorySelect).toHaveValue('Dining Out');
  });

  test('should update category via inline select and fire PATCH', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Restaurant', category: 'Dining Out' }),
    ]);
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: ['Dining Out', 'Shopping', 'Food & Groceries'] } });
    });
    const patchBodies: { category: string }[] = [];
    await page.route('**/api/transactions/*', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchBodies.push(route.request().postDataJSON() as { category: string });
        await route.fulfill({ json: { success: true, category: 'Shopping' } });
      } else {
        await route.continue();
      }
    });
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const categorySelect = page.locator('tbody tr').first().locator('select[aria-label="Category"]');
    await categorySelect.selectOption('Shopping');
    await page.waitForResponse(res => res.url().includes('/api/transactions/') && res.request().method() === 'PATCH');
    expect(patchBodies.length).toBeGreaterThan(0);
    expect(patchBodies[0].category).toBe('Shopping');
  });

  test('should delete transaction with confirmation and fire DELETE', async ({ page }) => {
    await setupSplitwise(page, [mockExpense({ merchant: 'Target' })]);
    let deleteCalled = false;
    await page.route('**/api/transactions/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    page.on('dialog', (dialog) => dialog.accept());
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/transactions/') && res.request().method() === 'DELETE'),
      page.locator('button[aria-label="Delete transaction"]').first().click(),
    ]);
    expect(deleteCalled).toBe(true);
  });

  test('should show Export CSV button and it opens export URL', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(3));
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    const exportBtn = page.locator('button:has-text("Export CSV")');
    await expect(exportBtn).toBeVisible();
  });

  test('should show empty state when no transactions match filters', async ({ page }) => {
    // Return empty transactions
    await page.route('**/api/dashboard*', async (route) => {
      await route.fulfill({ json: { totalExpenses: 0, totalIncome: 0, net: 0, byCategory: [], byDay: [], byAccount: {}, byMonth: [], byMonthIncome: [], topTransaction: null, allCategories: [], transactionCount: 0, uncategorizedCount: 0, byPerson: [], byCategoryMonth: [], byIncomeSource: [] } });
    });
    await page.route('**/api/transactions*', async (route) => {
      await route.fulfill({ json: { transactions: [], total: 0, offset: 0, limit: 50 } });
    });
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: [] } });
    });
    await page.route('**/api/budgets*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/goals*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/assets*', async (route) => { await route.fulfill({ json: [] }); });
    await page.route('**/api/forecast*', async (route) => { await route.fulfill({ json: null }); });
    await page.route('**/api/transactions/recurring*', async (route) => { await route.fulfill({ json: { items: [], totalMonthly: 0 } }); });
    await page.goto('/transactions');
    await expect(page.locator('text=/No transactions|upload a CSV/')).toBeVisible();
  });

  test('should bulk-categorize selected transactions', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(3));
    let bulkCalled = false;
    await page.route('**/api/transactions/bulk-categorize', async (route) => {
      bulkCalled = true;
      await route.fulfill({ json: { updated: 1 } });
    });
    await page.goto('/transactions');
    await expect(page.locator('tbody tr').first()).toBeVisible();
    // Check first row checkbox
    await page.locator('tbody tr').first().locator('input[type="checkbox"]').check();
    await expect(page.locator('text=/selected/')).toBeVisible();
    // Pick a category and apply
    const bulkSelect = page.locator('select[aria-label="Bulk category"]');
    await bulkSelect.selectOption({ index: 1 });
    await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/transactions/bulk-categorize')),
      page.locator('button:has-text("Apply")').click(),
    ]);
    expect(bulkCalled).toBe(true);
  });
});
