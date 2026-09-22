-- CreateEnum
CREATE TYPE "SpecialAdCategory" AS ENUM ('HOUSING', 'EMPLOYMENT', 'FINANCIAL_PRODUCTS_SERVICES', 'ISSUES_ELECTIONS_POLITICS');

-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('DAILY', 'LIFETIME');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AdDestination" ADD VALUE 'POST_ENGAGEMENT';
ALTER TYPE "AdDestination" ADD VALUE 'APP';

-- AlterEnum
ALTER TYPE "AdGoal" ADD VALUE 'ENGAGEMENT';

-- AlterTable
ALTER TABLE "MairoCampaign" ADD COLUMN     "advantageAudience" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "budgetType" "BudgetType" NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "lifetimeBudgetCents" INTEGER,
ADD COLUMN     "metaAppId" TEXT,
ADD COLUMN     "promotes" TEXT,
ADD COLUMN     "specialAdCategory" "SpecialAdCategory";

-- AlterTable
ALTER TABLE "OnboardingIntake" ADD COLUMN     "differentiator" TEXT,
ADD COLUMN     "offering" TEXT;

-- AlterTable
ALTER TABLE "PlatformCampaign" ADD COLUMN     "lifetimeBudgetCents" INTEGER;

-- CreateTable
CREATE TABLE "CampaignDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "service" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignDraft_organizationId_updatedAt_idx" ON "CampaignDraft"("organizationId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CampaignDraft" ADD CONSTRAINT "CampaignDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
