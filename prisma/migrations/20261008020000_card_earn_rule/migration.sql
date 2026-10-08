-- CreateTable
CREATE TABLE "CardEarnRule" (
    "id" SERIAL NOT NULL,
    "account" TEXT NOT NULL,
    "merchantPattern" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CardEarnRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinnairPlusTier" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "tier" TEXT NOT NULL DEFAULT 'basic',

    CONSTRAINT "FinnairPlusTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CardEarnRule_account_idx" ON "CardEarnRule"("account");

-- CreateIndex
CREATE INDEX "CardEarnRule_merchantPattern_idx" ON "CardEarnRule"("merchantPattern");
