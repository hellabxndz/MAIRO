-- CreateEnum
CREATE TYPE "CampaignAdKind" AS ENUM ('IMAGE', 'VIDEO', 'EXISTING_AD');

-- AlterTable
ALTER TABLE "PlatformCampaign" ADD COLUMN     "extraExternalAdIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "CampaignAd" (
    "id" TEXT NOT NULL,
    "mairoCampaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "CampaignAdKind" NOT NULL,
    "creativeRequestId" TEXT,
    "videoUrl" TEXT,
    "videoPosterUrl" TEXT,
    "metaVideoId" TEXT,
    "sourceAdId" TEXT,
    "sourceAdName" TEXT,
    "headline" TEXT,
    "primaryText" TEXT,
    "callToAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignAd_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignAd_mairoCampaignId_idx" ON "CampaignAd"("mairoCampaignId");

-- AddForeignKey
ALTER TABLE "CampaignAd" ADD CONSTRAINT "CampaignAd_mairoCampaignId_fkey" FOREIGN KEY ("mairoCampaignId") REFERENCES "MairoCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
