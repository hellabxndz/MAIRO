-- MAIRO Pro and the new MAIRO Scale. Additive only: no existing row changes,
-- and the earlier tiers stay for the subscribers already on them.
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'PRO';
ALTER TYPE "SubscriptionTier" ADD VALUE IF NOT EXISTS 'SCALE_V2';
