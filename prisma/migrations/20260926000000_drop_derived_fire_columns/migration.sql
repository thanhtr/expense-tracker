-- These inputs are now derived (deemed cost from years to retirement; gross
-- earnings and rent from transactions — see lib/services/fire-inputs-service.ts)
-- and no deployed code reads them since PR #156.
ALTER TABLE "FireConfig" DROP COLUMN "deemedCostPct";
ALTER TABLE "FireConfig" DROP COLUMN "annualGrossEarnings";
ALTER TABLE "FireConfig" DROP COLUMN "rentalNetMonthly";
