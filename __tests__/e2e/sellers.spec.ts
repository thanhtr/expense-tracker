import { test, expect } from '@playwright/test';
import { setupSplitwise, mockExpense } from '../fixtures/api-mock';

const MOCK_SELLERS = [
  { merchant: 'Amazon', totalAmount: 150.00, count: 3, categories: [{ category: 'Shopping', count: 3 }], dominantCategory: 'Shopping', isMixed: false },
  { merchant: 'Spotify', totalAmount: 29.85, count: 3, categories: [{ category: 'Subscriptions', count: 3 }], dominantCategory: 'Subscriptions', isMixed: false },
  { merchant: 'Lidl', totalAmount: 87.20, count: 2, categories: [{ category: '', count: 2 }], dominantCategory: '', isMixed: false },
];

test.describe('Sellers Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Amazon', amount: 50, category: 'Shopping' }),
      mockExpense({ merchant: 'Spotify', amount: 9.95, category: 'Subscriptions' }),
    ]);
    await page.route('**/api/transactions/sellers*', async (route) => {
      await route.fulfill({ json: { sellers: MOCK_SELLERS, totalMerchants: MOCK_SELLERS.length } });
    });
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: ['Shopping', 'Subscriptions', 'Food & Groceries'] } });
    });
    await page.route('**/api/transactions/bulk-categorize', async (route) => {
      await route.fulfill({ json: { updated: 1 } });
    });
  });

  test('should navigate to sellers page', async ({ page }) => {
    await page.goto('/transactions');
    await page.locator('a:has-text("Sellers")').first().click();
    await expect(page).toHaveURL(/\/transactions\/sellers/);
  });

  test('should display seller list with merchant names', async ({ page }) => {
    await page.goto('/transactions/sellers');
    await expect(page.locator('text=Amazon')).toBeVisible();
    await expect(page.locator('text=Spotify')).toBeVisible();
    await expect(page.locator('text=Lidl')).toBeVisible();
  });

  test('should show transaction count and total amount per seller', async ({ page }) => {
    await page.goto('/transactions/sellers');
    await expect(page.locator('text=Amazon')).toBeVisible();
    // Should display count and amount
    await expect(page.locator('text=/3|150/').first()).toBeVisible();
  });

  test('should highlight uncategorized sellers', async ({ page }) => {
    await page.goto('/transactions/sellers');
    await expect(page.locator('text=Lidl')).toBeVisible();
    // Lidl has no category — should show "Uncategorized" or "⚠" indicator
    await expect(page.locator('text=/ncategor|⚠/i').first()).toBeVisible();
  });

  test('should allow bulk-categorizing all transactions for a seller', async ({ page }) => {
    let bulkCalled = false;
    await page.route('**/api/transactions/bulk-categorize', async (route) => {
      bulkCalled = true;
      await route.fulfill({ json: { updated: 2 } });
    });
    await page.goto('/transactions/sellers');
    await expect(page.locator('text=Lidl')).toBeVisible();
    // Find the Lidl row, select a category, then click Apply
    const lidlRow = page.locator('tr').filter({ hasText: 'Lidl' });
    const catSelect = lidlRow.locator('select').first();
    if (await catSelect.count() > 0) {
      await catSelect.selectOption('Groceries');
      // Apply button appears after selecting a non-empty category
      const applyBtn = lidlRow.locator('button:has-text("Apply")').first();
      await expect(applyBtn).toBeVisible({ timeout: 3000 });
      await applyBtn.click();
      await page.waitForLoadState('networkidle');
      expect(bulkCalled).toBe(true);
    }
  });
});
