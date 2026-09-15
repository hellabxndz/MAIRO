-- Forms MAIRO writes and hosts, and the leads they collect.
--
-- Additive: LEAD_FORM joins the existing destination options, and the two new
-- tables start empty. Nothing existing changes behaviour.

ALTER TYPE "AdDestination" ADD VALUE 'LEAD_FORM';

CREATE TYPE "LeadSource" AS ENUM ('MAIRO_FORM', 'META_INSTANT');

CREATE TABLE "LeadForm" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "headline" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "thankYou" TEXT NOT NULL,
  "fieldsJson" TEXT NOT NULL,
  "metaFormId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadForm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeadForm_slug_key" ON "LeadForm"("slug");
CREATE INDEX "LeadForm_organizationId_idx" ON "LeadForm"("organizationId");

ALTER TABLE "LeadForm" ADD CONSTRAINT "LeadForm_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leadFormId" TEXT NOT NULL,
  "source" "LeadSource" NOT NULL DEFAULT 'MAIRO_FORM',
  "answersJson" TEXT NOT NULL,
  "hashedEmail" TEXT,
  "hashedPhone" TEXT,
  "clickId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Lead_organizationId_createdAt_idx" ON "Lead"("organizationId", "createdAt");
CREATE INDEX "Lead_leadFormId_idx" ON "Lead"("leadFormId");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_leadFormId_fkey"
  FOREIGN KEY ("leadFormId") REFERENCES "LeadForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
