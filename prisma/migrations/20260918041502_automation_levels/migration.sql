-- CreateEnum
CREATE TYPE "AutomationLevel" AS ENUM ('MANUAL', 'ASSISTED', 'AUTOPILOT');

-- AlterTable
ALTER TABLE "AutoOptimizeSettings" ADD COLUMN     "level" "AutomationLevel" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "maxBudgetShiftPercent" INTEGER NOT NULL DEFAULT 15;
