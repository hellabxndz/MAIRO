-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "assistantName" TEXT NOT NULL DEFAULT 'Alex';

-- CreateTable
CREATE TABLE "SmsPreference" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "verifyCode" TEXT,
    "verifyExpiresAt" TIMESTAMP(3),
    "consentAt" TIMESTAMP(3),
    "consentText" TEXT,
    "optedOutAt" TIMESTAMP(3),
    "onCampaignLive" BOOLEAN NOT NULL DEFAULT true,
    "onNeedsAttention" BOOLEAN NOT NULL DEFAULT true,
    "onWeeklySummary" BOOLEAN NOT NULL DEFAULT false,
    "onBudgetChange" BOOLEAN NOT NULL DEFAULT false,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsPreference_organizationId_key" ON "SmsPreference"("organizationId");

-- AddForeignKey
ALTER TABLE "SmsPreference" ADD CONSTRAINT "SmsPreference_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
