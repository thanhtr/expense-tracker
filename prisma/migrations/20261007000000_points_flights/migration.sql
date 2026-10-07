-- AlterTable: period dates are no longer required by the flight-based goal model
ALTER TABLE "PointsGoal" ALTER COLUMN "periodStart" DROP NOT NULL;
ALTER TABLE "PointsGoal" ALTER COLUMN "periodEnd" DROP NOT NULL;

-- CreateTable
CREATE TABLE "PointsFlight" (
    "id" SERIAL NOT NULL,
    "goalId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "economyFareEur" DOUBLE PRECISION,
    "neededBy" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "redeemedAt" DATE,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsFlight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PointsFlight_goalId_neededBy_idx" ON "PointsFlight"("goalId", "neededBy");

-- AddForeignKey
ALTER TABLE "PointsFlight" ADD CONSTRAINT "PointsFlight_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "PointsGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
