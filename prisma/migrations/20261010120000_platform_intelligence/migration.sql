-- AlterTable
ALTER TABLE "MairoCampaign" ADD COLUMN     "metaFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PlatformSource" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "authority" TEXT NOT NULL DEFAULT 'OFFICIAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastChangedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSourceSnapshot" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformSourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUpdate" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "sourceId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "changeType" TEXT NOT NULL,
    "areas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "urgency" TEXT NOT NULL DEFAULT 'LOW',
    "risk" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "compatibility" TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
    "status" TEXT NOT NULL DEFAULT 'DETECTED',
    "analysisJson" TEXT,
    "analyzedBy" TEXT,
    "proposalJson" TEXT,
    "featureKey" TEXT,
    "historyJson" TEXT NOT NULL DEFAULT '[]',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeature" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "featureKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "apiVersion" TEXT,
    "objectives" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "optimizationGoals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "placements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creativeFormats" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accountType" TEXT,
    "availability" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "betaStatus" TEXT,
    "regionRestrictions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deprecated" BOOLEAN NOT NULL DEFAULT false,
    "deprecationDate" TIMESTAMP(3),
    "replacementKey" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "sourceUrl" TEXT,
    "mairoSupport" TEXT NOT NULL DEFAULT 'NOT_SUPPORTED',
    "mairoMapping" TEXT NOT NULL DEFAULT '{}',
    "breakingRisk" TEXT NOT NULL DEFAULT 'LOW',
    "goalFit" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aiCapability" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformKnowledge" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "topic" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dataJson" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" TEXT NOT NULL DEFAULT 'MEDIUM',
    "state" TEXT NOT NULL DEFAULT 'VALIDATED',
    "verifiedAt" TIMESTAMP(3),
    "changeNote" TEXT,
    "updateId" TEXT,
    "supersededAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeatureFlag" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "key" TEXT NOT NULL,
    "featureKey" TEXT,
    "description" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'OFF',
    "internalOrgIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "selectedOrgIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedBy" TEXT,
    "historyJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformApiVersion" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "version" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "retiresAt" TIMESTAMP(3),
    "retiresSource" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "migrationStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "breakingNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformApiVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformApiError" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "signature" TEXT NOT NULL,
    "code" INTEGER,
    "subcode" INTEGER,
    "message" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "apiVersion" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "accountKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flaggedAt" TIMESTAMP(3),
    "updateId" TEXT,

    CONSTRAINT "PlatformApiError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformTestRun" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "mode" TEXT NOT NULL,
    "apiVersion" TEXT NOT NULL,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "criticalFailed" INTEGER NOT NULL DEFAULT 0,
    "resultsJson" TEXT NOT NULL,
    "updateId" TEXT,
    "ranBy" TEXT,
    "notes" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformTestRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformReleaseLog" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "version" TEXT NOT NULL,
    "metaChanges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mairoChanges" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformReleaseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAccountCapability" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "organizationId" TEXT NOT NULL,
    "adAccountId" TEXT,
    "country" TEXT,
    "currency" TEXT,
    "accountStatus" INTEGER,
    "capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "error" TEXT,

    CONSTRAINT "PlatformAccountCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeatureOptIn" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "organizationId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFeatureOptIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformAdminAlert" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'META',
    "dedupeKey" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformAdminAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformSource_key_key" ON "PlatformSource"("key");

-- CreateIndex
CREATE INDEX "PlatformSourceSnapshot_sourceId_fetchedAt_idx" ON "PlatformSourceSnapshot"("sourceId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUpdate_dedupeKey_key" ON "PlatformUpdate"("dedupeKey");

-- CreateIndex
CREATE INDEX "PlatformUpdate_platform_status_idx" ON "PlatformUpdate"("platform", "status");

-- CreateIndex
CREATE INDEX "PlatformUpdate_platform_urgency_idx" ON "PlatformUpdate"("platform", "urgency");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeature_platform_featureKey_key" ON "PlatformFeature"("platform", "featureKey");

-- CreateIndex
CREATE INDEX "PlatformKnowledge_platform_topic_key_idx" ON "PlatformKnowledge"("platform", "topic", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformKnowledge_platform_topic_key_version_key" ON "PlatformKnowledge"("platform", "topic", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeatureFlag_key_key" ON "PlatformFeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformApiVersion_platform_version_key" ON "PlatformApiVersion"("platform", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformApiError_signature_key" ON "PlatformApiError"("signature");

-- CreateIndex
CREATE INDEX "PlatformApiError_platform_lastAt_idx" ON "PlatformApiError"("platform", "lastAt");

-- CreateIndex
CREATE INDEX "PlatformTestRun_platform_startedAt_idx" ON "PlatformTestRun"("platform", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformReleaseLog_platform_version_key" ON "PlatformReleaseLog"("platform", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAccountCapability_platform_organizationId_key" ON "PlatformAccountCapability"("platform", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFeatureOptIn_platform_organizationId_featureKey_key" ON "PlatformFeatureOptIn"("platform", "organizationId", "featureKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdminAlert_dedupeKey_key" ON "PlatformAdminAlert"("dedupeKey");

-- CreateIndex
CREATE INDEX "PlatformAdminAlert_platform_readAt_idx" ON "PlatformAdminAlert"("platform", "readAt");

-- AddForeignKey
ALTER TABLE "PlatformSourceSnapshot" ADD CONSTRAINT "PlatformSourceSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PlatformSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformUpdate" ADD CONSTRAINT "PlatformUpdate_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PlatformSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformAccountCapability" ADD CONSTRAINT "PlatformAccountCapability_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformFeatureOptIn" ADD CONSTRAINT "PlatformFeatureOptIn_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
