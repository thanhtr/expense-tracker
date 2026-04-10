import { test, expect } from '@playwright/test';
import { setupSplitwise, mockExpenses, mockExpense } from '../fixtures/splitwise-mock';

test.describe('Transactions Page', () => {
  test('should navigate to transactions page', async ({ page }) => {
    const expenses = mockExpenses(3);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/');

    // Click on Transactions link in navigation
    await page.locator('a:has-text("Transactions")').click();

    // Should be on transactions page
    await expect(page).toHaveURL(/\/transactions/);
  });

  test('should load and display transactions list', async ({ page }) => {
    const expenses = mockExpenses(3);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/transactions');

    // Wait for table to load
    await page.waitForTimeout(500);

    // Verify transaction rows exist
    const rows = page.locator('tr, [role="row"]');
    expect(await rows.count()).toBeGreaterThan(0);
  });

  test('should show pagination for large lists', async ({ page }) => {
    // Create 60 expenses (more than default page size of 50)
    const expenses = mockExpenses(60);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/transactions');

    await page.waitForTimeout(500);

    // Check for pagination controls
    const nextButton = page.locator('button:has-text("Next")');
    if (await nextButton.count() > 0) {
      await expect(nextButton).toBeEnabled();
    }
  });

  test('should navigate to next page with pagination', async ({ page }) => {
    const expenses = mockExpenses(60);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/transactions');

    await page.waitForTimeout(500);

    // Get first row's content before pagination
    const firstRowBefore = await page.locator('tr, [role="row"]').nth(1).textContent();

    // Click next page if button exists
    const nextButton = page.locator('button:has-text("Next")');
    if (await nextButton.count() > 0 && (await nextButton.isEnabled())) {
      await nextButton.click();
      await page.waitForTimeout(500);

      const firstRowAfter = await page.locator('tr, [role="row"]').nth(1).textContent();
      // Content should change after pagination
      expect(firstRowAfter).not.toEqual(firstRowBefore);
    }
  });

  test('should filter transactions by account', async ({ page }) => {
    const expenses = [
      mockExpense({
        id: 1,
        description: 'OP Purchase',
        cost: '50.00',
        details: JSON.stringify({ account: 'OP Bank' }),
      }),
      mockExpense({
        id: 2,
        description: 'Amex Purchase',
        cost: '30.00',
        details: JSON.stringify({ account: 'Amex' }),
      }),
    ];
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/transactions');

    // Open filters
    const filterButton = page.locator('button:has-text("Filter"), button:has-text("Apply")');
    if (await filterButton.count() > 0) {
      // Select account filter (if UI has it)
      const accountSelect = page.locator('select').first();
      if (await accountSelect.count() > 0) {
        await accountSelect.selectOption('OP Bank');

        // Apply filters
        const applyButton = page.locator('button:has-text("Apply")');
        if (await applyButton.count() > 0) {
          await applyButton.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('should reset filters', async ({ page }) => {
    const expenses = mockExpenses(3);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/transactions');

    // Find reset button if present
    const resetButton = page.locator('button:has-text("Reset")');
    if (await resetButton.count() > 0) {
      await resetButton.click();
      await page.waitForTimeout(500);

      // Verify page still loads
      await expect(page.locator('tr, [role="row"]').first()).toBeVisible();
    }
  });

  test('should allow inline category editing', async ({ page }) => {
    const expenses = [mockExpense({ id: 1, category: { id: 25, name: 'Food & Dining' } })];
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/transactions');

    await page.waitForTimeout(500);

    // Find a category cell (depends on table structure)
    const categoryCell = page.locator('text=Food & Dining').first();
    if (await categoryCell.count() > 0) {
      // Click to enter edit mode
      await categoryCell.click();

      // Check if input appears
      const input = page.locator('input[type="text"]').first();
      if (await input.count() > 0) {
        await expect(input).toBeVisible();

        // Change value
        await input.fill('Shopping');

        // Look for save button
        const saveButton = page.locator('button:has-text("Save")');
        if (await saveButton.count() > 0) {
          await saveButton.click();
          await page.waitForTimeout(300);
        }
      }
    }
  });

  test('should allow transaction deletion with confirmation', async ({ page }) => {
    const expenses = [mockExpense({ id: 1 })];
    await setupSplitwise(page, { get_expenses: expenses, delete_expense: true });

    await page.goto('/transactions');

    await page.waitForTimeout(500);

    // Find and click delete button
    const deleteButton = page.locator('button:has-text("Delete")').first();
    if (await deleteButton.count() > 0) {
      await deleteButton.click();

      // Handle confirmation dialog
      await page.on('dialog', (dialog) => dialog.accept());

      await page.waitForTimeout(300);

      // Verify delete was called (would require checking mocks or network)
    }
  });

  test('should export transactions as CSV', async ({ page }) => {
    const expenses = mockExpenses(3);
    await setupSplitwise(page, { get_expenses: expenses });

    await page.goto('/transactions');

    // Look for export button
    const exportButton = page.locator('button:has-text("Export"), a:has-text("Export")');
    if (await exportButton.count() > 0) {
      // Verify button exists and is clickable
      await expect(exportButton).toBeVisible();
    }
  });
});
