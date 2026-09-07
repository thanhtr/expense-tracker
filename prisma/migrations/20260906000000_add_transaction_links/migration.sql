-- CreateTable
CREATE TABLE "TransactionLink" (
    "id" SERIAL NOT NULL,
    "expenseTransactionId" INTEGER NOT NULL,
    "reimbursementTransactionId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionLink_reimbursementTransactionId_key" ON "TransactionLink"("reimbursementTransactionId");

-- CreateIndex
CREATE INDEX "TransactionLink_expenseTransactionId_idx" ON "TransactionLink"("expenseTransactionId");

-- AddForeignKey
ALTER TABLE "TransactionLink" ADD CONSTRAINT "TransactionLink_expenseTransactionId_fkey" FOREIGN KEY ("expenseTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionLink" ADD CONSTRAINT "TransactionLink_reimbursementTransactionId_fkey" FOREIGN KEY ("reimbursementTransactionId") REFERENCES "Transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
