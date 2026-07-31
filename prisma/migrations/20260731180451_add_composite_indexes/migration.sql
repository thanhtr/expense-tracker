-- CreateIndex
CREATE INDEX "Transaction_date_type_idx" ON "Transaction"("date", "type");

-- CreateIndex
CREATE INDEX "Transaction_category_date_idx" ON "Transaction"("category", "date");
