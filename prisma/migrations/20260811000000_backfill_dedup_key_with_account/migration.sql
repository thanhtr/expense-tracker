-- Backfill dedupKey to include account for rows imported before PR #35.
-- Old format: date|merchant|amount  (2 pipe separators)
-- New format: date|account|merchant|amount  (3 pipe separators)
--
-- Detection: if the 2nd segment (after first |) does not equal the account
-- column, the key is old-format and needs to be updated.
--
-- Transformation: insert account between the date segment and the rest of
-- the old key, e.g.
--   2026-07-17|Leading Slash Oy|3619.64
--   → 2026-07-17|OP Bank|Leading Slash Oy|3619.64
--
-- The WHERE clause makes this idempotent — rows already in the new format
-- are left untouched.

UPDATE "Transaction"
SET "dedupKey" =
  SPLIT_PART("dedupKey", '|', 1)
  || '|' || account
  || '|' || SUBSTRING("dedupKey" FROM POSITION('|' IN "dedupKey") + 1)
WHERE SPLIT_PART("dedupKey", '|', 2) != account;
