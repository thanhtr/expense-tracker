-- DropIndex
DROP INDEX "LearnedRule_normalizedKey_idx";

-- DropIndex
DROP INDEX "Transaction_date_type_idx";

-- CreateIndex
CREATE INDEX "Transaction_merchant_idx" ON "Transaction"("merchant");

-- CreateIndex
CREATE INDEX "Transaction_amount_idx" ON "Transaction"("amount");

-- CreateIndex
CREATE INDEX "Transaction_type_date_idx" ON "Transaction"("type", "date");
