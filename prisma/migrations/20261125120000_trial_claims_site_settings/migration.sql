-- One MAIRO Pro free trial per business and per Meta ad account. Additive:
-- a new nullable column and a new table, then a backfill so businesses that
-- already had a trial (or a subscription) can't take another.

ALTER TABLE "Organization" ADD COLUMN "trialUsedAt" TIMESTAMP(3);

CREATE TABLE "TrialClaim" (
    "id" TEXT NOT NULL,
    "metaAdAccountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrialClaim_metaAdAccountId_key" ON "TrialClaim"("metaAdAccountId");
CREATE INDEX "TrialClaim_organizationId_idx" ON "TrialClaim"("organizationId");

-- Every business that has ever had a subscription has had its chance at the
-- trial (MAIRO Pro always starts with one).
UPDATE "Organization"
SET "trialUsedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE "trialUsedAt" IS NULL
  AND ("subscriptionStatus" IS NOT NULL OR "stripeSubscriptionId" IS NOT NULL OR "hasPaid" = true);

-- And the ad accounts those businesses have connected. The earliest business
-- wins where two share one.
INSERT INTO "TrialClaim" ("id", "metaAdAccountId", "organizationId", "createdAt")
SELECT DISTINCT ON (m."metaAdAccountId")
       'tc_' || md5(m."metaAdAccountId"), m."metaAdAccountId", m."organizationId", CURRENT_TIMESTAMP
FROM "MetaAdAccount" m
JOIN "Organization" o ON o."id" = m."organizationId"
WHERE o."trialUsedAt" IS NOT NULL AND m."metaAdAccountId" IS NOT NULL AND m."metaAdAccountId" <> ''
ORDER BY m."metaAdAccountId", o."createdAt" ASC
ON CONFLICT ("metaAdAccountId") DO NOTHING;

-- Settings MAIRO's owner changes from AIOS (MAIRO's own pixel). Additive.
CREATE TABLE "SiteSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteSetting_pkey" PRIMARY KEY ("key")
);
