-- CreateTable
CREATE TABLE "CreativeImage" (
    "id" TEXT NOT NULL,
    "creativeRequestId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "imageData" TEXT NOT NULL,
    "instruction" TEXT,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreativeImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreativeImage_creativeRequestId_idx" ON "CreativeImage"("creativeRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "CreativeImage_creativeRequestId_version_key" ON "CreativeImage"("creativeRequestId", "version");

-- AddForeignKey
ALTER TABLE "CreativeImage" ADD CONSTRAINT "CreativeImage_creativeRequestId_fkey" FOREIGN KEY ("creativeRequestId") REFERENCES "CreativeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
