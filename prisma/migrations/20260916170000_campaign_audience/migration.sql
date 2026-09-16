-- Who a campaign is shown to.
--
-- Additive and defaulted. Every campaign before this targeted the whole United
-- States at every age, because nothing asked — the defaults here reproduce that
-- for rows already in the table, and the form now asks.

ALTER TABLE "MairoCampaign"
  ADD COLUMN "geoKey"    TEXT,
  ADD COLUMN "geoLabel"  TEXT,
  ADD COLUMN "geoRadius" INTEGER,
  ADD COLUMN "ageMin"    INTEGER NOT NULL DEFAULT 18,
  ADD COLUMN "ageMax"    INTEGER NOT NULL DEFAULT 65,
  -- Meta's own numbering: 0 everyone, 1 men, 2 women.
  ADD COLUMN "genders"   INTEGER NOT NULL DEFAULT 0;
