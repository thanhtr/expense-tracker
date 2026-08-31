-- CreateTable
CREATE TABLE "BankProfile" (
    "id" SERIAL NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "bankLabel" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankProfile_fingerprint_key" ON "BankProfile"("fingerprint");
