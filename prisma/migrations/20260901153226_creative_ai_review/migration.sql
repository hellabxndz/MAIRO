-- AlterEnum
ALTER TYPE "CreativeStatus" ADD VALUE 'BLOCKED';

-- AlterTable
ALTER TABLE "CreativeRequest" ADD COLUMN     "reviewCategory" TEXT,
ADD COLUMN     "reviewNotes" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);
