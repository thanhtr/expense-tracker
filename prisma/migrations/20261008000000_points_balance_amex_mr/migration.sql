-- Untransferred Amex MR balance recorded alongside each Avios reading (Avios-unit goals only).
ALTER TABLE "PointsBalance" ADD COLUMN "amexMr" INTEGER NOT NULL DEFAULT 0;
