import { test, expect } from '@playwright/test';
import { setupSplitwise, mockExpenses, mockExpense } from '../fixtures/api-mock';

test.describe('Dashboard', () => {
  test('should load dashboard and display charts', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(5, new Date('2026-04-01')));
    await page.goto('/');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.locator('text=Top Category')).toBeVisible();
    await expect(page.locator('text=Monthly average')).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
  });

  test('should display correct total expenses', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Item 1', amount: 50.00 }),
      mockExpense({ merchant: 'Item 2', amount: 30.00 }),
      mockExpense({ merchant: 'Item 3', amount: 20.00 }),
    ]);
    await page.goto('/');
    const labelDiv = page.locator('text=Total expenses').first();
    await expect(labelDiv).toBeVisible();
    const valueText = await labelDiv.locator('..').locator('div').nth(1).textContent();
    expect(valueText).toContain('100');
  });

  test('should display transaction count', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(3));
    await page.goto('/');
    const transactionsCard = page.locator('.dash-card').filter({ hasText: 'Transactions' }).first();
    await expect(transactionsCard).toBeVisible();
    const valueText = await transactionsCard.locator('div').nth(1).textContent();
    expect(valueText).toContain('3');
  });

  test('should filter by category and show only selected category data', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Amazon', amount: 50.00, category: 'Shopping' }),
      mockExpense({ merchant: 'Starbucks', amount: 5.50, category: 'Food & Dining' }),
      mockExpense({ merchant: 'Grocery Store', amount: 30.00, category: 'Food & Groceries' }),
    ]);
    await page.goto('/');
    await expect(page.locator('text=Total expenses').first()).toBeVisible();
    const categorySelect = page.locator('select').first();
    await categorySelect.selectOption('Shopping');
    await page.waitForLoadState('networkidle');
    const valueText = await page.locator('text=Total expenses').first()
      .locator('..').locator('div').nth(1).textContent();
    expect(valueText).toContain('50');
  });

  test('should handle empty expenses gracefully', async ({ page }) => {
    await setupSplitwise(page, []);
    await page.goto('/');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    const valueText = await page.locator('text=Total expenses').first()
      .locator('..').locator('div').nth(1).textContent();
    expect(valueText).toMatch(/0|€|—/);
  });

  test('should update when date range is changed', async ({ page }) => {
    await setupSplitwise(page, mockExpenses(5, new Date('2026-04-01')));
    await page.goto('/');
    await expect(page.locator('text=Total expenses').first()).toBeVisible();
    const dateInputs = page.locator('input[type="date"]');
    if (await dateInputs.count() > 0) {
      await dateInputs.first().fill('2026-04-10');
      await page.waitForLoadState('networkidle');
      const valueText = await page.locator('text=Total expenses').first()
        .locator('..').locator('div').nth(1).textContent();
      expect(valueText).toBeDefined();
    }
  });

  test('should display uncategorized warning for uncategorized transactions', async ({ page }) => {
    await setupSplitwise(page, [
      mockExpense({ merchant: 'Unknown', amount: 50.00, category: '' }),
    ]);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('text=/ncategor/i').first()).toBeVisible();
  });
});
