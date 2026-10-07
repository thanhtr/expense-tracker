-- DropForeignKey (PointsGoalLevel -> PointsGoal), then DropTable: unused since the flight-based
-- model (PR #177); nothing has read PointsGoalLevel or PointsGoal.periodStart/periodEnd since.
ALTER TABLE "PointsGoalLevel" DROP CONSTRAINT IF EXISTS "PointsGoalLevel_goalId_fkey";
DROP TABLE IF EXISTS "PointsGoalLevel";

ALTER TABLE "PointsGoal" DROP COLUMN IF EXISTS "periodStart";
ALTER TABLE "PointsGoal" DROP COLUMN IF EXISTS "periodEnd";

-- CreateTable
CREATE TABLE "PointsPurchase" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "costEur" DOUBLE PRECISION NOT NULL,
    "purchasedAt" DATE NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'purchased',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsPurchase_goalId_purchasedAt_idx" ON "PointsPurchase"("goalId", "purchasedAt");

-- AddForeignKey
ALTER TABLE "PointsPurchase" ADD CONSTRAINT "PointsPurchase_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PointsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
