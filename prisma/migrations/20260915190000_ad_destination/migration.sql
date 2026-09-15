-- Where an ad sends the person who clicks it.
--
-- Additive and defaulted, so every existing organization and campaign keeps
-- behaving exactly as it did: WEBSITE with no explicit URL falls back to the
-- organization's website, which is what the launch path already did.

CREATE TYPE "AdDestination" AS ENUM ('WEBSITE', 'PHONE_CALL');

ALTER TABLE "Organization"
  ADD COLUMN "defaultDestination" "AdDestination" NOT NULL DEFAULT 'WEBSITE',
  ADD COLUMN "phone" TEXT;

ALTER TABLE "MairoCampaign"
  ADD COLUMN "destinationType" "AdDestination" NOT NULL DEFAULT 'WEBSITE',
  ADD COLUMN "destinationUrl" TEXT,
  ADD COLUMN "destinationPhone" TEXT;
