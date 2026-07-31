-- CreateTable
CREATE TABLE "Transaction" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "account" TEXT NOT NULL DEFAULT 'Unknown',
    "merchant" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "paidBy" TEXT NOT NULL DEFAULT 'tung',
    "dedupKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedRule" (
    "id" SERIAL NOT NULL,
    "normalizedKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "learnedFrom" TEXT NOT NULL,
    "learnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_dedupKey_key" ON "Transaction"("dedupKey");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_category_idx" ON "Transaction"("category");

-- CreateIndex
CREATE INDEX "Transaction_account_idx" ON "Transaction"("account");

-- CreateIndex
CREATE INDEX "Transaction_type_idx" ON "Transaction"("type");

-- CreateIndex
CREATE INDEX "Transaction_paidBy_idx" ON "Transaction"("paidBy");

-- CreateIndex
CREATE UNIQUE INDEX "LearnedRule_normalizedKey_key" ON "LearnedRule"("normalizedKey");

-- CreateIndex
CREATE INDEX "LearnedRule_normalizedKey_idx" ON "LearnedRule"("normalizedKey");
