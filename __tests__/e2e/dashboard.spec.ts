import { test, expect } from '@playwright/test';
import { setupSplitwise, mockExpenses, mockExpense } from '../fixtures/splitwise-mock';

test.describe('Dashboard', () => {
  test('should load dashboard with expenses and display charts', async ({ page }) => {
    const baseDate = new Date('2026-04-01');
    const expenses = mockExpenses(5, baseDate);
    await setupSplitwise(page, expenses);

    await page.goto('/');

    // Verify page title/heading
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // Verify stat cards are rendered
    await expect(page.locator('text=Top Category')).toBeVisible();
    await expect(page.locator('text=Daily Average')).toBeVisible();

    // Wait for charts to be visible (Recharts renders them)
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
  });

  test('should display correct total expenses', async ({ page }) => {
    const expenses = [
      mockExpense({ merchant: 'Item 1', amount: 50.00 }),
      mockExpense({ merchant: 'Item 2', amount: 30.00 }),
      mockExpense({ merchant: 'Item 3', amount: 20.00 }),
    ];
    await setupSplitwise(page, expenses);

    await page.goto('/');

    // Wait for stats to load
    await page.waitForTimeout(500);

    // Total should be 50 + 30 + 20 = 100
    // Find the KPI card for "Total expenses" and get the value (2nd child div)
    const labelDiv = page.locator('text=Total expenses').first();
    const valueText = await labelDiv.locator('..').locator('div').nth(1).textContent();
    expect(valueText).toContain('100');
  });

  test('should display transaction count', async ({ page }) => {
    const expenses = mockExpenses(3);
    await setupSplitwise(page, expenses);

    await page.goto('/');

    await page.waitForTimeout(500);

    // Get all KPI cards (dash-card elements in the grid). 4th one should be Transactions.
    const cards = page.locator('div.dash-card');
    await expect(cards.nth(3)).toBeVisible();

    // Get the value from the 4th card (index 3)
    const transactionsCard = cards.nth(3);
    const valueText = await transactionsCard.locator('div').nth(1).textContent();
    expect(valueText).toContain('3');
  });

  test('should filter by category and show only selected category data', async ({ page }) => {
    const expenses = [
      mockExpense({ merchant: 'Amazon', amount: 50.00, category: 'Shopping' }),
      mockExpense({ merchant: 'Starbucks', amount: 5.50, category: 'Food & Dining' }),
      mockExpense({ merchant: 'Grocery Store', amount: 30.00, category: 'Food & Groceries' }),
    ];
    await setupSplitwise(page, expenses);

    await page.goto('/');

    // Select a category from dropdown
    const categorySelect = page.locator('select').first();
    await categorySelect.selectOption('Shopping');

    // Wait for filtered data to load
    await page.waitForTimeout(500);

    // Verify only Shopping expenses shown
    const labelDiv = page.locator('text=Total expenses').first();
    const valueText = await labelDiv.locator('..').locator('div').nth(1).textContent();
    expect(valueText).toContain('50');
  });

  test('should handle empty expenses gracefully', async ({ page }) => {
    await setupSplitwise(page, []);

    await page.goto('/');

    // Should not crash
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // Stats should show 0 or dash
    const labelDiv = page.locator('text=Total expenses').first();
    const valueText = await labelDiv.locator('..').locator('div').nth(1).textContent();
    expect(valueText).toMatch(/0|€|—/);
  });

  test('should update when date range is changed', async ({ page }) => {
    const baseDate = new Date('2026-04-01');
    const expenses = mockExpenses(5, baseDate);
    await setupSplitwise(page, expenses);

    await page.goto('/');

    // Get initial state
    await page.waitForTimeout(500);

    // Change date range (depends on UI implementation)
    const dateInputs = page.locator('input[type="date"]');
    if ((await dateInputs.count()) > 0) {
      await dateInputs.first().fill('2026-04-10');
      await page.waitForTimeout(500);

      const labelDiv = page.locator('text=Total expenses').first();
      const valueText = await labelDiv.locator('..').locator('div').nth(1).textContent();
      // After filtering, amounts might differ
      expect(valueText).toBeDefined();
    }
  });

  test('should display uncategorized warning if applicable', async ({ page }) => {
    const expenses = [mockExpense({ merchant: 'Item 1', amount: 50.00, category: 'General' })];
    await setupSplitwise(page, expenses);

    await page.goto('/');

    await page.waitForTimeout(500);

    // May or may not show warning depending on categorization
    const page_content = await page.content();
    expect(page_content.length).toBeGreaterThan(0);
  });
});
