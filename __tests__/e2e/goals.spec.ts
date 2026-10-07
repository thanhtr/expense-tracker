import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

function makeGoal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'Avios 2027',
    unit: 'Avios',
    periodStart: '2027-01-01',
    periodEnd: '2027-12-31',
    note: '',
    levels: [
      { id: 1, label: 'Minimum — one-way ×2', targetPoints: 80_000 },
      { id: 2, label: 'Extended — return ×2', targetPoints: 160_000 },
    ],
    balances: [
      { id: 1, balance: 20_000, recordedAt: '2027-03-01', note: '' },
      { id: 2, balance: 50_000, recordedAt: '2027-06-01', note: 'card + flight earn' },
    ],
    progress: {
      latestBalance: 50_000,
      latestRecordedAt: '2027-06-01',
      periodElapsedPct: 41,
      monthsElapsed: 5,
      monthsRemaining: 7,
      observedPointsPerMonth: 10_000,
      projectedEndBalance: 120_000,
      levels: [
        {
          id: 1, label: 'Minimum — one-way ×2', targetPoints: 80_000,
          reached: false, pctOfTarget: 62.5, remaining: 30_000, expectedByToday: 32_800,
          pointsPerMonthNeeded: 4286, onTrack: true,
        },
        {
          id: 2, label: 'Extended — return ×2', targetPoints: 160_000,
          reached: false, pctOfTarget: 31.25, remaining: 110_000, expectedByToday: 65_600,
          pointsPerMonthNeeded: 15_714, onTrack: false,
        },
      ],
    },
    ...overrides,
  };
}

test.describe('Goals page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
  });

  test('shows an empty state with no goals', async ({ page }) => {
    await page.route(/\/api\/points-goals/, async (route) => {
      await route.fulfill({ json: [] });
    });
    await page.goto('/goals');
    await expect(page.getByText('No points goals yet.')).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Create goal' })).toBeVisible();
  });

  test('renders goal progress for both levels', async ({ page }) => {
    await page.route(/\/api\/points-goals/, async (route) => {
      await route.fulfill({ json: [makeGoal()] });
    });
    await page.goto('/goals');

    await expect(page.getByText('Avios 2027')).toBeVisible();
    await expect(page.getByText('Minimum — one-way ×2')).toBeVisible();
    await expect(page.getByText('Extended — return ×2')).toBeVisible();
    await expect(page.getByText(/Current balance:/)).toBeVisible();
    await expect(page.getByText(/50,000 Avios/)).toBeVisible();
    await expect(page.getByText(/behind pace/)).toBeVisible();
  });

  test('creates a goal with a POST body matching the form', async ({ page }) => {
    let created: ReturnType<typeof makeGoal> | null = null;
    await page.route(/\/api\/points-goals/, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        created = makeGoal({ name: body.name, levels: body.levels.map((l: { label: string; targetPoints: number }, i: number) => ({ id: i + 1, ...l })) });
        await route.fulfill({ status: 201, json: created });
      } else {
        // The page reloads the list (GET) right after creating — reflect what was just created.
        await route.fulfill({ json: created ? [created] : [] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: '+ Create goal' }).click();
    await expect(page.getByLabel('Period start')).toBeVisible();
    await page.getByRole('button', { name: 'Create goal' }).click();

    await expect(page.getByText('Minimum — one-way ×2')).toBeVisible();
  });

  test('adds a balance reading', async ({ page }) => {
    let addedBody: Record<string, unknown> | null = null;
    await page.route(/\/api\/points-goals/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'POST' && url.includes('/balances')) {
        addedBody = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          json: makeGoal({
            balances: [
              { id: 1, balance: 20_000, recordedAt: '2027-03-01', note: '' },
              { id: 2, balance: 50_000, recordedAt: '2027-06-01', note: '' },
              { id: 3, balance: 60_000, recordedAt: '2027-07-01', note: 'top-up' },
            ],
          }),
        });
      } else {
        await route.fulfill({ json: [makeGoal()] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: /Add reading/ }).click();
    await page.getByLabel('Balance (Avios)').fill('60000');
    await page.getByPlaceholder('e.g. Amex bonus transfer').fill('top-up');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => addedBody).not.toBeNull();
    expect(addedBody).toMatchObject({ balance: 60_000, note: 'top-up' });
  });
});
