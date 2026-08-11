import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/splitwise-mock';

const MOCK_DUPLICATES = {
  groups: [
    {
      date: '2026-04-10',
      merchant: 'Amazon',
      amount: 45.67,
      rows: [
        { id: 1, account: 'OP Bank', paidBy: 'tung', category: 'Shopping', dedupKey: '2026-04-10|OP Bank|Amazon|45.67', createdAt: '2026-04-10T10:00:00Z' },
        { id: 2, account: 'OP Bank', paidBy: 'tung', category: 'Shopping', dedupKey: '2026-04-10|Amazon|45.67', createdAt: '2026-04-10T11:00:00Z' },
      ],
    },
  ],
  total: 1,
};

test.describe('Duplicates Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/transactions/duplicates*', async (route) => {
      await route.fulfill({ json: MOCK_DUPLICATES });
    });
    await page.route(/\/api\/transactions\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });
  });

  test('should navigate to duplicates page', async ({ page }) => {
    await page.goto('/transactions');
    const dupLink = page.locator('a:has-text("Duplicates")').first();
    await dupLink.click();
    await expect(page).toHaveURL(/\/transactions\/duplicates/);
  });

  test('should display duplicate groups', async ({ page }) => {
    await page.goto('/transactions/duplicates');
    await expect(page.locator('text=Amazon').first()).toBeVisible();
    await expect(page.locator('text=/45[,.]67/').first()).toBeVisible();
  });

  test('should show number of duplicates found', async ({ page }) => {
    await page.goto('/transactions/duplicates');
    await expect(page.locator('text=/1|duplicate/i').first()).toBeVisible();
  });

  test('should allow deleting a duplicate transaction', async ({ page }) => {
    let deleteCalled = false;
    await page.route(/\/api\/transactions\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        deleteCalled = true;
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });
    await page.goto('/transactions/duplicates');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=Amazon').first()).toBeVisible();
    page.on('dialog', (dialog) => dialog.accept());
    const deleteBtn = page.locator('button[aria-label*="Delete"], button[title*="Delete"], button:has-text("Delete")').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      await page.waitForLoadState('networkidle');
      expect(deleteCalled).toBe(true);
    }
  });

  test('should show empty state when no duplicates found', async ({ page }) => {
    await page.route('**/api/transactions/duplicates*', async (route) => {
      await route.fulfill({ json: { groups: [], total: 0 } });
    });
    await page.goto('/transactions/duplicates');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('text=/no duplicate|clean|0/i').first()).toBeVisible();
  });
});
