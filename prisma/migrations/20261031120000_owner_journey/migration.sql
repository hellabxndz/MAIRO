-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadSource" ADD VALUE 'MANUAL';
ALTER TYPE "LeadSource" ADD VALUE 'CSV_IMPORT';

-- AlterTable
ALTER TABLE "CampaignAd" ADD COLUMN     "angleRevisionId" TEXT,
ADD COLUMN     "studioVersionId" TEXT;

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "collectedCents" INTEGER,
ADD COLUMN     "contactKey" TEXT,
ADD COLUMN     "sourceRef" TEXT,
ALTER COLUMN "leadFormId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "MairoDecision" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedPayloadJson" TEXT;

-- AlterTable
ALTER TABLE "OnboardingIntake" ADD COLUMN     "budgetSuggested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serviceReach" TEXT;

-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" "LeadStatus",
    "toStatus" "LeadStatus",
    "field" TEXT,
    "before" TEXT,
    "after" TEXT,
    "actorUserId" TEXT,
    "actorLabel" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAngle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdAngle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdAngleRevision" (
    "id" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "hook" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "cta" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "brandIssuesJson" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdAngleRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeExperiment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mairoCampaignId" TEXT,
    "hypothesis" TEXT NOT NULL,
    "variable" TEXT NOT NULL,
    "variantsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "resultJson" TEXT,
    "conclusion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeExperiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT,
    "anonId" TEXT,
    "propsJson" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseStudy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "attribution" TEXT NOT NULL,
    "metricsJson" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3),
    "consentByName" TEXT,
    "consentText" TEXT,
    "publishedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaseStudy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadEvent_leadId_createdAt_idx" ON "LeadEvent"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadEvent_organizationId_createdAt_idx" ON "LeadEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AdAngle_organizationId_updatedAt_idx" ON "AdAngle"("organizationId", "updatedAt");

-- CreateIndex
CREATE INDEX "AdAngleRevision_organizationId_idx" ON "AdAngleRevision"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "AdAngleRevision_angleId_version_key" ON "AdAngleRevision"("angleId", "version");

-- CreateIndex
CREATE INDEX "CreativeExperiment_organizationId_status_idx" ON "CreativeExperiment"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FunnelEvent_dedupeKey_key" ON "FunnelEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "FunnelEvent_name_createdAt_idx" ON "FunnelEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX "FunnelEvent_organizationId_createdAt_idx" ON "FunnelEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CaseStudy_organizationId_idx" ON "CaseStudy"("organizationId");

-- CreateIndex
CREATE INDEX "CaseStudy_status_publishedAt_idx" ON "CaseStudy"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "Lead_organizationId_contactKey_idx" ON "Lead"("organizationId", "contactKey");

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAngle" ADD CONSTRAINT "AdAngle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdAngleRevision" ADD CONSTRAINT "AdAngleRevision_angleId_fkey" FOREIGN KEY ("angleId") REFERENCES "AdAngle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeExperiment" ADD CONSTRAINT "CreativeExperiment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelEvent" ADD CONSTRAINT "FunnelEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseStudy" ADD CONSTRAINT "CaseStudy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

