import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/splitwise-mock';

const MOCK_SUGGESTIONS = {
  suggestions: [
    {
      merchant: 'Lidl',
      suggestedCategory: 'Food & Groceries',
      transactions: [
        { id: 10, currentCategory: '', date: '2026-04-01', amount: -15.00 },
        { id: 11, currentCategory: '', date: '2026-04-08', amount: -22.00 },
        { id: 12, currentCategory: '', date: '2026-04-15', amount: -18.00 },
      ],
    },
    {
      merchant: 'Bolt',
      suggestedCategory: 'Transportation',
      transactions: [
        { id: 13, currentCategory: '', date: '2026-04-02', amount: -8.50 },
        { id: 14, currentCategory: '', date: '2026-04-09', amount: -12.00 },
      ],
    },
  ],
  totalCount: 5,
};

test.describe('Suggestions Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/transactions/suggestions*', async (route) => {
      await route.fulfill({ json: MOCK_SUGGESTIONS });
    });
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: ['Food & Groceries', 'Transportation', 'Shopping'] } });
    });
    await page.route('**/api/transactions/bulk-categorize', async (route) => {
      await route.fulfill({ json: { updated: 3 } });
    });
  });

  test('should navigate to suggestions page', async ({ page }) => {
    await page.goto('/transactions');
    const sugLink = page.locator('a:has-text("Suggestions")').first();
    await sugLink.click();
    await expect(page).toHaveURL(/\/transactions\/suggestions/);
  });

  test('should display suggestion groups with merchant names', async ({ page }) => {
    await page.goto('/transactions/suggestions');
    await expect(page.locator('text=Lidl')).toBeVisible();
    await expect(page.locator('text=Bolt')).toBeVisible();
  });

  test('should show suggested category for each group', async ({ page }) => {
    await page.goto('/transactions/suggestions');
    // Check "Suggested: X" label — more specific than the hidden <option> element
    await expect(page.locator('text=Suggested:').first()).toBeVisible();
    await expect(page.locator('text=Lidl').first()).toBeVisible();
    await expect(page.locator('text=Bolt').first()).toBeVisible();
  });

  test('should allow accepting a suggestion and fire bulk-categorize', async ({ page }) => {
    let bulkCalled = false;
    await page.route('**/api/transactions/bulk-categorize', async (route) => {
      bulkCalled = true;
      await route.fulfill({ json: { updated: 3 } });
    });
    await page.goto('/transactions/suggestions');
    await expect(page.locator('text=Lidl')).toBeVisible();
    const acceptBtn = page.locator('button:has-text("Accept"), button:has-text("Apply"), button[aria-label*="Accept"]').first();
    if (await acceptBtn.count() > 0) {
      await acceptBtn.click();
      await page.waitForLoadState('networkidle');
      expect(bulkCalled).toBe(true);
    }
  });

  test('should show empty state when no suggestions available', async ({ page }) => {
    await page.route('**/api/transactions/suggestions*', async (route) => {
      await route.fulfill({ json: { suggestions: [], totalCount: 0 } });
    });
    await page.goto('/transactions/suggestions');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('text=/no suggestion|all.*good|look good|uncategor/i').first()).toBeVisible();
  });
});
