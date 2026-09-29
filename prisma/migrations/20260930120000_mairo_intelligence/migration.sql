-- CreateEnum
CREATE TYPE "BriefFrequency" AS ENUM ('DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "InsightCategory" AS ENUM ('PERFORMANCE', 'CREATIVE', 'AUDIENCE', 'BUDGET', 'WEBSITE', 'TRACKING', 'PLATFORM');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('INFO', 'OPPORTUNITY', 'ATTENTION', 'URGENT');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "briefFrequency" "BriefFrequency" NOT NULL DEFAULT 'DAILY';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "costCents" INTEGER;

-- CreateTable
CREATE TABLE "MairoInsight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mairoCampaignId" TEXT,
    "campaignName" TEXT,
    "platform" "AdPlatform",
    "type" TEXT NOT NULL,
    "category" "InsightCategory" NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "confidence" "DecisionConfidence" NOT NULL,
    "metric" TEXT,
    "previousValue" TEXT,
    "currentValue" TEXT,
    "title" TEXT NOT NULL,
    "happened" TEXT NOT NULL,
    "happenedAdvanced" TEXT NOT NULL,
    "whyItMatters" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ifApproved" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "basedOnJson" TEXT NOT NULL,
    "actionType" TEXT,
    "actionLabel" TEXT,
    "actionHref" TEXT,
    "radarArea" TEXT,
    "earlyWarning" BOOLEAN NOT NULL DEFAULT false,
    "decisionDedupeKey" TEXT,
    "status" "InsightStatus" NOT NULL DEFAULT 'OPEN',
    "dedupeKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MairoInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntelligenceReport" (
    "organizationId" TEXT NOT NULL,
    "reportJson" TEXT NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntelligenceReport_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "ProfitSettings" (
    "organizationId" TEXT NOT NULL,
    "averageMarginPercent" DOUBLE PRECISION,
    "sellingPriceCents" INTEGER,
    "productCostCents" INTEGER,
    "averageOrderValueCents" INTEGER,
    "shippingCostCents" INTEGER NOT NULL DEFAULT 0,
    "paymentFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 2.9,
    "paymentFeeFixedCents" INTEGER NOT NULL DEFAULT 30,
    "otherMonthlyCostsCents" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfitSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE INDEX "MairoInsight_organizationId_status_idx" ON "MairoInsight"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MairoInsight_mairoCampaignId_idx" ON "MairoInsight"("mairoCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "MairoInsight_organizationId_dedupeKey_key" ON "MairoInsight"("organizationId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "MairoInsight" ADD CONSTRAINT "MairoInsight_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntelligenceReport" ADD CONSTRAINT "IntelligenceReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfitSettings" ADD CONSTRAINT "ProfitSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
