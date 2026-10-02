-- AlterTable
ALTER TABLE "BusinessBrain" ADD COLUMN     "factsJson" TEXT NOT NULL DEFAULT '{}',
ADD COLUMN     "historyJson" TEXT NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "MairoLearning" ADD COLUMN     "goal" TEXT,
ADD COLUMN     "sampleSize" INTEGER;

-- CreateTable
CREATE TABLE "BrainEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "field" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrainEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrainEvent_organizationId_createdAt_idx" ON "BrainEvent"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "BrainEvent" ADD CONSTRAINT "BrainEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
