-- CreateEnum
CREATE TYPE "ManagedSetupStatus" AS ENUM ('REQUESTED', 'IN_PROGRESS', 'NEEDS_CUSTOMER', 'READY', 'DECLINED');

-- CreateEnum
CREATE TYPE "TikTokPostStatus" AS ENUM ('DRAFT', 'UPLOADING', 'PROCESSING', 'PUBLISHED', 'IN_TIKTOK_DRAFTS', 'FAILED');

-- CreateEnum
CREATE TYPE "TikTokPostMode" AS ENUM ('DIRECT_POST', 'INBOX');

-- CreateTable
CREATE TABLE "ManagedAccountSetup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "status" "ManagedSetupStatus" NOT NULL DEFAULT 'REQUESTED',
    "preferredHandle" TEXT,
    "alternateHandles" TEXT,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "displayName" TEXT NOT NULL,
    "category" TEXT,
    "bio" TEXT,
    "websiteUrl" TEXT,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "createdHandle" TEXT,
    "handoffUrl" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManagedAccountSetup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TikTokPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creativeRequestId" TEXT,
    "caption" TEXT NOT NULL,
    "privacyLevel" TEXT NOT NULL DEFAULT 'SELF_ONLY',
    "mode" "TikTokPostMode" NOT NULL DEFAULT 'INBOX',
    "status" "TikTokPostStatus" NOT NULL DEFAULT 'DRAFT',
    "publishId" TEXT,
    "postUrl" TEXT,
    "error" TEXT,
    "sourceUrl" TEXT,
    "durationSeconds" INTEGER,
    "sizeBytes" INTEGER,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManagedAccountSetup_organizationId_platform_idx" ON "ManagedAccountSetup"("organizationId", "platform");

-- CreateIndex
CREATE INDEX "ManagedAccountSetup_status_idx" ON "ManagedAccountSetup"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TikTokPost_publishId_key" ON "TikTokPost"("publishId");

-- CreateIndex
CREATE INDEX "TikTokPost_organizationId_status_idx" ON "TikTokPost"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "ManagedAccountSetup" ADD CONSTRAINT "ManagedAccountSetup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokPost" ADD CONSTRAINT "TikTokPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TikTokPost" ADD CONSTRAINT "TikTokPost_creativeRequestId_fkey" FOREIGN KEY ("creativeRequestId") REFERENCES "CreativeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
