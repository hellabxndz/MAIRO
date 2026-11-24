-- Additive only: four indexes for lookups by business or user that were
-- full-table scans. No table, column or row is changed or dropped.
-- On production's current size these build in well under a second.

-- CreateIndex
CREATE INDEX "AgentThread_userId_organizationId_agentType_idx" ON "AgentThread"("userId", "organizationId", "agentType");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "Campaign_organizationId_idx" ON "Campaign"("organizationId");

-- CreateIndex
CREATE INDEX "CreativeRequest_organizationId_idx" ON "CreativeRequest"("organizationId");
