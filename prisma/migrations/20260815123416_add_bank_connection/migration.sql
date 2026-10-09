-- CreateTable
CREATE TABLE "BankConnection" (
    "id" SERIAL NOT NULL,
    "aspspId" TEXT NOT NULL,
    "aspspName" TEXT NOT NULL,
    "sessionId" TEXT,
    "accountId" TEXT,
    "accountLabel" TEXT NOT NULL,
    "owner" TEXT NOT NULL DEFAULT 'tung',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_sessionId_key" ON "BankConnection"("sessionId");
