-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'BOOKED', 'WON', 'LOST', 'SPAM');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('PULSE', 'PROBLEM', 'IDEA', 'CONFUSING', 'CANCELLATION');

-- CreateEnum
CREATE TYPE "FeedbackEasier" AS ENUM ('YES', 'SOMEWHAT', 'NO');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SupportChannel" AS ENUM ('CALL', 'EMAIL', 'CHAT', 'MEETING', 'NOTE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "valueCents" INTEGER;

-- AlterTable
ALTER TABLE "MairoDecision" ADD COLUMN     "applyingAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "caseStudyConsentAt" TIMESTAMP(3),
ADD COLUMN     "foundingCustomer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "foundingSince" TIMESTAMP(3),
ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CustomerFeedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "FeedbackKind" NOT NULL,
    "easier" "FeedbackEasier",
    "text" TEXT,
    "page" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "CustomerFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT,
    "channel" "SupportChannel" NOT NULL DEFAULT 'NOTE',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerFeedback_organizationId_createdAt_idx" ON "CustomerFeedback"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerFeedback_status_createdAt_idx" ON "CustomerFeedback"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportNote_organizationId_createdAt_idx" ON "SupportNote"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomerFeedback" ADD CONSTRAINT "CustomerFeedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportNote" ADD CONSTRAINT "SupportNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

