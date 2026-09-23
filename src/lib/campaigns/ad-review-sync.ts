import { db } from "@/lib/db";
import { loadMetaConnection } from "@/lib/meta/connection";
import { fetchAdReviews, type AdReview, type AdReviewState } from "@/lib/meta/ad-review";
import { notify } from "@/lib/notifications/notify";

// Keeps each campaign's "what did Meta's review say" up to date, and tells the
// business the first time an ad is rejected — with what went wrong and what
// to do, not a policy code.
//
// Cheap to call on a page render: campaigns checked in the last few minutes
// are skipped without a network call, and everything is one batched Graph
// request per business.

const RECHECK_MS = 10 * 60 * 1000;

/** The most important state among a campaign's ads. */
const RANK: Record<AdReviewState, number> = { REJECTED: 4, WITH_ISSUES: 3, PENDING: 2, APPROVED: 1, OFF: 0 };

export async function syncAdReviews(organizationId: string, opts: { force?: boolean } = {}): Promise<number> {
  const children = await db.platformCampaign.findMany({
    where: {
      platform: "META",
      externalAdId: { not: null },
      status: { in: ["PENDING_REVIEW", "ACTIVE", "PAUSED"] },
      mairoCampaign: { organizationId, status: { not: "ARCHIVED" } },
      ...(opts.force
        ? {}
        : { OR: [{ adReviewCheckedAt: null }, { adReviewCheckedAt: { lt: new Date(Date.now() - RECHECK_MS) } }] }),
    },
    select: {
      id: true,
      externalAdId: true,
      extraExternalAdIds: true,
      adReviewState: true,
      mairoCampaign: { select: { id: true, name: true } },
    },
    take: 25,
  });
  if (children.length === 0) return 0;

  const connection = await loadMetaConnection(organizationId);
  if (!connection) return 0;

  let reviews: Map<string, AdReview>;
  try {
    reviews = await fetchAdReviews(
      children.flatMap((c) => [c.externalAdId!, ...c.extraExternalAdIds]),
      connection.accessToken,
    );
  } catch (error) {
    // Unreachable Meta isn't news for the customer; try again next time.
    console.error("Reading Meta ad review status failed:", error);
    return 0;
  }

  let rejected = 0;
  for (const child of children) {
    const ids = [child.externalAdId!, ...child.extraExternalAdIds];
    const found = ids.map((id) => ({ id, review: reviews.get(id) })).filter((r): r is { id: string; review: AdReview } => Boolean(r.review));
    if (found.length === 0) continue;
    const worst = found.reduce((a, b) => (RANK[b.review.state] > RANK[a.review.state] ? b : a));
    const bad = found.filter((r) => r.review.state === "REJECTED" || r.review.state === "WITH_ISSUES");
    // Only one of several test versions rejected: the campaign still runs.
    const partial = bad.length > 0 && bad.length < found.length;
    const explanation = worst.review.explanation
      ? partial
        ? `${bad.length} of ${found.length} ad versions weren't approved, so the campaign runs with the rest. ${worst.review.explanation}`
        : worst.review.explanation
      : null;

    await db.platformCampaign.update({
      where: { id: child.id },
      data: {
        adReviewState: worst.review.state,
        adReviewExplanation: explanation,
        adReviewAction: worst.review.action,
        adReviewCheckedAt: new Date(),
      },
    });

    if (bad.length > 0) {
      rejected += 1;
      const rejectedWord = worst.review.state === "REJECTED" ? "didn't approve" : "flagged a problem with";
      await notify({
        organizationId,
        kind: "NEEDS_ATTENTION",
        // Once per ad and outcome: a second rejection after a fix is news.
        dedupeKey: `ad-review:${worst.id}:${worst.review.state}`,
        title: `Meta ${rejectedWord} an ad in “${child.mairoCampaign.name}”`,
        body: [explanation, worst.review.action].filter(Boolean).join(" "),
        actionLabel: "See what to do",
        actionHref: `/dashboard/campaigns/${child.mairoCampaign.id}`,
        mairoCampaignId: child.mairoCampaign.id,
        evidence: { adId: worst.id, state: worst.review.state },
        smsBody: `MAIRO: Meta ${rejectedWord} an ad in "${child.mairoCampaign.name}". Open MAIRO to see why and fix it.`,
      });
    }
  }
  return rejected;
}
