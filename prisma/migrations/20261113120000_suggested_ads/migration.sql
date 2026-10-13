-- AlterTable
ALTER TABLE "AdAngle" ADD COLUMN     "angleKind" TEXT,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "rank" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "recommendedWhy" TEXT;

-- AlterTable
ALTER TABLE "CreativeStudioAsset" ADD COLUMN     "angleId" TEXT;

-- CreateTable
CREATE TABLE "OwnerVideo" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "angleId" TEXT,
    "url" TEXT NOT NULL,
    "posterUrl" TEXT,
    "fileName" TEXT,
    "durationMs" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdById" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerVideo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnerVideoRevision" (
    "id" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "editsJson" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerVideoRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreativeApproval" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "angleId" TEXT NOT NULL,
    "angleRevisionId" TEXT NOT NULL,
    "studioVersionId" TEXT,
    "videoRevisionId" TEXT,
    "contentHash" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "CreativeApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerVideo_organizationId_angleId_idx" ON "OwnerVideo"("organizationId", "angleId");

-- CreateIndex
CREATE INDEX "OwnerVideoRevision_organizationId_idx" ON "OwnerVideoRevision"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "OwnerVideoRevision_videoId_version_key" ON "OwnerVideoRevision"("videoId", "version");

-- CreateIndex
CREATE INDEX "CreativeApproval_organizationId_angleId_idx" ON "CreativeApproval"("organizationId", "angleId");

-- CreateIndex
CREATE INDEX "CreativeStudioAsset_organizationId_angleId_idx" ON "CreativeStudioAsset"("organizationId", "angleId");

-- AddForeignKey
ALTER TABLE "OwnerVideo" ADD CONSTRAINT "OwnerVideo_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerVideoRevision" ADD CONSTRAINT "OwnerVideoRevision_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "OwnerVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreativeApproval" ADD CONSTRAINT "CreativeApproval_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

