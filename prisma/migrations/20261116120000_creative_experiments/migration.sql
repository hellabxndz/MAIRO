-- AlterTable
ALTER TABLE "CreativeExperiment" ADD COLUMN     "campaignDraftId" TEXT,
ADD COLUMN     "checkedAt" TIMESTAMP(3),
ADD COLUMN     "decisionId" TEXT;

-- CreateIndex
CREATE INDEX "CreativeExperiment_organizationId_campaignDraftId_idx" ON "CreativeExperiment"("organizationId", "campaignDraftId");

