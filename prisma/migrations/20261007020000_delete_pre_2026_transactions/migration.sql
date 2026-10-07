-- 2025 data was imported as-is from Splitwise with legacy categorization and is not reliable
-- for category-level analysis (user decision, 2026-10-06; see FORECAST_RELIABLE_HISTORY_START
-- in lib/constants.ts). Rather than special-casing "pre-2026 is unreliable" throughout the
-- codebase (rolling-window clamps, forecast history-start guards), the unreliable rows are
-- removed outright so every query's natural data range is already correct.
--
-- Cascades to TransactionSplit via its existing ON DELETE CASCADE foreign key. No
-- TransactionLink rows reference any pre-2026 transaction (verified before this migration was
-- written), so no reimbursement links are affected.
DELETE FROM "Transaction" WHERE "date" < '2026-01-01';
