-- CreateEnum
CREATE TYPE "FounderProjectStatus" AS ENUM ('IDEA', 'ACTIVE', 'PAUSED', 'DONE');

-- CreateEnum
CREATE TYPE "FounderItemKind" AS ENUM ('TASK', 'MILESTONE', 'NOTE', 'DOC', 'IDEA');

-- CreateTable
CREATE TABLE "FounderProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "status" "FounderProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" "FounderItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "doneAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FounderActivity" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "detail" TEXT,
    "via" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FounderActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FounderProject_status_updatedAt_idx" ON "FounderProject"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "FounderItem_projectId_kind_createdAt_idx" ON "FounderItem"("projectId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "FounderItem_kind_doneAt_idx" ON "FounderItem"("kind", "doneAt");

-- CreateIndex
CREATE INDEX "FounderActivity_createdAt_idx" ON "FounderActivity"("createdAt");

-- AddForeignKey
ALTER TABLE "FounderItem" ADD CONSTRAINT "FounderItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "FounderProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

