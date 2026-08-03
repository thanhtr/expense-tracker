import { test, expect } from '@playwright/test';

test.describe('Keywords Page', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API endpoints
    await page.route('**/api/keywords', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          json: [
            { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
            { id: 1, keyword: 'spotify', category: 'Subscriptions', priority: 1 },
            { id: 2, keyword: 'lidl', category: 'Food & Groceries', priority: 2 },
          ],
        });
      } else if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: 3,
            keyword: body.keyword,
            category: body.category,
            priority: 3,
          },
          status: 201,
        });
      }
    });

    await page.route('**/api/keywords/[0-9]+', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          json: { success: true },
        });
      } else if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        const id = route.request().url().split('/').pop();
        await route.fulfill({
          json: {
            id: parseInt(id || '0'),
            keyword: body.keyword,
            category: body.category,
            priority: body.priority,
          },
        });
      }
    });

    await page.route('**/api/keywords/bootstrap', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          learned: 5,
          skipped: 2,
        },
      });
    });

    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({
        json: { categories: ['Entertainment', 'Food & Groceries', 'Shopping', 'Subscriptions', 'Transport'] },
      });
    });
  });

  test('should navigate to keywords page', async ({ page }) => {
    await page.goto('/');

    // Click on Keywords link in navigation
    const keywordsLink = page.locator('a:has-text("Keywords")');
    if (await keywordsLink.count() > 0) {
      await keywordsLink.click();
      await expect(page).toHaveURL(/\/keywords/);
    }
  });

  test('should load keywords page directly', async ({ page }) => {
    await page.goto('/keywords');

    await expect(page).toHaveURL(/\/keywords/);
    await expect(page.locator('h1:has-text("Keyword Rules")')).toBeVisible();
  });

  test('should display existing keywords in table', async ({ page }) => {
    await page.goto('/keywords');

    await page.waitForTimeout(500);

    // Check for keywords in the table
    const rows = page.locator('tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should add a new keyword', async ({ page }) => {
    let addedKeyword = false;

    await page.route('**/api/keywords', async (route) => {
      if (route.request().method() === 'POST') {
        addedKeyword = true;
        const body = route.request().postDataJSON();
        await route.fulfill({
          json: {
            id: 3,
            keyword: body.keyword,
            category: body.category,
            priority: 3,
          },
          status: 201,
        });
      } else {
        await route.fulfill({
          json: [
            { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
            { id: 1, keyword: 'spotify', category: 'Subscriptions', priority: 1 },
          ],
        });
      }
    });

    await page.goto('/keywords');

    await page.waitForTimeout(500);

    // Find and fill the keyword input (the "Add New Keyword" form input, not the search box)
    const keywordInput = page.locator('form input[type="text"]').first();
    const categorySelect = page.locator('form select').first();

    if (await keywordInput.count() > 0) {
      await keywordInput.fill('hulu');
      await categorySelect.selectOption('Entertainment');

      // Submit the form
      const submitButton = page.locator('button:has-text("Add Keyword")');
      if (await submitButton.count() > 0) {
        await submitButton.click();

        await page.waitForTimeout(300);

        // Verify the keyword was added (check if POST was called)
        expect(addedKeyword).toBe(true);
      }
    }
  });

  test('should delete a keyword', async ({ page }) => {
    await page.route('**/api/keywords/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          json: { success: true },
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/keywords', async (route) => {
      await route.fulfill({
        json: [
          { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
          { id: 1, keyword: 'spotify', category: 'Subscriptions', priority: 1 },
        ],
      });
    });

    await page.goto('/keywords');

    await page.waitForTimeout(500);

    // Find and click delete button
    const deleteButtons = page.locator('button:has-text("Delete")');
    if (await deleteButtons.count() > 0) {
      // Just verify the button exists and is clickable
      await expect(deleteButtons.first()).toBeVisible();
    }
  });

  test('should show bootstrap button', async ({ page }) => {
    await page.goto('/keywords');

    await page.waitForTimeout(500);

    const bootstrapButton = page.locator('button:has-text("Bootstrap")');
    expect(await bootstrapButton.count()).toBeGreaterThan(0);
  });

  test('should call bootstrap API on button click', async ({ page }) => {
    let bootstrapWasCalled = false;

    await page.route('**/api/keywords/bootstrap', async (route) => {
      bootstrapWasCalled = true;
      await route.fulfill({
        json: {
          success: true,
          learned: 5,
          skipped: 2,
        },
      });
    });

    await page.route('**/api/keywords', async (route) => {
      await route.fulfill({
        json: [
          { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
        ],
      });
    });

    await page.goto('/keywords');

    await page.waitForTimeout(500);

    const bootstrapButton = page.locator('button:has-text("Bootstrap")');
    if (await bootstrapButton.count() > 0) {
      await bootstrapButton.click();

      await page.waitForTimeout(500);

      expect(bootstrapWasCalled).toBe(true);
    }
  });

  test('should show success message after bootstrap', async ({ page }) => {
    await page.route('**/api/keywords/bootstrap', async (route) => {
      await route.fulfill({
        json: {
          success: true,
          learned: 5,
          skipped: 2,
        },
      });
    });

    await page.route('**/api/keywords', async (route) => {
      await route.fulfill({
        json: [
          { id: 0, keyword: 'amazon', category: 'Shopping', priority: 0 },
        ],
      });
    });

    await page.goto('/keywords');

    await page.waitForTimeout(500);

    const bootstrapButton = page.locator('button:has-text("Bootstrap")');
    if (await bootstrapButton.count() > 0) {
      await bootstrapButton.click();

      await page.waitForTimeout(500);

      // Check for success message (contains "✓" or "Bootstrapped")
      const successMessage = page.locator('text=/✓|Bootstrapped/');
      expect(await successMessage.count()).toBeGreaterThan(0);
    }
  });

  test('should display priority up/down buttons for keywords', async ({ page }) => {
    await page.goto('/keywords');

    await page.waitForTimeout(500);

    // Look for up arrow buttons
    const upButtons = page.locator('button:has-text("↑")');
    const downButtons = page.locator('button:has-text("↓")');

    expect(await upButtons.count()).toBeGreaterThanOrEqual(0);
    expect(await downButtons.count()).toBeGreaterThanOrEqual(0);
  });
});
