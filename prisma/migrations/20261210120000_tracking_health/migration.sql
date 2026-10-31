-- Tracking health: MAIRO re-checks each business's Pixel every day and keeps
-- the result, so the owner hears when tracking starts or stops working.
--
-- Additive only: two notification kinds, and five nullable columns on the
-- existing TrackingProfile. Nothing existing changes behaviour; every row
-- starts with no health recorded until the first check runs.

ALTER TYPE "NotificationKind" ADD VALUE 'TRACKING_WORKING';
ALTER TYPE "NotificationKind" ADD VALUE 'TRACKING_PROBLEM';

ALTER TABLE "TrackingProfile" ADD COLUMN "healthStatus" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "healthHeadline" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "healthDetail" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "healthCheckedAt" TIMESTAMP(3);
ALTER TABLE "TrackingProfile" ADD COLUMN "healthChangedAt" TIMESTAMP(3);

-- Pausing Autopilot keeps the level the owner chose, so resuming puts it
-- back exactly. While pausedAt is set MAIRO makes no change on its own —
-- effectiveLevel() and runAutoOptimize() both read it. Nullable, so every
-- existing account is unpaused.
ALTER TABLE "AutoOptimizeSettings" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "AutoOptimizeSettings" ADD COLUMN "pausedById" TEXT;
