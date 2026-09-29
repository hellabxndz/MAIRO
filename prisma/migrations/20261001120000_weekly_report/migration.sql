-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'WEEKLY_REPORT';

-- CreateTable
CREATE TABLE "WeeklyReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "dataJson" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "shareToken" TEXT,

    CONSTRAINT "WeeklyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSettings" (
    "organizationId" TEXT NOT NULL,
    "weeklyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryDay" INTEGER NOT NULL DEFAULT 1,
    "preferredMode" TEXT NOT NULL DEFAULT 'simple',
    "inApp" BOOLEAN NOT NULL DEFAULT true,
    "onlyWhenActive" BOOLEAN NOT NULL DEFAULT true,
    "brandName" TEXT,
    "brandLogoUrl" TEXT,
    "hideInternal" BOOLEAN NOT NULL DEFAULT true,
    "autoApprove" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSettings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "MairoLearning" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "evidenceJson" TEXT NOT NULL,
    "confidence" "DecisionConfidence" NOT NULL,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "firstLearnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceReportId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "MairoLearning_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_shareToken_key" ON "WeeklyReport"("shareToken");

-- CreateIndex
CREATE INDEX "WeeklyReport_organizationId_weekStart_idx" ON "WeeklyReport"("organizationId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReport_organizationId_weekStart_key" ON "WeeklyReport"("organizationId", "weekStart");

-- CreateIndex
CREATE INDEX "MairoLearning_organizationId_active_idx" ON "MairoLearning"("organizationId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MairoLearning_organizationId_key_key" ON "MairoLearning"("organizationId", "key");

-- AddForeignKey
ALTER TABLE "WeeklyReport" ADD CONSTRAINT "WeeklyReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSettings" ADD CONSTRAINT "ReportSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MairoLearning" ADD CONSTRAINT "MairoLearning_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
