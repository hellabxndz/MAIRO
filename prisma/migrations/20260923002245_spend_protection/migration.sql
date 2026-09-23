-- CreateEnum
CREATE TYPE "ProtectionAction" AS ENUM ('NOTIFY', 'PAUSE');

-- CreateTable
CREATE TABLE "SpendProtection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stopLossCents" INTEGER DEFAULT 5000,
    "stopLossAction" "ProtectionAction" NOT NULL DEFAULT 'NOTIFY',
    "monthlyCapCents" INTEGER,
    "warnAtPercent" INTEGER NOT NULL DEFAULT 80,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpendProtection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProtectionEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "mairoCampaignId" TEXT,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "amountCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProtectionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpendProtection_organizationId_key" ON "SpendProtection"("organizationId");

-- CreateIndex
CREATE INDEX "ProtectionEvent_organizationId_createdAt_idx" ON "ProtectionEvent"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "ProtectionEvent_mairoCampaignId_idx" ON "ProtectionEvent"("mairoCampaignId");

-- AddForeignKey
ALTER TABLE "SpendProtection" ADD CONSTRAINT "SpendProtection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProtectionEvent" ADD CONSTRAINT "ProtectionEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
