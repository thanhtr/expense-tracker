import { test, expect } from '@playwright/test';

const MOCK_KEYWORDS = [
  { id: 0, keyword: 'amazon', category: 'Shopping', count: 5 },
  { id: 1, keyword: 'spotify', category: 'Subscriptions', count: 3 },
  { id: 2, keyword: 'lidl', category: 'Food & Groceries', count: 1 },
];

test.describe('Keywords Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/keywords', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: MOCK_KEYWORDS });
      } else if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({ json: { id: 99, ...body, count: 1 }, status: 201 });
      }
    });
    await page.route(/\/api\/keywords\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ json: { success: true } });
      } else if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        const id = Number(route.request().url().split('/').pop());
        await route.fulfill({ json: { id, ...body } });
      }
    });
    await page.route('**/api/keywords/bootstrap', async (route) => {
      await route.fulfill({ json: { success: true, learned: 5, skipped: 2 } });
    });
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: ['Entertainment', 'Food & Groceries', 'Shopping', 'Subscriptions', 'Transport'] } });
    });
  });

  test('should navigate to keywords page from nav', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Keywords', exact: true }).click();
    await expect(page).toHaveURL(/\/keywords/);
  });

  test('should load keywords page and show heading', async ({ page }) => {
    await page.goto('/keywords');
    await expect(page.locator('h1:has-text("Keyword Rules")')).toBeVisible();
  });

  test('should display all existing keywords in table', async ({ page }) => {
    await page.goto('/keywords');
    await expect(page.locator('td:has-text("amazon")')).toBeVisible();
    await expect(page.locator('td:has-text("spotify")')).toBeVisible();
    await expect(page.locator('td:has-text("lidl")')).toBeVisible();
  });

  test('should show Matches count column', async ({ page }) => {
    await page.goto('/keywords');
    await expect(page.locator('th:has-text("Matches")')).toBeVisible();
    await expect(page.locator('td:has-text("5")')).toBeVisible();
  });

  test('should add a new keyword and show it in the table', async ({ page }) => {
    let addedBody: { keyword: string; category: string } | null = null;
    await page.route('**/api/keywords', async (route) => {
      if (route.request().method() === 'POST') {
        addedBody = route.request().postDataJSON() as { keyword: string; category: string };
        await route.fulfill({ json: { id: 99, ...addedBody, count: 1 }, status: 201 });
      } else {
        await route.fulfill({ json: MOCK_KEYWORDS });
      }
    });
    await page.goto('/keywords');
    await expect(page.locator('td:has-text("amazon")')).toBeVisible();
    await page.locator('form input[type="text"]').first().fill('hulu');
    await page.locator('form select').first().selectOption('Entertainment');
    await page.locator('button:has-text("Add Keyword")').click();
    await page.waitForLoadState('networkidle');
    expect(addedBody?.keyword).toBe('hulu');
    expect(addedBody?.category).toBe('Entertainment');
  });

  test('should delete a keyword and fire DELETE request', async ({ page }) => {
    let deletedId: string | null = null;
    await page.route(/\/api\/keywords\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedId = route.request().url().split('/').pop() ?? null;
        await route.fulfill({ json: { success: true } });
      }
    });
    await page.goto('/keywords');
    await expect(page.locator('td:has-text("amazon")')).toBeVisible();
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('button[aria-label="Delete keyword amazon"]').first().click();
    await page.waitForLoadState('networkidle');
    expect(deletedId).toBe('0');
  });

  test('should show search input and filter keywords client-side', async ({ page }) => {
    await page.goto('/keywords');
    await expect(page.locator('td:has-text("amazon")')).toBeVisible();
    await page.locator('input[placeholder*="earch"]').fill('spotify');
    await expect(page.locator('td:has-text("spotify")')).toBeVisible();
    await expect(page.locator('td:has-text("amazon")')).not.toBeVisible();
  });

  test('should call bootstrap API and show count', async ({ page }) => {
    let bootstrapCalled = false;
    await page.route('**/api/keywords/bootstrap', async (route) => {
      bootstrapCalled = true;
      await route.fulfill({ json: { success: true, learned: 5, skipped: 2 } });
    });
    await page.goto('/keywords');
    await page.locator('button:has-text("Bootstrap")').click();
    await page.waitForLoadState('networkidle');
    expect(bootstrapCalled).toBe(true);
    // Toast or status message should appear
    await expect(page.locator('text=/Bootstrapped|learned/i').first()).toBeVisible();
  });

  test('should NOT show priority up/down buttons (removed in fix/quick-wins)', async ({ page }) => {
    await page.goto('/keywords');
    await expect(page.locator('td:has-text("amazon")')).toBeVisible();
    expect(await page.locator('button:has-text("↑")').count()).toBe(0);
    expect(await page.locator('button:has-text("↓")').count()).toBe(0);
  });
});
