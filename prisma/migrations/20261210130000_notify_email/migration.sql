-- Email for the notifications an owner should act on (lib/notifications/
-- notify.ts): tracking stopped, a campaign live or rejected, creatives ready,
-- a change MAIRO made, the weekly report. Sent only when an email provider is
-- configured (RESEND_API_KEY, EMAIL_FROM), to the business's owners and
-- admins. On by default; the Notifications page turns it off.
--
-- Additive: one column with a default. Nothing existing changes.

ALTER TABLE "Organization" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true;
