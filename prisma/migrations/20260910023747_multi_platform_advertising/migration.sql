-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('META', 'TIKTOK', 'GOOGLE', 'SNAPCHAT', 'PINTEREST', 'LINKEDIN');

-- CreateEnum
CREATE TYPE "PlatformConnectionStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'TOKEN_EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "CreativeAspect" AS ENUM ('SQUARE_1_1', 'PORTRAIT_4_5', 'VERTICAL_9_16', 'LANDSCAPE_16_9');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PENDING', 'APPLIED', 'DISMISSED', 'EXPIRED');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "mairoCampaignId" TEXT;

-- CreateTable
CREATE TABLE "PlatformConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "externalAccountName" TEXT,
    "externalBusinessId" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "PlatformConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MairoCampaign" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" "AdGoal" NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalDailyBudgetCents" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "tiktokGrowthMode" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MairoCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCampaign" (
    "id" TEXT NOT NULL,
    "mairoCampaignId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "connectionId" TEXT,
    "externalCampaignId" TEXT,
    "budgetPercent" INTEGER NOT NULL,
    "dailyBudgetCents" INTEGER NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformCreative" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mairoCampaignId" TEXT,
    "platformCampaignId" TEXT,
    "platform" "AdPlatform" NOT NULL,
    "creativeType" "CreativeType" NOT NULL,
    "aspectRatio" "CreativeAspect" NOT NULL,
    "hook" TEXT,
    "primaryText" TEXT,
    "headline" TEXT,
    "cta" TEXT,
    "mediaUrl" TEXT,
    "performanceData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformCreative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptimizationRecommendation" (
    "id" TEXT NOT NULL,
    "mairoCampaignId" TEXT NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "rationale" TEXT NOT NULL,
    "proposalJson" TEXT NOT NULL,
    "evidenceJson" TEXT,
    "appliedAt" TIMESTAMP(3),
    "appliedById" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OptimizationRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoOptimizeSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxDailyBudgetCents" INTEGER NOT NULL,
    "maxDailyIncreasePercent" INTEGER NOT NULL DEFAULT 20,
    "minRoas" DOUBLE PRECISION,
    "maxCpaCents" INTEGER,
    "platforms" "AdPlatform"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoOptimizeSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanConfig" (
    "tier" "SubscriptionTier" NOT NULL,
    "name" TEXT NOT NULL,
    "priceMonthly" INTEGER NOT NULL,
    "tagline" TEXT NOT NULL,
    "spendGuidance" TEXT NOT NULL DEFAULT '',
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "featuresJson" TEXT NOT NULL,
    "entitlementsJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("tier")
);

-- CreateIndex
CREATE INDEX "PlatformConnection_organizationId_idx" ON "PlatformConnection"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConnection_organizationId_platform_key" ON "PlatformConnection"("organizationId", "platform");

-- CreateIndex
CREATE INDEX "MairoCampaign_organizationId_idx" ON "MairoCampaign"("organizationId");

-- CreateIndex
CREATE INDEX "PlatformCampaign_mairoCampaignId_idx" ON "PlatformCampaign"("mairoCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformCampaign_mairoCampaignId_platform_key" ON "PlatformCampaign"("mairoCampaignId", "platform");

-- CreateIndex
CREATE INDEX "PlatformCreative_organizationId_idx" ON "PlatformCreative"("organizationId");

-- CreateIndex
CREATE INDEX "PlatformCreative_mairoCampaignId_idx" ON "PlatformCreative"("mairoCampaignId");

-- CreateIndex
CREATE INDEX "OptimizationRecommendation_mairoCampaignId_idx" ON "OptimizationRecommendation"("mairoCampaignId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoOptimizeSettings_organizationId_key" ON "AutoOptimizeSettings"("organizationId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_mairoCampaignId_fkey" FOREIGN KEY ("mairoCampaignId") REFERENCES "MairoCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformConnection" ADD CONSTRAINT "PlatformConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MairoCampaign" ADD CONSTRAINT "MairoCampaign_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCampaign" ADD CONSTRAINT "PlatformCampaign_mairoCampaignId_fkey" FOREIGN KEY ("mairoCampaignId") REFERENCES "MairoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCampaign" ADD CONSTRAINT "PlatformCampaign_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "PlatformConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCreative" ADD CONSTRAINT "PlatformCreative_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCreative" ADD CONSTRAINT "PlatformCreative_mairoCampaignId_fkey" FOREIGN KEY ("mairoCampaignId") REFERENCES "MairoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformCreative" ADD CONSTRAINT "PlatformCreative_platformCampaignId_fkey" FOREIGN KEY ("platformCampaignId") REFERENCES "PlatformCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptimizationRecommendation" ADD CONSTRAINT "OptimizationRecommendation_mairoCampaignId_fkey" FOREIGN KEY ("mairoCampaignId") REFERENCES "MairoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoOptimizeSettings" ADD CONSTRAINT "AutoOptimizeSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill: adopt every existing Meta campaign into the new structure.
--
-- Before this, a Campaign row *was* the campaign. After it, the customer's
-- campaign is a MairoCampaign and each network's half is a PlatformCampaign,
-- so every existing row needs a parent and a META child or it disappears from
-- the dashboard the moment the new code ships.
--
-- Nothing is moved or deleted here — the Campaign rows stay exactly as they
-- are and gain a pointer to their new parent. If this backfill turns out to
-- have got something wrong, the original data is still sitting there.
--
-- Ids are derived from the campaign's own id rather than generated. That makes
-- the whole thing idempotent: running it twice inserts nothing the second time
-- instead of giving every campaign a second parent.

INSERT INTO "MairoCampaign" (
  id, "organizationId", name, objective, status,
  "totalDailyBudgetCents", "startDate", "endDate", "tiktokGrowthMode",
  "createdAt", "updatedAt"
)
SELECT
  'mc_' || c.id, c."organizationId", c.name, c.objective, c.status,
  c."dailyBudgetCents", c."startDate", c."endDate", false,
  c."createdAt", c."updatedAt"
FROM "Campaign" c
ON CONFLICT (id) DO NOTHING;

-- The whole budget went to Meta, because Meta was the only place to spend it.
INSERT INTO "PlatformCampaign" (
  id, "mairoCampaignId", platform, "connectionId", "externalCampaignId",
  "budgetPercent", "dailyBudgetCents", status, "createdAt", "updatedAt"
)
SELECT
  'pc_' || c.id, 'mc_' || c.id, 'META', NULL, c."metaCampaignId",
  100, c."dailyBudgetCents", c.status, c."createdAt", c."updatedAt"
FROM "Campaign" c
ON CONFLICT (id) DO NOTHING;

UPDATE "Campaign" c
SET "mairoCampaignId" = 'mc_' || c.id
WHERE c."mairoCampaignId" IS NULL;
