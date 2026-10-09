import { db } from "@/lib/db";
import { classifyNiche } from "@/lib/tracking/niches";

// Takes an organization id and trusts it, so it lives here rather than in a
// "use server" file, where every export is a public endpoint.

/**
 * The tracking profile, created on first look with MAIRO's best guess.
 *
 * The guess is made from what they typed as their industry at signup and is
 * shown to them as a guess, not as a fact. Storing it unconfirmed means the
 * page can tell the difference between "MAIRO thinks you are a restaurant" and
 * "you told MAIRO you are a restaurant", which are different things to say.
 */
export async function ensureTrackingProfile(organizationId: string) {
  const existing = await db.trackingProfile.findUnique({ where: { organizationId } });
  if (existing) return existing;

  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { industry: true, intake: { select: { primaryGoal: true } } },
  });

  const guess = classifyNiche(org?.industry, org?.intake?.primaryGoal ?? null);

  return db.trackingProfile.create({
    data: { organizationId, nicheId: guess.id, nicheConfirmed: false },
  });
}
