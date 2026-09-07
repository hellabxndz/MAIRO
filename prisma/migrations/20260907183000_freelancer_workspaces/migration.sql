-- CreateEnum
CREATE TYPE "OrganizationKind" AS ENUM ('BUSINESS', 'WORKSPACE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SubscriptionTier" ADD VALUE 'STUDIO';
ALTER TYPE "SubscriptionTier" ADD VALUE 'AGENCY';

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'FREELANCER';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "kind" "OrganizationKind" NOT NULL DEFAULT 'BUSINESS',
ADD COLUMN     "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

