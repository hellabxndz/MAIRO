-- Which inbox a message ad opens. Additive and defaulted, so every existing
-- DIRECT_MESSAGE campaign keeps doing what it already did: Messenger.

CREATE TYPE "MessageChannel" AS ENUM ('MESSENGER', 'INSTAGRAM', 'WHATSAPP');

ALTER TABLE "MairoCampaign"
  ADD COLUMN "messageChannel" "MessageChannel" NOT NULL DEFAULT 'MESSENGER';
