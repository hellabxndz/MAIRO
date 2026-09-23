-- AlterTable
ALTER TABLE "PlatformCampaign" ADD COLUMN     "adReviewAction" TEXT,
ADD COLUMN     "adReviewCheckedAt" TIMESTAMP(3),
ADD COLUMN     "adReviewExplanation" TEXT,
ADD COLUMN     "adReviewState" TEXT;
