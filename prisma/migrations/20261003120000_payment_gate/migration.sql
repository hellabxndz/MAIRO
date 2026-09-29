-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "executionStoppedAt" TIMESTAMP(3),
ADD COLUMN     "executionStoppedReason" TEXT,
ADD COLUMN     "hasPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentRequired" BOOLEAN NOT NULL DEFAULT false;

-- Existing subscribers are treated as having paid, so nothing already
-- running is ever stopped by the "never paid" rule.
UPDATE "Organization" SET "hasPaid" = true WHERE "subscriptionStatus" IN ('active', 'past_due', 'unpaid', 'canceled');

-- Businesses already in the free-plan journey need payment before execution.
UPDATE "Organization" SET "paymentRequired" = true WHERE "id" IN (SELECT "organizationId" FROM "StrategyPlan");
