-- CreateEnum
CREATE TYPE "InstagramPostStatus" AS ENUM ('DRAFT', 'CREATED', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "InstagramPost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "creativeRequestId" TEXT,
    "caption" TEXT NOT NULL,
    "status" "InstagramPostStatus" NOT NULL DEFAULT 'DRAFT',
    "igUserId" TEXT,
    "containerId" TEXT,
    "mediaId" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "sourceUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramPost_mediaId_key" ON "InstagramPost"("mediaId");

-- CreateIndex
CREATE INDEX "InstagramPost_organizationId_status_idx" ON "InstagramPost"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_creativeRequestId_fkey" FOREIGN KEY ("creativeRequestId") REFERENCES "CreativeRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
