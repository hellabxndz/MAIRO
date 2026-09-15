-- Meta's own instant form as an alternative to the page MAIRO hosts.
--
-- Additive and defaulted: every existing lead-form campaign keeps pointing at
-- the hosted page, which is the only thing that works until App Review clears
-- leads_retrieval and pages_manage_ads.

CREATE TYPE "LeadFormDelivery" AS ENUM ('HOSTED_PAGE', 'META_NATIVE');

ALTER TABLE "MairoCampaign"
  ADD COLUMN "leadFormDelivery" "LeadFormDelivery" NOT NULL DEFAULT 'HOSTED_PAGE';

-- When MAIRO last pulled submissions off Meta, so a sync only asks for what is
-- new rather than re-reading a form's whole history every time.
ALTER TABLE "LeadForm"
  ADD COLUMN "metaSyncedAt" TIMESTAMP(3),
  ADD COLUMN "metaError" TEXT;

-- Meta's own id for a submission, so re-running a sync cannot store it twice.
ALTER TABLE "Lead" ADD COLUMN "externalLeadId" TEXT;
CREATE UNIQUE INDEX "Lead_externalLeadId_key" ON "Lead"("externalLeadId");
