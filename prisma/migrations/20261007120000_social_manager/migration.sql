-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InstagramPostStatus" ADD VALUE 'SKIPPED';
ALTER TYPE "InstagramPostStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "InstagramPost" ADD COLUMN     "autoApproved" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "commentCount" INTEGER,
ADD COLUMN     "contentType" TEXT,
ADD COLUMN     "creativeIdea" TEXT,
ADD COLUMN     "cta" TEXT,
ADD COLUMN     "likeCount" INTEGER,
ADD COLUMN     "metricsAt" TIMESTAMP(3),
ADD COLUMN     "objective" TEXT,
ADD COLUMN     "promotionId" TEXT,
ADD COLUMN     "rationale" TEXT,
ADD COLUMN     "sequenceStep" TEXT;

-- CreateTable
CREATE TABLE "SocialStrategy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "goalDetail" TEXT NOT NULL DEFAULT '',
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "approvalMode" TEXT NOT NULL DEFAULT 'APPROVAL_REQUIRED',
    "postsPerWeek" INTEGER NOT NULL DEFAULT 4,
    "strategyJson" TEXT NOT NULL,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "pausedAt" TIMESTAMP(3),
    "pausedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialStrategy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialPromotion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPromotion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SocialStrategy_organizationId_key" ON "SocialStrategy"("organizationId");

-- CreateIndex
CREATE INDEX "SocialPromotion_organizationId_status_idx" ON "SocialPromotion"("organizationId", "status");

-- CreateIndex
CREATE INDEX "InstagramPost_organizationId_scheduledFor_idx" ON "InstagramPost"("organizationId", "scheduledFor");

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "SocialPromotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialStrategy" ADD CONSTRAINT "SocialStrategy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialPromotion" ADD CONSTRAINT "SocialPromotion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
