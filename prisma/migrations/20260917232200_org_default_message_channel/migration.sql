-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "defaultMessageChannel" "MessageChannel" NOT NULL DEFAULT 'MESSENGER';
