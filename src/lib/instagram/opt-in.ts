import { db } from "@/lib/db";
import { can } from "@/lib/entitlements";

const ASK_AGAIN_AFTER_MS = 30 * 86_400_000;

/**
 * Whether to ask a Scale business "Let MAIRO post on your Instagram feed?":
 * not once they've said yes, and not for 30 days after "Not now".
 */
export async function shouldAskInstagram(organizationId: string, now = new Date()): Promise<boolean> {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { instagramOptInAt: true, instagramDeclinedAt: true } });
  if (!org || org.instagramOptInAt) return false;
  if (org.instagramDeclinedAt && now.getTime() - org.instagramDeclinedAt.getTime() < ASK_AGAIN_AFTER_MS) return false;
  return can(organizationId, "social_posting");
}
