-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
