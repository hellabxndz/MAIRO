-- Meta reliability: check freshness, reviewed impact, operation health.

ALTER TABLE "PlatformSource" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
-- A check that left no error was a successful one.
UPDATE "PlatformSource" SET "lastSuccessAt" = "lastCheckedAt" WHERE "lastError" IS NULL AND "lastCheckedAt" IS NOT NULL;

ALTER TABLE "PlatformUpdate" ADD COLUMN "impact" TEXT,
ADD COLUMN "impactNote" TEXT,
ADD COLUMN "impactReviewedAt" TIMESTAMP(3),
ADD COLUMN "impactReviewedById" TEXT;

CREATE TABLE "MetaOperationStat" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "hour" TIMESTAMP(3) NOT NULL,
    "ok" INTEGER NOT NULL DEFAULT 0,
    "metaDown" INTEGER NOT NULL DEFAULT 0,
    "rateLimited" INTEGER NOT NULL DEFAULT 0,
    "account" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MetaOperationStat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MetaOperationStat_operation_hour_key" ON "MetaOperationStat"("operation", "hour");
CREATE INDEX "MetaOperationStat_hour_idx" ON "MetaOperationStat"("hour");
