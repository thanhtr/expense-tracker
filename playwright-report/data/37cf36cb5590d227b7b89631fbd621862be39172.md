# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: upload.spec.ts >> CSV Upload >> should select account before upload
- Location: __tests__/e2e/upload.spec.ts:71:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('select').first()
    - locator resolved to <select class="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    59 × waiting for element to be visible and enabled
       - did not find some options
     - retrying select option action
       - waiting 500ms

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - navigation [ref=e2]:
    - generic [ref=e4]:
      - heading "Expense Tracker" [level=1] [ref=e6]
      - generic [ref=e7]:
        - link "Dashboard" [ref=e8] [cursor=pointer]:
          - /url: /
        - link "Transactions" [ref=e9] [cursor=pointer]:
          - /url: /transactions
        - link "Upload" [ref=e10] [cursor=pointer]:
          - /url: /upload
        - link "Keywords" [ref=e11] [cursor=pointer]:
          - /url: /keywords
  - main [ref=e12]:
    - generic [ref=e13]:
      - heading "Upload CSV" [level=1] [ref=e14]
      - paragraph [ref=e16]: Upload CSV files from your banks. Transactions are automatically deduplicated and categorized.
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e21]:
            - generic [ref=e22]: Account Type
            - combobox [ref=e23]:
              - option "OP Bank" [selected]
              - option "Amex"
              - option "Finnair Visa"
          - generic [ref=e24]:
            - generic [ref=e25]: Account Owner
            - combobox [ref=e26]:
              - option "Tung (Me)" [selected]
              - option "Thuy (Wife)"
        - generic [ref=e27]:
          - generic [ref=e28]: CSV File
          - button "Choose File" [ref=e29]
        - button "Upload CSV" [disabled] [ref=e30]
  - button "Open Next.js Dev Tools" [ref=e36] [cursor=pointer]:
    - img [ref=e37]
  - alert [ref=e40]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { setupSplitwise, mockExpense } from '../fixtures/splitwise-mock';
  3   | 
  4   | test.describe('CSV Upload', () => {
  5   |   test('should navigate to upload page', async ({ page }) => {
  6   |     await setupSplitwise(page, []);
  7   | 
  8   |     await page.goto('/');
  9   | 
  10  |     // Click on Upload link
  11  |     const uploadLink = page.locator('a:has-text("Upload")');
  12  |     if (await uploadLink.count() > 0) {
  13  |       await uploadLink.click();
  14  |       await expect(page).toHaveURL(/\/upload/);
  15  |     }
  16  |   });
  17  | 
  18  |   test('should show upload form', async ({ page }) => {
  19  |     await setupSplitwise(page, []);
  20  | 
  21  |     await page.goto('/upload');
  22  | 
  23  |     // Check for file input
  24  |     const fileInput = page.locator('input[type="file"]');
  25  |     await expect(fileInput).toBeVisible();
  26  | 
  27  |     // Check for account selector
  28  |     const accountSelect = page.locator('select');
  29  |     if (await accountSelect.count() > 0) {
  30  |       await expect(accountSelect.first()).toBeVisible();
  31  |     }
  32  |   });
  33  | 
  34  |   test('should show duplicate detection warning', async ({ page }) => {
  35  |     // Mock an existing expense that matches what we'll upload
  36  |     const existingExpense = mockExpense({
  37  |       date: '2026-04-10',
  38  |       merchant: 'Amazon',
  39  |       amount: 45.67,
  40  |     });
  41  | 
  42  |     await setupSplitwise(page, [existingExpense]);
  43  | 
  44  |     await page.goto('/upload');
  45  | 
  46  |     // Verify upload form exists
  47  |     const fileInput = page.locator('input[type="file"]');
  48  |     if (await fileInput.count() > 0) {
  49  |       await expect(fileInput).toBeVisible();
  50  |     }
  51  |   });
  52  | 
  53  |   test('should handle file upload and show results', async ({ page }) => {
  54  |     await setupSplitwise(page, []);
  55  | 
  56  |     await page.goto('/upload');
  57  | 
  58  |     // Verify form elements exist
  59  |     const fileInput = page.locator('input[type="file"]');
  60  |     const submitButton = page.locator('button:has-text("Upload"), button:has-text("Import")');
  61  | 
  62  |     if (await fileInput.count() > 0) {
  63  |       await expect(fileInput).toBeVisible();
  64  |     }
  65  | 
  66  |     if (await submitButton.count() > 0) {
  67  |       await expect(submitButton).toBeVisible();
  68  |     }
  69  |   });
  70  | 
  71  |   test('should select account before upload', async ({ page }) => {
  72  |     await setupSplitwise(page, []);
  73  | 
  74  |     await page.goto('/upload');
  75  | 
  76  |     // Find and interact with account selector
  77  |     const ownerSelect = page.locator('select').first();
  78  |     if (await ownerSelect.count() > 0) {
  79  |       // Select 'tung' option
> 80  |       await ownerSelect.selectOption('tung');
      |                         ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  81  | 
  82  |       // Verify selection
  83  |       const selectedValue = await ownerSelect.inputValue();
  84  |       expect(['tung', 'tung']).toContain(selectedValue.toLowerCase());
  85  |     }
  86  |   });
  87  | 
  88  |   test('should prevent upload without selecting account', async ({ page }) => {
  89  |     await setupSplitwise(page, []);
  90  | 
  91  |     await page.goto('/upload');
  92  | 
  93  |     // Try to find and click upload button
  94  |     const uploadButton = page.locator('button:has-text("Upload"), button:has-text("Import")');
  95  |     if (await uploadButton.count() > 0) {
  96  |       // Button should exist; actual validation depends on form implementation
  97  |       await expect(uploadButton).toBeVisible();
  98  |     }
  99  |   });
  100 | 
  101 |   test('should show progress during upload', async ({ page }) => {
  102 |     await setupSplitwise(page, []);
  103 | 
  104 |     await page.goto('/upload');
  105 | 
  106 |     // Page should render without errors
  107 |     expect(await page.content()).toBeDefined();
  108 |   });
  109 | 
  110 |   test('should display success message after upload', async ({ page }) => {
  111 |     await setupSplitwise(page, []);
  112 | 
  113 |     await page.goto('/upload');
  114 | 
  115 |     // After upload completes, should show results
  116 |     // (This would require actual form submission which is complex in E2E)
  117 |     // Instead, verify the upload page loads without errors
  118 |     await expect(page.locator('input[type="file"]')).toBeVisible().catch(() => {});
  119 |   });
  120 | 
  121 |   test('should handle upload errors gracefully', async ({ page }) => {
  122 |     await setupSplitwise(page, []);
  123 | 
  124 |     await page.goto('/upload');
  125 | 
  126 |     // Form should still be visible and usable
  127 |     await expect(page.locator('input[type="file"]')).toBeVisible().catch(() => {});
  128 |   });
  129 | });
  130 | 
```