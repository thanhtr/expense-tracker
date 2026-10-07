-- CreateTable
CREATE TABLE "PointsGoal" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Avios',
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsGoalLevel" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "targetPoints" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PointsGoalLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsBalance" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "recordedAt" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsBalance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsGoalLevel_goalId_idx" ON "PointsGoalLevel"("goalId");

-- CreateIndex
CREATE INDEX "PointsBalance_goalId_recordedAt_idx" ON "PointsBalance"("goalId", "recordedAt");

-- AddForeignKey
ALTER TABLE "PointsGoalLevel" ADD CONSTRAINT "PointsGoalLevel_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PointsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsBalance" ADD CONSTRAINT "PointsBalance_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PointsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
