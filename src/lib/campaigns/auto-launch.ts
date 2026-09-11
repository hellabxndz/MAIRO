import { db } from "@/lib/db";
import { getAdapter } from "@/lib/ad-platforms/registry";
import { readinessFor } from "@/lib/readiness";
import { planFor } from "@/lib/plans";

// Putting the ads live without asking.
//
// This is the one thing in MAIRO that starts spending a customer's money with
// nobody pressing a button, so it is worth being exact about what it will and
// will not do.
//
// It only ever acts when every step is genuinely finished: the plan is paid,
// the business has been described, the ad account is connected, Meta confirms
// there is a way to charge it, an ad has been approved, and the campaign and
// the ad actually exist on the network. That last one matters — a campaign
// with no ad under it cannot deliver, so "switching it on" would be theatre.
//
// Three rules it keeps:
//
// Funding must be confirmed, not assumed. Meta is asked directly, and an
// answer of "unknown" — a timeout, a permissions problem — blocks the launch.
// Going live on a maybe would mean a customer discovering a live campaign and
// a declined card at the same time.
//
// It never raises a budget and never creates anything. Everything it touches
// was already built, paused, at a budget the customer set.
//
// And it is bounded by the plan. A Starter account gets one live campaign, not
// however many happen to be sitting in a drafts pile.

export type AutoLaunchOutcome = {
  /** True when something actually went live on this run. */
  launched: boolean;
  /** Campaigns switched on, by name. */
  names: string[];
  /** Why nothing happened. Null when something did, or when nothing was due. */
  heldBecause: string | null;
};

const NOTHING: AutoLaunchOutcome = { launched: false, names: [], heldBecause: null };

/**
 * Switches on anything that is ready, if the account is.
 *
 * Safe to call on every dashboard render: it does nothing at all unless the
 * account has just crossed the line, and it is idempotent — a campaign already
 * ACTIVE is skipped rather than resumed again.
 */
export async function maybeGoLive(organizationId: string): Promise<AutoLaunchOutcome> {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { autoLaunchHeld: true, subscriptionTier: true },
  });
  if (!org) return NOTHING;

  if (org.autoLaunchHeld) {
    return { ...NOTHING, heldBecause: "You've asked MAIRO to wait before putting anything live." };
  }

  // Is there anything to do at all? Asked before the funding check, which is a
  // network round trip to Meta and not worth spending on an account with
  // nothing waiting.
  const waiting = await db.platformCampaign.findMany({
    where: {
      mairoCampaign: { organizationId },
      status: "PENDING_REVIEW",
      externalCampaignId: { not: null },
      // No ad means nothing can be shown, whatever the status says.
      externalAdId: { not: null },
    },
    include: { mairoCampaign: { select: { id: true, name: true, status: true } } },
  });
  if (waiting.length === 0) return NOTHING;

  // The expensive check, and the one that must never be guessed.
  const readiness = await readinessFor(organizationId, { checkFunding: true });
  if (!readiness.ready) {
    const blocking = readiness.next;
    return {
      ...NOTHING,
      heldBecause: blocking
        ? blocking.unknown
          ? `MAIRO couldn't confirm with Meta that your ad account can be charged, so it hasn't put anything live. It will try again.`
          : `Waiting on one thing: ${blocking.label.toLowerCase()}.`
        : null,
    };
  }

  // How many live campaigns the plan allows, minus what is already running.
  const limit = planFor(org.subscriptionTier).limits.campaigns;
  const liveCount = await db.platformCampaign.count({
    where: { mairoCampaign: { organizationId }, status: "ACTIVE" },
  });
  let budget = Math.max(0, limit - liveCount);
  if (budget === 0) {
    return {
      ...NOTHING,
      heldBecause: `Your plan runs ${limit} campaign${limit === 1 ? "" : "s"} at a time, and that many are already live.`,
    };
  }

  const names: string[] = [];

  for (const child of waiting) {
    if (budget === 0) break;

    const adapter = getAdapter(child.platform);
    if (!adapter || !child.externalCampaignId) continue;

    // Claim the row before touching the network.
    //
    // This runs on a page render, and a customer with two tabs open — or a
    // browser that prefetches — can have two of these in flight at once.
    // Moving the status first, conditionally, means only one of them gets a
    // count of 1 and goes on to call Meta. Without it both would, and the
    // second would be resuming a campaign that is already running.
    const claim = await db.platformCampaign.updateMany({
      where: { id: child.id, status: "PENDING_REVIEW" },
      data: { status: "ACTIVE", lastError: null },
    });
    if (claim.count === 0) continue;

    const result = await adapter.resumeCampaign({
      organizationId,
      externalCampaignId: child.externalCampaignId,
    });

    if (!result.ok) {
      // Put it back where it was and record why. A network refusing to start
      // a campaign is something the customer needs to read, not something to
      // hammer on every page load — and leaving it ACTIVE in our database
      // while it is paused in theirs would be a lie on every screen.
      await db.platformCampaign.update({
        where: { id: child.id },
        data: { status: "PENDING_REVIEW", lastError: result.error.message },
      });
      continue;
    }

    await db.mairoCampaign.update({
      where: { id: child.mairoCampaignId },
      data: { status: "ACTIVE" },
    });

    names.push(child.mairoCampaign.name);
    budget--;
  }

  if (names.length === 0) return NOTHING;

  await db.organization.update({
    where: { id: organizationId },
    data: { autoLaunchedAt: new Date() },
  });

  return { launched: true, names: [...new Set(names)], heldBecause: null };
}

/**
 * Whether MAIRO is going to do this, for the UI to say so in advance.
 *
 * Told before it happens rather than after. A customer whose first sight of an
 * automatic launch is a charge on their card has been surprised by their own
 * product, even if it did exactly what they paid for.
 */
export async function autoLaunchIntent(organizationId: string): Promise<{
  held: boolean;
  lastLaunchedAt: Date | null;
  waitingCount: number;
}> {
  const [org, waitingCount] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { autoLaunchHeld: true, autoLaunchedAt: true },
    }),
    db.platformCampaign.count({
      where: {
        mairoCampaign: { organizationId },
        status: "PENDING_REVIEW",
        externalAdId: { not: null },
      },
    }),
  ]);

  return {
    held: org?.autoLaunchHeld ?? false,
    lastLaunchedAt: org?.autoLaunchedAt ?? null,
    waitingCount,
  };
}
