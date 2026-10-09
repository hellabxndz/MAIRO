-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('STRATEGIST', 'AUDIENCE', 'CREATIVE', 'ARCHITECT', 'OPTIMIZER', 'GUARDIAN', 'ANALYST', 'GROWTH');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('RUNNING', 'DONE', 'NOTHING', 'FAILED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "notifyOpportunities" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyReports" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "agent" "AgentRole" NOT NULL,
    "task" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'RUNNING',
    "summary" TEXT,
    "detail" TEXT,
    "href" TEXT,
    "parentId" TEXT,
    "decisionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_organizationId_startedAt_idx" ON "AgentRun"("organizationId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_organizationId_agent_startedAt_idx" ON "AgentRun"("organizationId", "agent", "startedAt");

-- CreateIndex
CREATE INDEX "AgentRun_status_startedAt_idx" ON "AgentRun"("status", "startedAt");

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

