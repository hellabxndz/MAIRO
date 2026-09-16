-- The catalogue MAIRO reads off the business's own website.
--
-- Not a catalogue they build in Meta Business Manager: almost no small shop has
-- one, and the shop already lists what it sells on a page it maintains.

CREATE TABLE "Product" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  -- The shop's own id where the site gives one, else the product URL. This is
  -- what makes re-reading a shop an update rather than a second copy.
  "externalId"     TEXT NOT NULL,
  "title"          TEXT NOT NULL,
  "description"    TEXT,
  -- Integer cents. Null is a real state — "call for a quote" is not free.
  "priceCents"     INTEGER,
  "currency"       TEXT NOT NULL DEFAULT 'USD',
  "imageUrl"       TEXT,
  "url"            TEXT NOT NULL,
  "available"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product_organizationId_externalId_key" ON "Product"("organizationId", "externalId");
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Organization" ADD COLUMN "catalogScannedAt" TIMESTAMP(3);
