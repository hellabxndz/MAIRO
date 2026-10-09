-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'SUBSCRIPTION_CHANGE';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "subscriptionCancelAt" TIMESTAMP(3);

