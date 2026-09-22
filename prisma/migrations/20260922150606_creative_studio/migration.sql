-- CreateEnum
CREATE TYPE "CreativeStudioSource" AS ENUM ('PROMPT', 'PRODUCT_UPLOAD', 'OWN_UPLOAD');

-- CreateEnum
CREATE TYPE "CreativeStudioStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "CreativeStudioActionKind" AS ENUM ('GENERATE', 'EDIT', 'VARIATION', 'UPLOAD');

-- CreateEnum
CREATE TYPE "CreativeFormat" AS ENUM ('SQUARE', 'PORTRAIT', 'STORY', 'LANDSCAPE');

-- CreateEnum
CREATE TYPE "CreativeStylePreset" AS ENUM ('LUXURY_STUDIO', 'STREETWEAR', 'MINIMALIST', 'LIFESTYLE', 'CINEMATIC', 'PRODUCT_PHOTOGRAPHY', 'URBAN', 'HIGH_FASHION', 'FITNESS', 'FOOD_PHOTOGRAPHY', 'TECHNOLOGY', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CreativeCreditStatus" AS ENUM ('RESERVED', 'CONFIRMED');

-- CreateTable
CREATE TABLE "CreativeStudioAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "source" "CreativeStudioSource" NOT NULL,
    "preset" "CreativeStylePreset",
    "format" "CreativeFormat" NOT NULL DEFAULT 'SQUARE',
    "variationGroupId" TEXT,
    "sourceImageUrl" TEXT,
    "linkedCreativeRequestId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeStudioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeStudioVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "CreativeStudioActionKind" NOT NULL,
    "status" "CreativeStudioStatus" NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "instruction" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT,
    "rawImageUrl" TEXT,
    "imageUrl" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "creditsSpent" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeStudioVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeCreditLedger" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "kind" "CreativeStudioActionKind" NOT NULL,
    "credits" INTEGER NOT NULL,
    "status" "CreativeCreditStatus" NOT NULL DEFAULT 'RESERVED',
    "assetId" TEXT,
    "versionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeCreditPricing" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "standardCost" INTEGER NOT NULL DEFAULT 5,
    "premiumCost" INTEGER NOT NULL DEFAULT 15,
    "editCost" INTEGER NOT NULL DEFAULT 5,
    "variationCost" INTEGER NOT NULL DEFAULT 4,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreativeCreditPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreativeStudioAsset_organizationId_archivedAt_updatedAt_idx" ON "CreativeStudioAsset"("organizationId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "CreativeStudioAsset_organizationId_variationGroupId_idx" ON "CreativeStudioAsset"("organizationId", "variationGroupId");

-- CreateIndex
CREATE INDEX "CreativeStudioVersion_assetId_idx" ON "CreativeStudioVersion"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeStudioVersion_assetId_version_key" ON "CreativeStudioVersion"("assetId", "version");

-- CreateIndex
CREATE INDEX "CreativeCreditLedger_organizationId_month_status_idx" ON "CreativeCreditLedger"("organizationId", "month", "status");

-- AddForeignKey
ALTER TABLE "CreativeStudioAsset" ADD CONSTRAINT "CreativeStudioAsset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeStudioVersion" ADD CONSTRAINT "CreativeStudioVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "CreativeStudioAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeCreditLedger" ADD CONSTRAINT "CreativeCreditLedger_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
