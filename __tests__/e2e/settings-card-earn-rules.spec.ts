import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

const MOCK_RULES = [
  { id: 1, account: 'Amex', merchantPattern: 'BRITISH AIRWAYS', classification: 'bonus', note: '', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, account: 'Finnair Visa', merchantPattern: 'NORDEA', classification: 'excluded', note: 'bank transfer', createdAt: '2026-01-01T00:00:00.000Z' },
];

test.describe('Card Earn Rules', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/card-earn-rules', async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as { account?: string; merchantPattern?: string; classification?: string; note?: string };
        await route.fulfill({
          json: {
            id: 99,
            account: body.account,
            merchantPattern: body.merchantPattern,
            classification: body.classification,
            note: body.note ?? '',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          status: 201,
        });
      } else {
        await route.fulfill({ json: MOCK_RULES });
      }
    });
  });

  test('lists existing card earn rules', async ({ page }) => {
    await page.goto('/settings?tab=card-earn-rules');
    const baRow = page.locator('tbody tr', { hasText: 'BRITISH AIRWAYS' });
    await expect(baRow).toBeVisible();
    const nordeaRow = page.locator('tbody tr', { hasText: 'NORDEA' });
    await expect(nordeaRow).toBeVisible();
    await expect(nordeaRow).toContainText('excluded');
  });

  test('adds a new card earn rule and POSTs to the API', async ({ page }) => {
    await page.goto('/settings?tab=card-earn-rules');
    await expect(page.locator('tbody tr', { hasText: 'BRITISH AIRWAYS' })).toBeVisible();

    await page.fill('#rule-merchant', 'HILTON');
    await page.locator('button:has-text("Add rule")').click();
    await page.waitForLoadState('networkidle');

    await expect(page.locator('tbody tr', { hasText: 'HILTON' })).toBeVisible();
  });

  test('deletes a card earn rule and fires a DELETE request', async ({ page }) => {
    let deletedId: string | null = null;
    await page.route(/\/api\/card-earn-rules\/\d+/, async (route) => {
      if (route.request().method() === 'DELETE') {
        deletedId = route.request().url().split('/').pop() ?? null;
        await route.fulfill({ json: { success: true } });
      }
    });
    page.on('dialog', dialog => dialog.accept());

    await page.goto('/settings?tab=card-earn-rules');
    await expect(page.locator('tbody tr', { hasText: 'BRITISH AIRWAYS' })).toBeVisible();
    await page.locator('button[aria-label="Delete rule BRITISH AIRWAYS"]').click();
    await page.waitForLoadState('networkidle');

    expect(deletedId).toBe('1');
  });
});
