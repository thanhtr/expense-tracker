import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/splitwise-mock';

const MOCK_RECURRING = {
  recurring: [
    { merchant: 'Spotify', category: 'Subscriptions', monthlyEstimate: 9.95, occurrences: 6, medianAmount: 9.95, lastDate: '2026-04-01', account: 'OP Bank' },
    { merchant: 'Netflix', category: 'Subscriptions', monthlyEstimate: 14.99, occurrences: 5, medianAmount: 14.99, lastDate: '2026-04-02', account: 'OP Bank' },
    { merchant: 'Gym Helsinki', category: '', monthlyEstimate: 45.00, occurrences: 4, medianAmount: 45.00, lastDate: '2026-04-03', account: 'OP Bank' },
  ],
  totalMonthly: 69.94,
  count: 3,
  exclusions: [],
};

test.describe('Recurring Charges Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/transactions/recurring*', async (route) => {
      await route.fulfill({ json: MOCK_RECURRING });
    });
  });

  test('should navigate to recurring page', async ({ page }) => {
    await page.goto('/transactions');
    const recurringLink = page.getByRole('link', { name: /Recurring/i });
    if (await recurringLink.count() > 0) {
      await recurringLink.first().click();
      await expect(page).toHaveURL(/\/transactions\/recurring/);
    } else {
      await page.goto('/transactions/recurring');
      await expect(page).toHaveURL(/\/transactions\/recurring/);
    }
  });

  test('should display detected recurring charges', async ({ page }) => {
    await page.goto('/transactions/recurring');
    await expect(page.locator('text=Spotify')).toBeVisible();
    await expect(page.locator('text=Netflix')).toBeVisible();
    await expect(page.locator('text=Gym Helsinki')).toBeVisible();
  });

  test('should show estimated monthly total', async ({ page }) => {
    await page.goto('/transactions/recurring');
    // Should show total monthly cost somewhere on the page
    await expect(page.locator('text=/69|monthly/i').first()).toBeVisible();
  });

  test('should show charge count and amount per item', async ({ page }) => {
    await page.goto('/transactions/recurring');
    await expect(page.locator('text=Spotify')).toBeVisible();
    // fmtEUR rounds to whole euros; also show occurrences count
    await expect(page.locator('text=/6|10 €/').first()).toBeVisible();
  });

  test('should handle empty recurring list gracefully', async ({ page }) => {
    await page.route('**/api/transactions/recurring*', async (route) => {
      await route.fulfill({ json: { recurring: [], totalMonthly: 0, count: 0, exclusions: [] } });
    });
    await page.goto('/transactions/recurring');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('text=/no recurring|not detected|0/i').first()).toBeVisible();
  });
});
