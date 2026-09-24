-- Bank/cash assets were previously excluded entirely from the FIRE portfolio
-- calculation. This adds a configurable emergency-fund buffer (in months of
-- average income) so cash above that buffer can count toward FIRE progress
-- while the buffer itself stays protected. Default of 6 months matches the
-- commonly-advised upper end of the standard 3-6 month guideline.
ALTER TABLE "FireConfig" ADD COLUMN "emergencyFundMonths" DOUBLE PRECISION NOT NULL DEFAULT 6;
