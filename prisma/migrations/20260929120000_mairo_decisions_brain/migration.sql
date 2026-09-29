-- CreateEnum
CREATE TYPE "DecisionCategory" AS ENUM ('NEEDS_ATTENTION', 'GROWTH', 'CREATIVE', 'BUDGET', 'AUDIENCE', 'RETARGETING', 'WEBSITE', 'TESTING');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED', 'IGNORED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "DecisionConfidence" AS ENUM ('HIGH', 'MEDIUM', 'EARLY');

-- CreateEnum
CREATE TYPE "DecisionRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "decisionsCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AutoOptimizeSettings" ADD COLUMN     "maxDailyDecreasePercent" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "requireApprovalAudience" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireApprovalNewCreatives" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requireApprovalPlatformShift" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "BusinessBrain" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileJson" TEXT NOT NULL,
    "editedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "analysisJson" TEXT,
    "analyzedUrl" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessBrain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MairoDecision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mairoCampaignId" TEXT,
    "platform" "AdPlatform",
    "kind" TEXT NOT NULL,
    "category" "DecisionCategory" NOT NULL,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "noticed" TEXT NOT NULL,
    "noticedAdvanced" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "risk" "DecisionRisk" NOT NULL,
    "confidence" "DecisionConfidence" NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "changesJson" TEXT NOT NULL,
    "automationAction" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PENDING',
    "dedupeKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'daily',
    "resultJson" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MairoDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MairoActivity" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mairoCampaignId" TEXT,
    "decisionId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "before" TEXT,
    "after" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MairoActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BusinessBrain_organizationId_key" ON "BusinessBrain"("organizationId");

-- CreateIndex
CREATE INDEX "MairoDecision_organizationId_status_createdAt_idx" ON "MairoDecision"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MairoDecision_organizationId_dedupeKey_key" ON "MairoDecision"("organizationId", "dedupeKey");

-- CreateIndex
CREATE INDEX "MairoActivity_organizationId_createdAt_idx" ON "MairoActivity"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "BusinessBrain" ADD CONSTRAINT "BusinessBrain_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MairoDecision" ADD CONSTRAINT "MairoDecision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MairoActivity" ADD CONSTRAINT "MairoActivity_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
