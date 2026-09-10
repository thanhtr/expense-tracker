-- The field was never a tax rate: it's the hankintameno-olettama deemed acquisition
-- cost percentage (20% for holdings <10y). Renaming to reflect what it actually
-- represents; the FI capital income tax rate itself is now applied separately
-- as a fixed progressive schedule in lib/services/fire-service.ts.
ALTER TABLE "FireConfig" RENAME COLUMN "capitalGainsTaxRate" TO "deemedCostPct";
