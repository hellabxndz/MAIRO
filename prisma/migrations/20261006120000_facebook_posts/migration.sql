-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "facebookDeclinedAt" TIMESTAMP(3),
ADD COLUMN     "facebookOptInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstagramPost" ADD COLUMN     "network" TEXT NOT NULL DEFAULT 'INSTAGRAM';

-- CreateIndex
CREATE INDEX "InstagramPost_organizationId_network_status_idx" ON "InstagramPost"("organizationId", "network", "status");
