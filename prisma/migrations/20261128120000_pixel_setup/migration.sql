-- Meta Pixel setup: the owner's choice (use / declined), how leads are
-- measured otherwise, and which ad account and website a chosen pixel was
-- confirmed for. Additive only: nullable columns, no row changes.

ALTER TABLE "TrackingProfile" ADD COLUMN "pixelDecision" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "pixelDecidedAt" TIMESTAMP(3);
ALTER TABLE "TrackingProfile" ADD COLUMN "pixelDecidedById" TEXT;
ALTER TABLE "TrackingProfile" ADD COLUMN "leadMeasurement" TEXT;

ALTER TABLE "TrackingPixel" ADD COLUMN "metaAdAccountId" TEXT;
ALTER TABLE "TrackingPixel" ADD COLUMN "websiteDomain" TEXT;
ALTER TABLE "TrackingPixel" ADD COLUMN "websiteConfirmedAt" TIMESTAMP(3);
ALTER TABLE "TrackingPixel" ADD COLUMN "accessLostAt" TIMESTAMP(3);

-- A business that already chose a pixel has answered the question.
UPDATE "TrackingProfile" tp SET "pixelDecision" = 'use', "pixelDecidedAt" = px."selectedAt"
FROM "TrackingPixel" px
WHERE px."organizationId" = tp."organizationId" AND px."platform" = 'META' AND tp."pixelDecision" IS NULL;
