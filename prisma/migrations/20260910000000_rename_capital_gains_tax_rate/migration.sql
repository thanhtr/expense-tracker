-- The field was never a tax rate: it's the hankintameno-olettama deemed acquisition
-- cost percentage (20% for holdings <10y). Renaming to reflect what it actually
-- represents; the FI capital income tax rate itself is now applied separately
-- as a fixed progressive schedule in lib/services/fire-service.ts.
ALTER TABLE "FireConfig" RENAME COLUMN "capitalGainsTaxRate" TO "deemedCostPct";

-- A plain rename would silently reinterpret any previously-saved custom value
-- (e.g. a user-tuned "effective rate" like 0.24) under a completely different
-- meaning (deemed-cost fraction), producing a wrong FIRE number with no error.
-- Reset every row back to the known-conservative statutory default rather than
-- carry forward a number whose old meaning no longer applies.
UPDATE "FireConfig" SET "deemedCostPct" = 0.20;
