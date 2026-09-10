-- CreateTable
CREATE TABLE "TikTokCreatorConnection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "unionId" TEXT,
    "username" TEXT,
    "nickname" TEXT,
    "avatarUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "refreshExpiresAt" TIMESTAMP(3),
    "scopes" TEXT,
    "status" "PlatformConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TikTokCreatorConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TikTokCreatorConnection_organizationId_key" ON "TikTokCreatorConnection"("organizationId");

-- AddForeignKey
ALTER TABLE "TikTokCreatorConnection" ADD CONSTRAINT "TikTokCreatorConnection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
