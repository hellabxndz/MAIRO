import { db } from "@/lib/db";
import { can } from "@/lib/entitlements";
import type { Network } from "./social-logic";

const ASK_AGAIN_AFTER_MS = 30 * 86_400_000;

function waiting(optIn: Date | null, declined: Date | null, now: Date): boolean {
  if (optIn) return false;
  return !declined || now.getTime() - declined.getTime() >= ASK_AGAIN_AFTER_MS;
}

/**
 * Which question to ask a Scale business on the dashboard, if any: "Let MAIRO
 * post on your Instagram feed?" first, then "…on your Facebook Page?" once
 * Instagram is answered. Never once they've said yes, and not for 30 days
 * after "Not now".
 */
export async function socialQuestion(organizationId: string, now = new Date()): Promise<Network | null> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { instagramOptInAt: true, instagramDeclinedAt: true, facebookOptInAt: true, facebookDeclinedAt: true },
  });
  if (!org) return null;
  const instagram = waiting(org.instagramOptInAt, org.instagramDeclinedAt, now);
  const facebook = waiting(org.facebookOptInAt, org.facebookDeclinedAt, now);
  // Facebook waits until Instagram has had its answer, so it's one question at a time.
  const next: Network | null = instagram ? "INSTAGRAM" : facebook && (org.instagramOptInAt || org.instagramDeclinedAt) ? "FACEBOOK" : null;
  if (!next) return null;
  return (await can(organizationId, "social_posting")) ? next : null;
}
