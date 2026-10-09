-- CreateEnum
CREATE TYPE "CoachCategory" AS ENUM ('CREATIVE', 'AUDIENCE', 'CONVERSION', 'TRACKING', 'LEAD_QUALITY', 'FOLLOW_UP', 'SALES', 'BUDGET', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "CoachConfidence" AS ENUM ('STRONG', 'SOME', 'EARLY');

-- CreateEnum
CREATE TYPE "CoachFindingStatus" AS ENUM ('OPEN', 'APPROVED', 'DISMISSED', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadStatus" ADD VALUE 'CONTACTED';
ALTER TYPE "LeadStatus" ADD VALUE 'ESTIMATE_SENT';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "appointmentAt" TIMESTAMP(3),
ADD COLUMN     "estimatedValueCents" INTEGER,
ADD COLUMN     "firstContactedAt" TIMESTAMP(3),
ADD COLUMN     "lastContactedAt" TIMESTAMP(3),
ADD COLUMN     "lostReason" TEXT,
ADD COLUMN     "mairoCampaignId" TEXT,
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "MairoDecision" ADD COLUMN     "findingId" TEXT,
ADD COLUMN     "verdict" TEXT,
ADD COLUMN     "verdictAt" TIMESTAMP(3),
ADD COLUMN     "verdictJson" TEXT,
ADD COLUMN     "verdictNote" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "leadStagesJson" TEXT,
ADD COLUMN     "notifyCoachAlerts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "CoachFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mairoCampaignId" TEXT,
    "campaignName" TEXT,
    "key" TEXT NOT NULL,
    "category" "CoachCategory" NOT NULL,
    "severity" TEXT NOT NULL,
    "confidence" "CoachConfidence" NOT NULL,
    "title" TEXT NOT NULL,
    "plain" TEXT NOT NULL,
    "noticed" TEXT NOT NULL,
    "explanationsJson" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "alternativesJson" TEXT NOT NULL,
    "alternativeIndex" INTEGER NOT NULL DEFAULT 0,
    "evidenceJson" TEXT NOT NULL,
    "limitations" TEXT NOT NULL,
    "missingJson" TEXT NOT NULL,
    "stepsJson" TEXT NOT NULL,
    "agentsJson" TEXT NOT NULL,
    "measureJson" TEXT,
    "decisionId" TEXT,
    "status" "CoachFindingStatus" NOT NULL DEFAULT 'OPEN',
    "feedback" TEXT,
    "decidedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "checkAfter" TIMESTAMP(3),
    "verdict" TEXT,
    "verdictNote" TEXT,
    "verdictAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoachFinding_organizationId_status_idx" ON "CoachFinding"("organizationId", "status");

-- CreateIndex
CREATE INDEX "CoachFinding_organizationId_key_idx" ON "CoachFinding"("organizationId", "key");

-- CreateIndex
CREATE INDEX "Lead_mairoCampaignId_idx" ON "Lead"("mairoCampaignId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_mairoCampaignId_fkey" FOREIGN KEY ("mairoCampaignId") REFERENCES "MairoCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachFinding" ADD CONSTRAINT "CoachFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

