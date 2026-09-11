-- CreateTable
CREATE TABLE "TrackingProfile" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "nicheId" TEXT NOT NULL DEFAULT 'general',
    "nicheConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "gtmContainerId" TEXT,
    "containerBuiltAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingProfile_organizationId_key" ON "TrackingProfile"("organizationId");

-- AddForeignKey
ALTER TABLE "TrackingProfile" ADD CONSTRAINT "TrackingProfile_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
