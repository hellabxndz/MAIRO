-- AlterTable
ALTER TABLE "CreativeRequest" ADD COLUMN     "marketingObjective" TEXT,
ADD COLUMN     "whyText" TEXT;

-- AlterTable
ALTER TABLE "MairoCampaign" ADD COLUMN     "marketingObjective" TEXT,
ADD COLUMN     "missionId" TEXT,
ADD COLUMN     "whyText" TEXT;

-- AlterTable
ALTER TABLE "InstagramPost" ADD COLUMN     "marketingObjective" TEXT;

-- CreateTable
CREATE TABLE "MarketingMission" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROPOSED',
    "primaryGoal" TEXT NOT NULL,
    "secondaryGoal" TEXT,
    "request" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "planJson" TEXT NOT NULL,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "campaignDraftId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingMission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingMission_organizationId_status_idx" ON "MarketingMission"("organizationId", "status");

-- CreateIndex
CREATE INDEX "MissionNote_organizationId_active_idx" ON "MissionNote"("organizationId", "active");

-- AddForeignKey
ALTER TABLE "MarketingMission" ADD CONSTRAINT "MarketingMission_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionNote" ADD CONSTRAINT "MissionNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
