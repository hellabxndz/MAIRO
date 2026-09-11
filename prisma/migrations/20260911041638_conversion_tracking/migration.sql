-- CreateEnum
CREATE TYPE "PixelStatus" AS ENUM ('PENDING', 'ACTIVE', 'NO_EVENTS', 'ERROR');

-- CreateEnum
CREATE TYPE "PixelOrigin" AS ENUM ('CREATED_BY_MAIRO', 'EXISTING');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('SHOPIFY', 'WOOCOMMERCE', 'STRIPE', 'CUSTOM', 'MANUAL');

-- CreateEnum
CREATE TYPE "ForwardStatus" AS ENUM ('PENDING', 'SENT', 'ACCEPTED_WITH_WARNINGS', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "TrackingPixel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "externalPixelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" "PixelOrigin" NOT NULL DEFAULT 'CREATED_BY_MAIRO',
    "status" "PixelStatus" NOT NULL DEFAULT 'PENDING',
    "lastFiredAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingPixel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" "OrderSource" NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL DEFAULT 'Purchase',
    "valueCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "hashedEmail" TEXT,
    "hashedPhone" TEXT,
    "country" TEXT,
    "clientIp" TEXT,
    "userAgent" TEXT,
    "fbclid" TEXT,
    "ttclid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionForward" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "status" "ForwardStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "matchedFields" INTEGER,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ConversionForward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreIngest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "shopifySecret" TEXT,
    "lastReceivedAt" TIMESTAMP(3),
    "receivedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreIngest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrackingPixel_organizationId_idx" ON "TrackingPixel"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TrackingPixel_organizationId_platform_key" ON "TrackingPixel"("organizationId", "platform");

-- CreateIndex
CREATE INDEX "ConversionEvent_organizationId_occurredAt_idx" ON "ConversionEvent"("organizationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionEvent_organizationId_externalOrderId_key" ON "ConversionEvent"("organizationId", "externalOrderId");

-- CreateIndex
CREATE INDEX "ConversionForward_platform_status_idx" ON "ConversionForward"("platform", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ConversionForward_eventId_platform_key" ON "ConversionForward"("eventId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "StoreIngest_organizationId_key" ON "StoreIngest"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "StoreIngest_token_key" ON "StoreIngest"("token");

-- AddForeignKey
ALTER TABLE "TrackingPixel" ADD CONSTRAINT "TrackingPixel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionEvent" ADD CONSTRAINT "ConversionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionForward" ADD CONSTRAINT "ConversionForward_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "ConversionEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreIngest" ADD CONSTRAINT "StoreIngest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
