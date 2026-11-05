-- Additive only: one nullable column and one new table.

-- What a launch approval covered (lib/campaigns/approval.ts).
ALTER TABLE "MairoCampaign" ADD COLUMN "launchApprovalHash" TEXT;

-- Requests that must run at most once.
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "resultId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "IdempotencyKey_organizationId_createdAt_idx" ON "IdempotencyKey"("organizationId", "createdAt");
