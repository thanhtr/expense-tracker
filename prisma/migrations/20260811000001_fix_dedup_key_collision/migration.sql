-- Fix dedup key backfill: the previous migration (20260811000000) failed with a
-- unique constraint violation because some rows imported after PR #35 already had
-- the new-format key (date|account|merchant|amount), while older rows for the
-- same transaction still had the old-format key (date|merchant|amount).
-- Updating the old-format row would produce a duplicate new-format key.
--
-- This migration:
-- 1. Deletes old-format rows that are duplicated by an existing new-format row
-- 2. Updates any remaining old-format rows to the new format

-- Step 1: Delete old-format rows where a new-format equivalent already exists
DELETE FROM "Transaction"
WHERE id IN (
  SELECT t1.id
  FROM "Transaction" t1
  INNER JOIN "Transaction" t2
    ON t2."dedupKey" =
         SPLIT_PART(t1."dedupKey", '|', 1)
         || '|' || t1.account
         || '|' || SUBSTRING(t1."dedupKey" FROM POSITION('|' IN t1."dedupKey") + 1)
  WHERE SPLIT_PART(t1."dedupKey", '|', 2) != t1.account
    AND t1.id != t2.id
);

-- Step 2: Update remaining old-format rows to new format
UPDATE "Transaction"
SET "dedupKey" =
  SPLIT_PART("dedupKey", '|', 1)
  || '|' || account
  || '|' || SUBSTRING("dedupKey" FROM POSITION('|' IN "dedupKey") + 1)
WHERE SPLIT_PART("dedupKey", '|', 2) != account;
