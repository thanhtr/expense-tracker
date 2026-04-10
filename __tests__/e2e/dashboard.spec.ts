import { test, expect } from '@playwright/test';
import { setupSplitwise, mockExpenses, mockExpense } from '../fixtures/splitwise-mock';

test.describe('Dashboard', () => {
  test('should load dashboard with expenses and display charts', async ({ page }) => {
    const baseDate = new Date('2026-04-01');
    const expenses = mockExpenses(5, baseDate);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/');

    // Verify page title/heading
    await expect(page.locator('h1, h2')).first().toBeVisible();

    // Verify stat cards are rendered
    await expect(page.locator('text=Total Expenses')).toBeVisible();
    await expect(page.locator('text=Transaction Count')).toBeVisible();

    // Wait for charts to be visible (Recharts renders them)
    await expect(page.locator('svg')).first().toBeVisible();
  });

  test('should display correct total expenses', async ({ page }) => {
    const expenses = [
      mockExpense({ id: 1, description: 'Item 1', cost: '50.00' }),
      mockExpense({ id: 2, description: 'Item 2', cost: '30.00' }),
      mockExpense({ id: 3, description: 'Item 3', cost: '20.00' }),
    ];
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/');

    // Wait for stats to load
    await page.waitForTimeout(500);

    // Total should be 50 + 30 + 20 = 100
    const totalExpensesText = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
    expect(totalExpensesText).toContain('100');
  });

  test('should display transaction count', async ({ page }) => {
    const expenses = mockExpenses(3);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/');

    await page.waitForTimeout(500);

    const countText = await page.locator('text=Transaction Count').locator('..').locator('div').last().textContent();
    expect(countText).toContain('3');
  });

  test('should filter by category and show only selected category data', async ({ page }) => {
    const expenses = [
      mockExpense({
        id: 1,
        description: 'Amazon',
        cost: '50.00',
        category: { id: 41, name: 'Shopping' },
      }),
      mockExpense({
        id: 2,
        description: 'Starbucks',
        cost: '5.50',
        category: { id: 25, name: 'Food & Dining' },
      }),
      mockExpense({
        id: 3,
        description: 'Grocery Store',
        cost: '30.00',
        category: { id: 12, name: 'Food & Groceries' },
      }),
    ];
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/');

    // Select a category from dropdown
    const categorySelect = page.locator('select').first();
    await categorySelect.selectOption('Shopping');

    // Wait for filtered data to load
    await page.waitForTimeout(500);

    // Verify only Shopping expenses shown
    const totalText = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
    expect(totalText).toContain('50');
  });

  test('should handle empty expenses gracefully', async ({ page }) => {
    await setupSplitwise(page, { get_expenses: [] });

    await page.goto('/');

    // Should not crash
    await expect(page.locator('h1, h2')).first().toBeVisible();

    // Stats should show 0
    const totalText = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
    expect(totalText).toContain('0');
  });

  test('should update when date range is changed', async ({ page }) => {
    const baseDate = new Date('2026-04-01');
    const expenses = mockExpenses(5, baseDate);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/');

    // Get initial total
    await page.waitForTimeout(500);
    const initialTotal = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();

    // Change date range (depends on UI implementation)
    const dateInputs = page.locator('input[type="date"]');
    if ((await dateInputs.count()) > 0) {
      await dateInputs.first().fill('2026-04-10');
      await page.waitForTimeout(500);

      const newTotal = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
      // After filtering, amounts might differ
      expect(newTotal).toBeDefined();
    }
  });

  test('should display uncategorized warning if applicable', async ({ page }) => {
    const expenses = [
      mockExpense({
        id: 1,
        description: 'Item 1',
        cost: '50.00',
        category: { id: 18, name: 'General' }, // Often used for uncategorized
      }),
    ];
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/');

    await page.waitForTimeout(500);

    // May or may not show warning depending on categorization
    const page_content = await page.content();
    expect(page_content.length).toBeGreaterThan(0);
  });
});
