-- AlterTable
ALTER TABLE "OwnerVideoRevision" ADD COLUMN     "renderAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "renderError" TEXT,
ADD COLUMN     "renderStartedAt" TIMESTAMP(3),
ADD COLUMN     "renderStatus" TEXT,
ADD COLUMN     "renderedAt" TIMESTAMP(3),
ADD COLUMN     "renderedBytes" INTEGER,
ADD COLUMN     "renderedDurationMs" INTEGER,
ADD COLUMN     "renderedHeight" INTEGER,
ADD COLUMN     "renderedPosterUrl" TEXT,
ADD COLUMN     "renderedUrl" TEXT,
ADD COLUMN     "renderedWidth" INTEGER;

