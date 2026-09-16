-- Where a sales ad's pictures and words come from, asked after payment.
--
-- Additive and defaulted: every existing business keeps MAIRO_CREATES, which
-- is the pipeline that has been running all along.

CREATE TYPE "SalesAdSource" AS ENUM ('MAIRO_CREATES', 'EXISTING_POST', 'CATALOG');

ALTER TABLE "Organization"
  ADD COLUMN "salesAdSource" "SalesAdSource" NOT NULL DEFAULT 'MAIRO_CREATES',
  -- Meta's own id for a published post, in its {page-id}_{post-id} form.
  ADD COLUMN "boostPostId" TEXT,
  ADD COLUMN "productCatalogId" TEXT;
