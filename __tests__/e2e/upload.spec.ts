import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

const OP_CSV = `Kirjauspäivä;Arvopäivä;Määrä EUROA;Laji;Selitys;Saaja/Maksaja;Saajan tilinumero ja pankin BIC;Viite;Viesti;Arkistointitunnus
05.04.2026;05.04.2026;-29,90;720;MAKSUPALVELU;Spotify AB;;
04.04.2026;04.04.2026;-14,50;720;MAKSUPALVELU;Netflix Inc;;`;

const AMEX_CSV = `Date,Description,Amount
2026-04-05,STARBUCKS,4.50
2026-04-04,AMAZON,32.00`;

test.describe('CSV Upload', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/upload', async (route) => {
      await route.fulfill({
        json: { imported: 2, duplicates: 0, errors: 0, total: 2, created: 2, skipped: 0 },
      });
    });
    await page.route('**/api/upload/last-import', async (route) => {
      await route.fulfill({ json: {} });
    });
  });

  test('should navigate to upload page from nav', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Upload', exact: true }).click();
    await expect(page).toHaveURL(/\/upload/);
  });

  test('should show drop zone and file input', async ({ page }) => {
    await page.goto('/upload');
    await expect(page.getByRole('button', { name: /drop csv files/i })).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });

  test('should upload OP Bank CSV and show import results', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'op-april.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(OP_CSV),
    });
    // Wait for queue item to appear with auto-detected bank
    await expect(page.locator('text=op-april.csv')).toBeVisible();
    await page.locator('button:has-text("Upload")').first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/2|imported|success/i').first()).toBeVisible();
  });

  test('should upload Amex CSV and show import results', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'amex-april.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(AMEX_CSV),
    });
    await expect(page.locator('text=amex-april.csv')).toBeVisible();
    await page.locator('button:has-text("Upload")').first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/2|imported|success/i').first()).toBeVisible();
  });

  test('should report duplicates when re-importing the same CSV', async ({ page }) => {
    await page.route('**/api/upload', async (route) => {
      await route.fulfill({
        json: { imported: 0, duplicates: 2, errors: 0, total: 2, created: 0, skipped: 2 },
      });
    });
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'op-april.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(OP_CSV),
    });
    await expect(page.locator('text=op-april.csv')).toBeVisible();
    await page.locator('button:has-text("Upload")').first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/duplicate|skipped/i').first()).toBeVisible();
  });

  test('should disable Upload button until file is selected', async ({ page }) => {
    await page.goto('/upload');
    // No files in queue — Upload button should not be present yet
    await expect(page.locator('button:has-text("Upload")')).toHaveCount(0);
  });

  test('should handle server error during upload', async ({ page }) => {
    await page.route('**/api/upload', async (route) => {
      await route.fulfill({ status: 500, json: { error: 'Internal Server Error' } });
    });
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'op-april.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(OP_CSV),
    });
    await expect(page.locator('text=op-april.csv')).toBeVisible();
    await page.locator('button:has-text("Upload")').first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/error|failed/i')).toBeVisible();
  });
});
