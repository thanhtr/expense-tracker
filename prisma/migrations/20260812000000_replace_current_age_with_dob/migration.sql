-- Replace integer currentAge with dateOfBirth string
ALTER TABLE "FireConfig" ADD COLUMN "dateOfBirth" TEXT NOT NULL DEFAULT '1990-05-15';
ALTER TABLE "FireConfig" DROP COLUMN "currentAge";
