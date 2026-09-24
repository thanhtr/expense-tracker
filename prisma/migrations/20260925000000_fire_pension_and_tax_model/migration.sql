-- The pension input was labelled "net monthly pension at retirement", but the value
-- saved (from the pension company statement) is the combined gross pension accrued
-- *so far*. Renamed to reflect that; the net pension at retirement is now projected
-- from it (future accrual, life-expectancy coefficient, earned-income tax) in
-- lib/services/fire-service.ts. The saved value keeps its (now correct) meaning.
ALTER TABLE "FireConfig" RENAME COLUMN "pensionNetMonthly" TO "pensionAccruedMonthly";
ALTER TABLE "FireConfig" ALTER COLUMN "pensionAccruedMonthly" SET DEFAULT 1330;

ALTER TABLE "FireConfig" ADD COLUMN "annualGrossEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "FireConfig" ADD COLUMN "lifeExpectancyCoef" DOUBLE PRECISION NOT NULL DEFAULT 0.90;
ALTER TABLE "FireConfig" ADD COLUMN "pensionTaxRate" DOUBLE PRECISION NOT NULL DEFAULT 0.20;
ALTER TABLE "FireConfig" ADD COLUMN "taxpayers" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "FireConfig" ADD COLUMN "rentalNetMonthly" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- New-row defaults only: the 1990 cohort's lowest retirement age is ~67y 9m (not 65),
-- and FIFO selling makes the 40% deemed acquisition cost the applicable rate for
-- long-horizon retirement drawdowns. Existing saved values are left untouched.
ALTER TABLE "FireConfig" ALTER COLUMN "pensionAge" SET DEFAULT 68;
ALTER TABLE "FireConfig" ALTER COLUMN "deemedCostPct" SET DEFAULT 0.40;
