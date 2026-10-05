import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

const MOCK_RULES = [
  { id: 1, label: 'Salary', merchantPattern: 'PALKKA', category: null, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, label: 'Kela', merchantPattern: 'KELA', category: 'Benefits', createdAt: '2026-01-01T00:00:00.000Z' },
];

test.describe('Income Rules', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/categories*', async (route) => {
      await route.fulfill({ json: { categories: ['Benefits', 'Shopping'] } });
    });
    await page.route('**/api/income-rules', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { label?: string; merchantPattern?: string; category?: string };
        await route.fulfill({
          json: { id: 99, label: body.label ?? '', merchantPattern: body.merchantPattern ?? null, category: body.category ?? null, createdAt: '2026-01-01T00:00:00.000Z' },
          status: 201,
        });
      } else {
        await route.fulfill({ json: MOCK_RULES });
      }
    });
  });

  test('lists existing income rules', async ({ page }) => {
    await page.goto('/settings?tab=income-rules');
    await expect(page.locator('text=PALKKA')).toBeVisible();
    const kelaRow = page.locator('tbody tr', { hasText: 'Kela' });
    await expect(kelaRow).toBeVisible();
    await expect(kelaRow).toContainText('Benefits');
  });

  test('adds a new income rule and POSTs to the API', async ({ page }) => {
    await page.goto('/settings?tab=income-rules');
    await expect(page.locator('text=PALKKA')).toBeVisible();

    await page.fill('#rule-merchant', 'OSINKO');
    await page.locator('button:has-text("Add rule")').click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=OSINKO')).toBeVisible();
  });

  test('deletes an income rule and fires a DELETE request', async ({ page }) => {
    let deletedId: string | null = null;
    await page.route(/\/api\/income-rules\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedId = route.request().url().split('/').pop() ?? null;
        await route.fulfill({ json: { success: true } });
      }
    });
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/settings?tab=income-rules');
    await expect(page.locator('text=PALKKA')).toBeVisible();
    await page.locator('button[aria-label="Delete rule Salary"]').click();
    await page.waitForLoadState('networkidle');

    expect(deletedId).toBe('1');
  });

  test('seeds default rules and POSTs to the seed endpoint', async ({ page }) => {
    let seedCalled = false;
    await page.route('**/api/income-rules/seed', async (route) => {
      seedCalled = true;
      await route.fulfill({ json: { seeded: 10 } });
    });

    await page.goto('/settings?tab=income-rules');
    await expect(page.locator('text=PALKKA')).toBeVisible();
    await page.locator('button:has-text("Seed defaults")').click();
    await page.waitForLoadState('networkidle');

    expect(seedCalled).toBe(true);
  });
});
