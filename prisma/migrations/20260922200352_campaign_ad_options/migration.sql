-- CreateEnum
CREATE TYPE "CampaignAdSource" AS ENUM ('CREATIVE', 'FACEBOOK_POST', 'INSTAGRAM_POST');

-- CreateEnum
CREATE TYPE "MetaPlacement" AS ENUM ('FACEBOOK_FEED', 'INSTAGRAM_FEED', 'STORIES', 'REELS');

-- AlterTable
ALTER TABLE "MairoCampaign" ADD COLUMN     "adSource" "CampaignAdSource",
ADD COLUMN     "boostInstagramMediaId" TEXT,
ADD COLUMN     "boostPostId" TEXT,
ADD COLUMN     "placements" "MetaPlacement"[] DEFAULT ARRAY[]::"MetaPlacement"[];
