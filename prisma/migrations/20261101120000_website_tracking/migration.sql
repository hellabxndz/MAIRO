-- AlterTable
ALTER TABLE "TrackingPixel" ADD COLUMN     "ownerBusinessId" TEXT,
ADD COLUMN     "ownerBusinessName" TEXT,
ADD COLUMN     "selectedAt" TIMESTAMP(3),
ADD COLUMN     "selectedById" TEXT;

-- AlterTable
ALTER TABLE "TrackingProfile" ADD COLUMN     "installMarkedAt" TIMESTAMP(3),
ADD COLUMN     "installRoute" TEXT,
ADD COLUMN     "pixelCreateStartedAt" TIMESTAMP(3),
ADD COLUMN     "serverEventsConsent" TEXT NOT NULL DEFAULT 'respect_denied';

-- CreateTable
CREATE TABLE "WebsiteScan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "source" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "finalUrl" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "resultJson" TEXT NOT NULL,
    "pagesRead" INTEGER NOT NULL DEFAULT 0,
    "anonKey" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebsiteScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebsiteFinding" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "lastSeenScanId" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "goneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolUsage" (
    "id" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrackingVerification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "check" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "detail" TEXT,
    "count" INTEGER,
    "windowStart" TIMESTAMP(3),
    "windowEnd" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrackingVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteScan_organizationId_createdAt_idx" ON "WebsiteScan"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WebsiteScan_url_createdAt_idx" ON "WebsiteScan"("url", "createdAt");

-- CreateIndex
CREATE INDEX "WebsiteScan_anonKey_createdAt_idx" ON "WebsiteScan"("anonKey", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteFinding_organizationId_key_key" ON "WebsiteFinding"("organizationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ToolUsage_bucket_key" ON "ToolUsage"("bucket");

-- CreateIndex
CREATE INDEX "ToolUsage_windowStart_idx" ON "ToolUsage"("windowStart");

-- CreateIndex
CREATE INDEX "TrackingVerification_organizationId_check_checkedAt_idx" ON "TrackingVerification"("organizationId", "check", "checkedAt");

-- AddForeignKey
ALTER TABLE "WebsiteScan" ADD CONSTRAINT "WebsiteScan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteFinding" ADD CONSTRAINT "WebsiteFinding_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrackingVerification" ADD CONSTRAINT "TrackingVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

