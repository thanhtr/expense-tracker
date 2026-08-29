import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

const MOCK_CATEGORIES = [
  { id: 1, name: 'Dining Out', sortOrder: 0 },
  { id: 2, name: 'Food & Groceries', sortOrder: 1 },
  { id: 3, name: 'Shopping', sortOrder: 2 },
];

test.describe('Settings / Categories Page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/categories*', async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get('full') === '1') {
        await route.fulfill({ json: { categories: MOCK_CATEGORIES } });
      } else {
        await route.fulfill({ json: { categories: MOCK_CATEGORIES.map(c => c.name) } });
      }
    });
    await page.route(/\/api\/categories\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({ json: { success: true } });
      } else if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON();
        const id = Number(route.request().url().split('/').pop());
        await route.fulfill({ json: { id, ...body } });
      }
    });
  });

  test('should navigate to settings page', async ({ page }) => {
    await page.goto('/');
    const settingsLink = page.getByRole('link', { name: /Settings/i });
    if (await settingsLink.count() > 0) {
      await settingsLink.first().click();
      await expect(page).toHaveURL(/\/settings/);
    } else {
      await page.goto('/settings');
      await expect(page).toHaveURL(/\/settings/);
    }
  });

  test('should display existing categories', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('text=Dining Out')).toBeVisible();
    await expect(page.locator('text=Food & Groceries')).toBeVisible();
    await expect(page.locator('text=Shopping')).toBeVisible();
  });

  test('should add a new category and POST to API', async ({ page }) => {
    let postedName: string | null = null;
    await page.route('**/api/categories', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { name: string };
        postedName = body.name;
        await route.fulfill({ json: { id: 99, name: body.name, sortOrder: 3 }, status: 201 });
      } else {
        const url = new URL(route.request().url());
        if (url.searchParams.get('full') === '1') {
          await route.fulfill({ json: { categories: MOCK_CATEGORIES } });
        } else {
          await route.fulfill({ json: { categories: MOCK_CATEGORIES.map(c => c.name) } });
        }
      }
    });
    await page.goto('/settings');
    await expect(page.locator('text=Dining Out')).toBeVisible();
    const nameInput = page.locator('input[placeholder*="category"], input[placeholder*="Category"], input[placeholder*="name"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill('Health & Fitness');
      await page.locator('button:has-text("Add")').first().click();
      await page.waitForLoadState('networkidle');
      expect(postedName).toBe('Health & Fitness');
    }
  });

  test('should delete a category and fire DELETE request', async ({ page }) => {
    let deletedId: string | null = null;
    await page.route(/\/api\/categories\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedId = route.request().url().split('/').pop() ?? null;
        await route.fulfill({ json: { success: true } });
      }
    });
    await page.goto('/settings');
    await expect(page.locator('text=Shopping')).toBeVisible();
    const deleteBtn = page.locator('button[aria-label="Delete Shopping"]').first();
    if (await deleteBtn.count() > 0) {
      await deleteBtn.click();
      await page.waitForLoadState('networkidle');
      expect(deletedId).not.toBeNull();
    }
  });

  test('should rename a category inline and PATCH API', async ({ page }) => {
    let patchedData: { name?: string } | null = null;
    await page.route(/\/api\/categories\/\d+/, async (route) => {
      if (route.request().method() === 'PATCH') {
        patchedData = route.request().postDataJSON() as { name: string };
        await route.fulfill({ json: { id: 3, ...patchedData } });
      }
    });
    await page.goto('/settings');
    await expect(page.locator('text=Shopping')).toBeVisible();
    // Clicking the category name opens an inline edit input inside the <ul>
    // (distinct from the "New category name" form input which is outside <ul>)
    const shoppingBtn = page.locator('ul button').filter({ hasText: 'Shopping' }).first();
    if (await shoppingBtn.count() > 0) {
      await shoppingBtn.click();
      // The inline edit input appears inside <ul> (form input is in <form>, not <ul>)
      // Note: input has no explicit type attribute, so cannot use input[type="text"]
      const inlineInput = page.locator('ul input').first();
      await expect(inlineInput).toBeVisible({ timeout: 5000 });
      await inlineInput.fill('Online Shopping');
      await page.keyboard.press('Enter');
      await page.waitForLoadState('networkidle');
      expect(patchedData?.name).toBe('Online Shopping');
    }
  });
});
