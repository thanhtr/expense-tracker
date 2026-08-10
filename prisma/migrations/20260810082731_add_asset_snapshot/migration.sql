-- CreateTable
CREATE TABLE "AssetSnapshot" (
    "id" SERIAL NOT NULL,
    "assetId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "recordedAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetSnapshot_recordedAt_idx" ON "AssetSnapshot"("recordedAt");

-- CreateIndex
CREATE INDEX "AssetSnapshot_assetId_idx" ON "AssetSnapshot"("assetId");
