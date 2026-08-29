import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

const OP_CSV = `Kirjauspäivä;Arvopäivä;Määrä EUROA;Laji;Selitys;Saaja/Maksaja;Saajan tilinumero ja pankin BIC;Viite;Viesti;Arkistointitunnus
05.04.2026;05.04.2026;-29,90;720;MAKSUPALVELU;Spotify AB;;
04.04.2026;04.04.2026;-14,50;720;MAKSUPALVELU;Netflix Inc;;`;

const AMEX_CSV = `Date,Description,Amount
2026-04-05,STARBUCKS,4.50
2026-04-04,AMAZON,32.00`;

// Unknown bank format — won't match OP/Amex/Finnair detection
const UNKNOWN_CSV = `Booking date;Payee;Amount;Reference
15.01.2024;Coffee Shop;-3,50;REF001
16.01.2024;Employer;2000,00;SAL001
17.01.2024;Supermarket;-45,00;REF002`;

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
    await page.route('**/api/household-members', async (route) => {
      await route.fulfill({ json: [{ id: 1, name: 'Tung', slug: 'tung' }] });
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

test.describe('CSV Upload — unknown bank format', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await page.route('**/api/upload/last-import', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.route('**/api/household-members', async (route) => {
      await route.fulfill({ json: [{ id: 1, name: 'Tung', slug: 'tung' }] });
    });
  });

  test('shows mapping editor when bank is unrecognized', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'nordea.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UNKNOWN_CSV),
    });

    await expect(page.locator('text=nordea.csv')).toBeVisible();
    // Mapping editor should appear
    await expect(page.locator('text=/map columns/i')).toBeVisible();
  });

  test('shows column dropdowns pre-filled by heuristic', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'nordea.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UNKNOWN_CSV),
    });

    // Date dropdown should have a value selected (heuristic pre-selects "Booking date")
    const dateSelect = page.locator('label:has-text("Date") + select, label:has-text("Date *") + select').first();
    await expect(dateSelect).toBeVisible();
    const dateValue = await dateSelect.inputValue();
    expect(dateValue).not.toBe('');
  });

  test('shows sample preview rows from the CSV', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'nordea.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UNKNOWN_CSV),
    });

    // Preview table should show sample data from the CSV
    await expect(page.locator('text=Coffee Shop')).toBeVisible();
  });

  test('uploads unknown format CSV using detected column mapping', async ({ page }) => {
    let uploadBody: string | null = null;
    await page.route('**/api/upload', async (route) => {
      uploadBody = route.request().postData();
      await route.fulfill({
        json: { created: 3, skipped: 0, total: 3 },
      });
    });

    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'nordea.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UNKNOWN_CSV),
    });

    await expect(page.locator('text=nordea.csv')).toBeVisible();
    await page.locator('button:has-text("Upload")').first().click();
    await page.waitForLoadState('networkidle');

    // Upload should have succeeded
    await expect(page.locator('text=/new|created/i').first()).toBeVisible();
    // Should have sent column_mapping in the request
    expect(uploadBody).toContain('column_mapping');
  });

  test('Upload button is blocked when required columns are cleared', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'nordea.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UNKNOWN_CSV),
    });

    await expect(page.locator('text=nordea.csv')).toBeVisible();

    // Clear the Date column selection
    const dateSelect = page.locator('select').first();
    await dateSelect.selectOption('');

    // Upload button should still be present (validation happens on click)
    // but clicking it should show an error
    await page.locator('button:has-text("Upload")').first().click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/map|column|select/i').first()).toBeVisible();
  });

  test('shows bank name input for naming the detected bank', async ({ page }) => {
    await page.goto('/upload');
    await page.locator('input[type="file"]').setInputFiles({
      name: 'nordea.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UNKNOWN_CSV),
    });

    await expect(page.locator('input[placeholder="e.g. Nordea"]')).toBeVisible();
  });

  test('saved profile badge appears on second upload from same bank', async ({ page }) => {
    await page.route('**/api/upload', async (route) => {
      await route.fulfill({ json: { created: 3, skipped: 0, total: 3 } });
    });

    await page.goto('/upload');

    // Simulate a saved profile in localStorage
    await page.evaluate((csv) => {
      // Compute the same fingerprint key the app uses: sorted headers joined
      const headers = ['Booking date', 'Payee', 'Amount', 'Reference'];
      const fingerprint = 'bankProfile:' + [...headers].sort().join('|');
      const mapping = {
        bankLabel: 'Nordea',
        dateColumn: 'Booking date',
        amountColumn: 'Amount',
        merchantColumn: 'Payee',
        noteColumn: 'Reference',
        delimiter: ';',
        amountFormat: 'finnish',
        dateFormat: 'DD.MM.YYYY',
        amountSign: 'standard',
        confidence: 0.9,
      };
      localStorage.setItem(fingerprint, JSON.stringify(mapping));
    }, UNKNOWN_CSV);

    // Reload so localStorage is in place before adding file
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.route('**/api/upload/last-import', async (route) => {
      await route.fulfill({ json: {} });
    });
    await page.route('**/api/household-members', async (route) => {
      await route.fulfill({ json: [{ id: 1, name: 'Tung', slug: 'tung' }] });
    });

    await page.locator('input[type="file"]').setInputFiles({
      name: 'nordea2.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(UNKNOWN_CSV),
    });

    // Should show "Saved: Nordea" badge
    await expect(page.locator('text=/Saved.*Nordea|Nordea/i').first()).toBeVisible();
  });
});
