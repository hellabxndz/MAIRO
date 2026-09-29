-- CreateEnum
CREATE TYPE "StrategyPlanStatus" AS ENUM ('DRAFT', 'REVISING', 'APPROVED');

-- AlterTable
ALTER TABLE "OnboardingIntake" ADD COLUMN     "currentOffer" TEXT,
ADD COLUMN     "customerLocation" TEXT;

-- AlterTable
ALTER TABLE "MairoCampaign" ADD COLUMN     "launchApprovedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StrategyPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "StrategyPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "planJson" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedVersion" INTEGER,
    "approvedSnapshotJson" TEXT,
    "activatedAt" TIMESTAMP(3),
    "campaignDraftId" TEXT,
    "campaignId" TEXT,
    "launchedAt" TIMESTAMP(3),
    "welcomedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyPlanRevision" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "request" TEXT,
    "summary" TEXT NOT NULL,
    "changesJson" TEXT NOT NULL,
    "planJson" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StrategyPlanRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StrategyPlan_organizationId_key" ON "StrategyPlan"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StrategyPlanRevision_planId_version_key" ON "StrategyPlanRevision"("planId", "version");

-- AddForeignKey
ALTER TABLE "StrategyPlan" ADD CONSTRAINT "StrategyPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyPlanRevision" ADD CONSTRAINT "StrategyPlanRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "StrategyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
