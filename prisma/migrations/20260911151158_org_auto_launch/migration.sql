-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoLaunchHeld" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoLaunchedAt" TIMESTAMP(3);
