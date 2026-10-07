import { test, expect } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

function makeFlight(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    label: 'Japan return, 2 pax',
    points: 160_000,
    economyFareEur: 1_668,
    neededBy: '2027-10-01',
    status: 'planned',
    redeemedAt: null,
    note: '',
    coveredNow: 50_000,
    pctCoveredNow: 31.25,
    remainingNow: 110_000,
    cumulativeNeeded: 160_000,
    remainingCumulative: 110_000,
    projectedAtDate: 90_000,
    shortfallAtDate: 70_000,
    pointsPerMonthNeeded: 15_714,
    onTrack: false,
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    name: 'Avios 2027',
    unit: 'Avios',
    note: '',
    balances: [
      { id: 1, balance: 20_000, recordedAt: '2027-03-01', note: '' },
      { id: 2, balance: 50_000, recordedAt: '2027-06-01', note: 'card + flight earn' },
    ],
    progress: {
      latestBalance: 50_000,
      latestRecordedAt: '2027-06-01',
      accruedPoints: 50_000,
      availableBalance: 50_000,
      totalRedeemedPoints: 0,
      totalPlannedPoints: 160_000,
      observedPointsPerMonth: 10_000,
      flights: [makeFlight()],
      pastFlights: [],
      nextFlightAtRisk: makeFlight(),
    },
    strategy: {
      allCovered: false,
      nextAtRisk: {
        flightId: 1, flightLabel: 'Japan return, 2 pax', neededBy: '2027-10-01',
        shortfallPoints: 70_000, monthsUntil: 4, eurTotal: 916.8, mrPoints: 119_000,
        visaSpendBasicTotal: 70_000, visaSpendSilverTotal: 58_333, amexSpendTotal: 59_500,
        overCap: false,
      },
      combined: null,
    },
    cashPlan: {
      monthlyDiscretionary: 700, liquidBufferAvailable: 500, overcommitted: false,
      flights: [{ id: 1, label: 'Japan return, 2 pax', neededBy: '2027-10-01', cashNeeded: 2_584.8, onTrack: false, shortBy: 1_784.8 }],
      onTrack: false,
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

  test('renders flight progress, the Avios strategy, and the cash plan', async ({ page }) => {
    await page.route(/\/api\/points-goals/, async (route) => {
      await route.fulfill({ json: [makeGoal()] });
    });
    await page.goto('/goals');

    await expect(page.getByText('Avios 2027')).toBeVisible();
    await expect(page.getByText('Japan return, 2 pax', { exact: true })).toBeVisible();
    await expect(page.getByText(/50,000 Avios/)).toBeVisible();
    await expect(page.getByText(/behind pace/)).toBeVisible();
    await expect(page.getByText('Closing the Avios gap')).toBeVisible();
    await expect(page.getByText(/70,000 Avios short/)).toBeVisible();
    await expect(page.getByText('Can I afford it?')).toBeVisible();
    await expect(page.getByText(/short by/)).toBeVisible();
  });

  test('creates a goal with a POST body matching the form', async ({ page }) => {
    let created: ReturnType<typeof makeGoal> | null = null;
    await page.route(/\/api\/points-goals$/, async (route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        created = makeGoal({ name: body.name, progress: { ...makeGoal().progress, flights: [], pastFlights: [] }, strategy: undefined, cashPlan: undefined });
        await route.fulfill({ status: 201, json: created });
      } else {
        await route.fulfill({ json: created ? [created] : [] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: '+ Create goal' }).click();
    await page.getByRole('button', { name: 'Create goal' }).click();

    await expect(page.getByText('No flights tracked yet.')).toBeVisible();
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

  test('adds a flight using the prefilled Avios amount', async ({ page }) => {
    let addedBody: Record<string, unknown> | null = null;
    await page.route(/\/api\/points-goals/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'POST' && url.includes('/flights')) {
        addedBody = route.request().postDataJSON();
        await route.fulfill({ status: 201, json: makeGoal() });
      } else {
        await route.fulfill({ json: [makeGoal({ progress: { ...makeGoal().progress, flights: [], pastFlights: [] }, strategy: undefined, cashPlan: undefined })] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: '+ Add flight' }).click();
    await page.getByPlaceholder('e.g. Japan return, 2 pax').fill('Singapore outbound, 2 pax');
    await page.getByLabel('Needed by').fill('2027-11-01');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => addedBody).not.toBeNull();
    expect(addedBody).toMatchObject({ label: 'Singapore outbound, 2 pax', points: 80_000, neededBy: '2027-11-01' });
  });

  test('marking a flight redeemed keeps it covered after a lower balance reading, and keeps it visible until the trip happens', async ({ page }) => {
    let patchedBody: Record<string, unknown> | null = null;
    await page.route(/\/api\/points-goals/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'PATCH' && /\/flights\/\d+$/.test(url)) {
        patchedBody = route.request().postDataJSON();
        await route.fulfill({
          json: makeGoal({
            progress: {
              ...makeGoal().progress,
              latestBalance: 20_000, // dropped after the redemption
              accruedPoints: 180_000,
              availableBalance: 20_000,
              totalRedeemedPoints: 160_000,
              // neededBy (2027-10-01, from makeFlight()) is still in the future, so the redeemed
              // flight stays in the main list rather than moving to pastFlights.
              flights: [{ ...makeFlight(), status: 'redeemed', redeemedAt: '2027-07-15', coveredNow: 160_000, remainingNow: 0, onTrack: true }],
              pastFlights: [],
              nextFlightAtRisk: null,
            },
            strategy: { allCovered: true, nextAtRisk: null, combined: null },
          }),
        });
      } else {
        await route.fulfill({ json: [makeGoal()] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: 'Mark redeemed' }).click();
    await page.getByRole('button', { name: 'Confirm' }).click();

    await expect.poll(() => patchedBody).not.toBeNull();
    expect(patchedBody).toMatchObject({ status: 'redeemed', redeemedAt: expect.any(String) });
    await expect(page.getByText('Every tracked flight is covered by your current balance.')).toBeVisible();
    // Still shown in the main list (not archived under "Show past"), confirmed rather than planned.
    await expect(page.getByText(/flying/)).toBeVisible();
    await expect(page.getByRole('button', { name: /Show past/ })).toHaveCount(0);
  });

  test('edits a flight', async ({ page }) => {
    let patchedBody: Record<string, unknown> | null = null;
    await page.route(/\/api\/points-goals/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'PATCH' && /\/flights\/\d+$/.test(url)) {
        patchedBody = route.request().postDataJSON();
        await route.fulfill({ json: makeGoal({ progress: { ...makeGoal().progress, flights: [{ ...makeFlight(), label: 'Japan return, 3 pax' }] } }) });
      } else {
        await route.fulfill({ json: [makeGoal()] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const labelInput = page.getByPlaceholder('e.g. Japan return, 2 pax');
    await labelInput.fill('Japan return, 3 pax');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => patchedBody).not.toBeNull();
    expect(patchedBody).toMatchObject({ label: 'Japan return, 3 pax' });
    await expect(page.getByText('Japan return, 3 pax', { exact: true })).toBeVisible();
  });

  test('edits the goal name/unit/note', async ({ page }) => {
    let patchedBody: Record<string, unknown> | null = null;
    await page.route(/\/api\/points-goals/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'PATCH' && /\/api\/points-goals\/\d+$/.test(url)) {
        patchedBody = route.request().postDataJSON();
        await route.fulfill({ json: makeGoal({ name: 'Avios 2028' }) });
      } else {
        await route.fulfill({ json: [makeGoal()] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: 'Edit goal Avios 2027' }).click();
    await page.getByLabel('Name').fill('Avios 2028');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => patchedBody).not.toBeNull();
    expect(patchedBody).toMatchObject({ name: 'Avios 2028' });
    await expect(page.getByText('Avios 2028')).toBeVisible();
  });

  test('edits a balance reading', async ({ page }) => {
    let patchedBody: Record<string, unknown> | null = null;
    await page.route(/\/api\/points-goals/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'PATCH' && url.includes('/balances')) {
        patchedBody = route.request().postDataJSON();
        await route.fulfill({ json: makeGoal() });
      } else {
        await route.fulfill({ json: [makeGoal()] });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: /Show readings/ }).click();
    await page.getByRole('button', { name: 'Edit reading' }).first().click();
    const balanceInputs = page.locator('input[type="number"]');
    await balanceInputs.last().fill('55000');
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => patchedBody).not.toBeNull();
    expect(patchedBody).toMatchObject({ balance: 55_000 });
  });

  test('reverts a redeemed-but-upcoming flight back to planned', async ({ page }) => {
    let patchedBody: Record<string, unknown> | null = null;
    page.on('dialog', (d) => void d.accept());
    await page.route(/\/api\/points-goals/, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (method === 'PATCH' && /\/flights\/\d+$/.test(url)) {
        patchedBody = route.request().postDataJSON();
        await route.fulfill({ json: makeGoal() });
      } else {
        await route.fulfill({
          json: [makeGoal({
            progress: {
              ...makeGoal().progress,
              flights: [{ ...makeFlight(), status: 'redeemed', redeemedAt: '2027-07-15', coveredNow: 160_000, remainingNow: 0, onTrack: true }],
            },
          })],
        });
      }
    });
    await page.goto('/goals');

    await page.getByRole('button', { name: 'Revert to planned' }).click();

    await expect.poll(() => patchedBody).not.toBeNull();
    expect(patchedBody).toMatchObject({ status: 'planned', redeemedAt: null });
  });
});
