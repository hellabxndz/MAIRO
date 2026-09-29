-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InstagramPostStatus" ADD VALUE 'SUGGESTED';
ALTER TYPE "InstagramPostStatus" ADD VALUE 'SCHEDULED';

-- AlterTable
ALTER TABLE "InstagramPost" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mediaRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "mediaType" TEXT NOT NULL DEFAULT 'IMAGE',
ADD COLUMN     "previewUrl" TEXT,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "suggestedByMairo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "InstagramPost_status_scheduledFor_idx" ON "InstagramPost"("status", "scheduledFor");
