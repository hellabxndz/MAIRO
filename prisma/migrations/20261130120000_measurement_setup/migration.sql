-- Guided tracking setup: what the owner chose to measure (a fixed list of
-- goal ids, validated in src/lib/tracking/measurement.ts), the website
-- platform they confirmed, and whether they put setup off for now.
-- Additive only: nullable columns, no row changes.

ALTER TABLE "TrackingProfile" ADD COLUMN "measurementGoals" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "measurementGoalsSavedAt" TIMESTAMP(3);
ALTER TABLE "TrackingProfile" ADD COLUMN "measurementGoalsById" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "sitePlatform" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "sitePlatformConfirmedAt" TIMESTAMP(3);
ALTER TABLE "TrackingProfile" ADD COLUMN "setupDeferredAt" TIMESTAMP(3);
