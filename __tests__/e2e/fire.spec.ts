import { test, expect, type Page } from '@playwright/test';
import { setupSplitwise } from '../fixtures/api-mock';

const CONFIG = {
  dateOfBirth: '1990-05-15',
  retirementAge: 50,
  mortgageEndAge: 55,
  pensionAge: 68,
  lifeExpectancy: 90,
  emergencyFundMonths: 6,
  monthlyContribution: 3000,
  accumulationReturn: 0.06,
  drawdownReturn: 0.04,
  taxpayers: 2,
  phase1aNetMonthly: 4400,
  phase1bNetMonthly: 4100,
  phase2NetMonthly: 4100,
  pensionAccruedMonthly: 1330,
  lifeExpectancyCoef: 0.90,
  pensionTaxRate: 0.20,
  endBufferYears: 2,
  returnVolatility: 0.15,
  annualGrossEarnings: 90000,
  rentalNetMonthly: 0,
  rentalTaxOnlyDeductionsMonthly: 0,
  rentalLoanPaymentMonthly: 0,
  rentalLoanRate: 0,
};

const PROJECTION = [
  { age: 36, year: 2026, portfolio: 450000 },
  { age: 40, year: 2030, portfolio: 620000 },
  { age: 50, year: 2040, portfolio: 900000 },
  { age: 68, year: 2058, portfolio: 1100000 },
  { age: 90, year: 2080, portfolio: 200000 },
];

function baristaVariant(label: string, activeIncomeMonthly: number, fireTarget: number) {
  return {
    label,
    activeIncomeMonthly,
    fireTarget,
    yearsToFire: 8.5,
    projectedRetirementAge: 44.9,
    earliestFireTarget: fireTarget * 0.95,
    projection: PROJECTION,
    portfolioAtDeath: 200000,
  };
}

const FIRE_RESPONSE = {
  config: CONFIG,
  derived: {
    earnings: { netMonthly: 5500, months: 12, grossAnnual: 90000 },
    rental: {
      rentMonthly: 0, rentMonths: 0, fees: [], netMonthly: 0,
      loanPaymentMonthly: 0, loanRate: 0,
      euribor: { rate: 0.027, period: '2026-08', live: false },
      loanBalance: 0, loanInterestMonthly: 0,
    },
  },
  investmentTotal: 420000,
  bankTotal: 60000,
  avgMonthlyIncome: 5500,
  bufferTarget: 33000,
  investableCash: 27000,
  fireTarget: 900000,
  currentPortfolio: 450000,
  progressPct: 50,
  yearsToFire: 8.5,
  projectedRetirementAge: 44.9,
  earliestFireTarget: 855000,
  pension: { accruedMonthly: 1330, futureAccrualMonthly: 400, grossMonthly: 1557, netMonthly: 1245.6 },
  deemedCostPct: 0.40,
  warnings: [],
  phases: [
    { label: 'Phase 1A', ageFrom: 50, ageTo: 55, netMonthly: 4400, pensionOffset: 0, rentalIncome: 0, portfolioShortfall: 4400, grossWithdrawal: 5500, grossAnnual: 66000, durationYears: 5 },
    { label: 'Phase 1B', ageFrom: 55, ageTo: 68, netMonthly: 4100, pensionOffset: 0, rentalIncome: 0, portfolioShortfall: 4100, grossWithdrawal: 5100, grossAnnual: 61200, durationYears: 13 },
    { label: 'Phase 2', ageFrom: 68, ageTo: 90, netMonthly: 4100, pensionOffset: 1245.6, rentalIncome: 0, portfolioShortfall: 2854.4, grossWithdrawal: 3500, grossAnnual: 42000, durationYears: 22 },
  ],
  pureFire: baristaVariant('Pure FIRE', 0, 900000),
  barista33: baristaVariant('Barista 33%', 1452, 700000),
  barista50: baristaVariant('Barista 50%', 2200, 550000),
  projection: PROJECTION,
  monteCarlo: {
    trials: 1000,
    successProbability: 0.82,
    bands: PROJECTION.map(p => ({ age: p.age, p10: p.portfolio * 0.6, p50: p.portfolio, p90: p.portfolio * 1.5 })),
  },
};

async function mockFire(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route('**/api/fire', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      await route.fulfill({ json: { ...FIRE_RESPONSE, ...overrides, config: { ...CONFIG, ...body } } });
    } else {
      await route.fulfill({ json: { ...FIRE_RESPONSE, ...overrides } });
    }
  });
}

test.describe('FIRE page', () => {
  test.beforeEach(async ({ page }) => {
    await setupSplitwise(page, []);
    await mockFire(page);
  });

  test('renders the headline KPIs', async ({ page }) => {
    await page.goto('/fire');
    await expect(page.locator('text=FIRE Number').first()).toBeVisible();
    await expect(page.locator('text=Current Portfolio')).toBeVisible();
    await expect(page.locator('text=Years to FIRE')).toBeVisible();
    await expect(page.locator('text=8.5 yrs')).toBeVisible();
  });

  test('shows the Monte Carlo success badge on the projection chart', async ({ page }) => {
    await page.goto('/fire');
    await expect(page.locator('text=/82% survive to 90/')).toBeVisible();
  });

  test('saving a changed config field sends a PUT with the new value', async ({ page }) => {
    let putBody: Record<string, unknown> | null = null;
    await page.route('**/api/fire', async (route) => {
      if (route.request().method() === 'PUT') {
        putBody = route.request().postDataJSON();
        await route.fulfill({ json: { ...FIRE_RESPONSE, config: { ...CONFIG, ...putBody } } });
      } else {
        await route.fulfill({ json: FIRE_RESPONSE });
      }
    });

    await page.goto('/fire');
    await page.locator('button:has-text("Configuration")').click();

    const retirementAgeInput = page.locator('label', { hasText: 'Target retirement age' }).locator('input');
    await retirementAgeInput.fill('52');
    await page.locator('button:has-text("Save")').click();
    await page.waitForLoadState('networkidle');

    expect(putBody).not.toBeNull();
    expect((putBody as unknown as { retirementAge: number }).retirementAge).toBe(52);
  });

  test('InfoTip popovers stay within the viewport at mobile width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/fire');
    await page.locator('button:has-text("Configuration")').click();

    const tipButtons = page.locator('button[aria-label="More information"]');
    const count = await tipButtons.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < Math.min(count, 5); i++) {
      const btn = tipButtons.nth(i);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();
      // The popup is the sibling <span> rendered next to the trigger button, inside
      // the same wrapping <span> — see InfoTip in components/FireDashboard.tsx.
      const popup = btn.locator('xpath=following-sibling::span').last();
      await expect(popup).toBeVisible();
      const box = await popup.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(390 + 1);
      }
      // The popup overlaps the full-screen "Close" overlay at z-20 vs z-10, so a plain
      // click can be intercepted by the popup itself — force it, since we only need the
      // open state reset between iterations, not a pixel-accurate user click.
      await page.locator('button[aria-label="Close"]').click({ force: true });
    }
  });
});
