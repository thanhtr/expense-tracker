# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: dashboard.spec.ts >> Dashboard >> should load dashboard with expenses and display charts
- Location: __tests__/e2e/dashboard.spec.ts:5:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=Transaction Count')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=Transaction Count')

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
      - heading "Dashboard" [level=1] [ref=e14]
      - generic [ref=e15]:
        - generic [ref=e17]:
          - generic [ref=e18]:
            - generic [ref=e19]: Category
            - combobox [ref=e20]:
              - option "All Categories" [selected]
              - option "Shopping"
              - option "Food & Dining"
              - option "Food & Groceries"
              - option "Transport"
              - option "Entertainment"
          - generic [ref=e21]:
            - generic [ref=e22]: From
            - textbox [ref=e23]: 2026-04-01
          - generic [ref=e24]:
            - generic [ref=e25]: To
            - textbox [ref=e26]: 2026-04-30
        - generic [ref=e27]:
          - generic [ref=e28]:
            - generic [ref=e29]: Total Expenses
            - generic [ref=e30]: 340,36 €
          - generic [ref=e31]:
            - generic [ref=e32]: Total Income
            - generic [ref=e33]: 0,00 €
          - generic [ref=e34]:
            - generic [ref=e35]: Net
            - generic [ref=e36]: −340,36 €
          - generic [ref=e37]:
            - generic [ref=e38]: OP
            - generic [ref=e39]: 340,36 €
        - generic [ref=e40]:
          - generic [ref=e41]:
            - generic [ref=e42]: Top Category
            - generic [ref=e43]: Transport
            - generic [ref=e44]: 97,33 €
          - generic [ref=e45]:
            - generic [ref=e46]: Most Expensive
            - generic [ref=e47]: Uber
            - generic [ref=e48]: Transport
            - generic [ref=e49]: 97,33 €
          - generic [ref=e50]:
            - generic [ref=e51]: Daily Average
            - generic [ref=e52]: 113,45 €
          - generic [ref=e53]:
            - generic [ref=e54]: Transactions
            - generic [ref=e55]: "5"
        - generic [ref=e56]:
          - generic [ref=e57]:
            - heading "Expenses by Category" [level=2] [ref=e58]
            - application [ref=e61]:
              - generic [ref=e80]:
                - generic [ref=e83]: Transport 29%
                - generic [ref=e86]: Shopping 28%
                - generic [ref=e89]: Entertainment 24%
                - generic [ref=e92]: Food & Dining 13%
                - generic [ref=e95]: Other 7%
          - generic [ref=e96]:
            - heading "Daily Spending by Category" [level=2] [ref=e97]
            - generic [ref=e99]:
              - list [ref=e101]:
                - listitem [ref=e102]:
                  - img "Entertainment legend icon" [ref=e103]
                  - text: Entertainment
                - listitem [ref=e105]:
                  - img "Food & Dining legend icon" [ref=e106]
                  - text: Food & Dining
                - listitem [ref=e108]:
                  - img "Food & Groceries legend icon" [ref=e109]
                  - text: Food & Groceries
                - listitem [ref=e111]:
                  - img "Shopping legend icon" [ref=e112]
                  - text: Shopping
                - listitem [ref=e114]:
                  - img "Transport legend icon" [ref=e115]
                  - text: Transport
              - application [ref=e117]:
                - generic [ref=e156]:
                  - generic [ref=e157]:
                    - generic [ref=e159]: 1 Apr
                    - generic [ref=e161]: 2 Apr
                    - generic [ref=e163]: 3 Apr
                  - generic [ref=e164]:
                    - generic [ref=e166]: €0
                    - generic [ref=e168]: €35
                    - generic [ref=e170]: €70
                    - generic [ref=e172]: €105
                    - generic [ref=e174]: €140
  - button "Open Next.js Dev Tools" [ref=e180] [cursor=pointer]:
    - img [ref=e181]
  - alert [ref=e184]
  - generic [ref=e185]: €0
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | import { setupSplitwise, mockExpenses, mockExpense } from '../fixtures/splitwise-mock';
  3   | 
  4   | test.describe('Dashboard', () => {
  5   |   test('should load dashboard with expenses and display charts', async ({ page }) => {
  6   |     const baseDate = new Date('2026-04-01');
  7   |     const expenses = mockExpenses(5, baseDate);
  8   |     await setupSplitwise(page, expenses);
  9   | 
  10  |     await page.goto('/');
  11  | 
  12  |     // Verify page title/heading
  13  |     await expect(page.locator('h1, h2').first()).toBeVisible();
  14  | 
  15  |     // Verify stat cards are rendered
  16  |     await expect(page.locator('text=Total Expenses')).toBeVisible();
> 17  |     await expect(page.locator('text=Transaction Count')).toBeVisible();
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  18  | 
  19  |     // Wait for charts to be visible (Recharts renders them)
  20  |     await expect(page.locator('svg').first()).toBeVisible();
  21  |   });
  22  | 
  23  |   test('should display correct total expenses', async ({ page }) => {
  24  |     const expenses = [
  25  |       mockExpense({ merchant: 'Item 1', amount: 50.00 }),
  26  |       mockExpense({ merchant: 'Item 2', amount: 30.00 }),
  27  |       mockExpense({ merchant: 'Item 3', amount: 20.00 }),
  28  |     ];
  29  |     await setupSplitwise(page, expenses);
  30  | 
  31  |     await page.goto('/');
  32  | 
  33  |     // Wait for stats to load
  34  |     await page.waitForTimeout(500);
  35  | 
  36  |     // Total should be 50 + 30 + 20 = 100
  37  |     const totalExpensesText = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
  38  |     expect(totalExpensesText).toContain('100');
  39  |   });
  40  | 
  41  |   test('should display transaction count', async ({ page }) => {
  42  |     const expenses = mockExpenses(3);
  43  |     await setupSplitwise(page, expenses);
  44  | 
  45  |     await page.goto('/');
  46  | 
  47  |     await page.waitForTimeout(500);
  48  | 
  49  |     const countText = await page.locator('text=Transaction Count').locator('..').locator('div').last().textContent();
  50  |     expect(countText).toContain('3');
  51  |   });
  52  | 
  53  |   test('should filter by category and show only selected category data', async ({ page }) => {
  54  |     const expenses = [
  55  |       mockExpense({ merchant: 'Amazon', amount: 50.00, category: 'Shopping' }),
  56  |       mockExpense({ merchant: 'Starbucks', amount: 5.50, category: 'Food & Dining' }),
  57  |       mockExpense({ merchant: 'Grocery Store', amount: 30.00, category: 'Food & Groceries' }),
  58  |     ];
  59  |     await setupSplitwise(page, expenses);
  60  | 
  61  |     await page.goto('/');
  62  | 
  63  |     // Select a category from dropdown
  64  |     const categorySelect = page.locator('select').first();
  65  |     await categorySelect.selectOption('Shopping');
  66  | 
  67  |     // Wait for filtered data to load
  68  |     await page.waitForTimeout(500);
  69  | 
  70  |     // Verify only Shopping expenses shown
  71  |     const totalText = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
  72  |     expect(totalText).toContain('50');
  73  |   });
  74  | 
  75  |   test('should handle empty expenses gracefully', async ({ page }) => {
  76  |     await setupSplitwise(page, []);
  77  | 
  78  |     await page.goto('/');
  79  | 
  80  |     // Should not crash
  81  |     await expect(page.locator('h1, h2').first()).toBeVisible();
  82  | 
  83  |     // Stats should show 0
  84  |     const totalText = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
  85  |     expect(totalText).toContain('0');
  86  |   });
  87  | 
  88  |   test('should update when date range is changed', async ({ page }) => {
  89  |     const baseDate = new Date('2026-04-01');
  90  |     const expenses = mockExpenses(5, baseDate);
  91  |     await setupSplitwise(page, expenses);
  92  | 
  93  |     await page.goto('/');
  94  | 
  95  |     // Get initial state
  96  |     await page.waitForTimeout(500);
  97  | 
  98  |     // Change date range (depends on UI implementation)
  99  |     const dateInputs = page.locator('input[type="date"]');
  100 |     if ((await dateInputs.count()) > 0) {
  101 |       await dateInputs.first().fill('2026-04-10');
  102 |       await page.waitForTimeout(500);
  103 | 
  104 |       const newTotal = await page.locator('text=Total Expenses').locator('..').locator('div').last().textContent();
  105 |       // After filtering, amounts might differ
  106 |       expect(newTotal).toBeDefined();
  107 |     }
  108 |   });
  109 | 
  110 |   test('should display uncategorized warning if applicable', async ({ page }) => {
  111 |     const expenses = [mockExpense({ merchant: 'Item 1', amount: 50.00, category: 'General' })];
  112 |     await setupSplitwise(page, expenses);
  113 | 
  114 |     await page.goto('/');
  115 | 
  116 |     await page.waitForTimeout(500);
  117 | 
```