-- CreateTable
CREATE TABLE "FreeAdPlan" (
    "id" TEXT NOT NULL,
    "shareToken" TEXT NOT NULL,
    "organizationId" TEXT,
    "inputsJson" TEXT NOT NULL,
    "planJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "FreeAdPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeAdPlan_shareToken_key" ON "FreeAdPlan"("shareToken");

-- CreateIndex
CREATE INDEX "FreeAdPlan_organizationId_idx" ON "FreeAdPlan"("organizationId");

-- CreateIndex
CREATE INDEX "FreeAdPlan_createdAt_idx" ON "FreeAdPlan"("createdAt");

-- AddForeignKey
ALTER TABLE "FreeAdPlan" ADD CONSTRAINT "FreeAdPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
