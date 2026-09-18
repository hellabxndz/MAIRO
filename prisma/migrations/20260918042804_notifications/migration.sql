-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('CAMPAIGN_LIVE', 'NEEDS_ATTENTION', 'BUDGET_OPPORTUNITY', 'CREATIVE_FATIGUE', 'CREATIVES_READY', 'MONTHLY_REPORT', 'PAYMENT_ISSUE', 'ACCOUNT_DISCONNECTED', 'MAIRO_ACTED');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'OPPORTUNITY', 'WARNING');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionLabel" TEXT,
    "actionHref" TEXT,
    "mairoCampaignId" TEXT,
    "evidenceJson" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_organizationId_createdAt_idx" ON "Notification"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_organizationId_dedupeKey_key" ON "Notification"("organizationId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
