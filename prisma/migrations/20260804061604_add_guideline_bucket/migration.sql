-- CreateTable
CREATE TABLE "GuidelineBucket" (
    "id" SERIAL NOT NULL,
    "bucket" TEXT NOT NULL,
    "targetPct" DOUBLE PRECISION NOT NULL,
    "categories" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuidelineBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuidelineBucket_bucket_key" ON "GuidelineBucket"("bucket");
