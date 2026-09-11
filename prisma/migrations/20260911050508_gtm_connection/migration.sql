-- CreateTable
CREATE TABLE "GtmConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "googleUserId" TEXT,
    "googleEmail" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "gtmAccountId" TEXT,
    "gtmContainerId" TEXT,
    "gtmContainerPublic" TEXT,
    "gtmContainerName" TEXT,
    "gtmWorkspaceId" TEXT,
    "status" "PlatformConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "lastPublishedAt" TIMESTAMP(3),
    "publishedTagCount" INTEGER,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GtmConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GtmConnection_organizationId_key" ON "GtmConnection"("organizationId");

-- AddForeignKey
ALTER TABLE "GtmConnection" ADD CONSTRAINT "GtmConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
