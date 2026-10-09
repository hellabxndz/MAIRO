import { db } from "@/lib/db";
import { hasActivePlan, type Readiness } from "@/lib/readiness";
import { successJourney, type Journey, type JourneyFacts } from "./journey";

// Customer success, read from what MAIRO already records — no survey, no
// second copy of anything. Used by the customer's Overview (with live figures
// it already has to hand) and by the MAIRO team's view in AIOS (from the
// database alone, so listing every account never calls Meta).

const DAY = 86_400_000;

/**
 * Optional live facts the caller already has. Without them, delivery is
 * judged from MAIRO's own records (a live campaign with no error), and the
 * Meta payment method is "couldn't say" — never assumed either way.
 */
export type LiveFacts = { readiness?: Readiness | null; spendCents?: number | null; problems?: number };

export async function journeyFactsFor(organizationId: string, live: LiveFacts = {}, now = new Date()): Promise<JourneyFacts | null> {
  const [org, intake, meta, pixel, approved, active, troubled, decisions, answered, reports] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { createdAt: true, subscriptionTier: true, subscriptionStatus: true, paymentRequired: true, autoLaunchedAt: true },
    }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
    db.mairoCampaign.count({ where: { organizationId, launchApprovedAt: { not: null } } }),
    db.platformCampaign.count({ where: { mairoCampaign: { organizationId }, status: "ACTIVE" } }),
    db.platformCampaign.count({
      where: {
        mairoCampaign: { organizationId, status: { not: "ARCHIVED" } },
        OR: [{ lastError: { not: null } }, { adReviewState: { in: ["REJECTED", "WITH_ISSUES"] } }],
      },
    }),
    db.mairoDecision.count({ where: { organizationId } }),
    db.mairoDecision.count({ where: { organizationId, status: { in: ["APPLIED", "REJECTED"] } } }),
    db.weeklyReport.count({ where: { organizationId } }),
  ]);
  if (!org) return null;
  const pulse = await db.customerFeedback.count({
    where: { organizationId, kind: "PULSE", createdAt: { gte: new Date(org.createdAt.getTime() + 14 * DAY) } },
  });

  const funding = live.readiness?.steps.find((s) => s.id === "funding");
  const isLive = active > 0 || Boolean(org.autoLaunchedAt);
  const problems = live.problems ?? troubled;
  return {
    startedAt: org.createdAt,
    now,
    setupDone: Boolean(intake),
    metaConnected: meta?.status === "CONNECTED",
    subscribed: hasActivePlan(org),
    fundingConfirmed: funding ? (funding.unknown ? null : funding.done) : null,
    trackingReady: pixel?.status === "ACTIVE",
    campaignApproved: approved > 0 || active > 0,
    live: isLive,
    delivering: live.spendCents !== undefined ? (live.spendCents ?? 0) > 0 : isLive && troubled === 0,
    problems,
    decisionsMade: decisions,
    decisionsAnswered: answered,
    weeklyReports: reports,
    pulseAnswered: pulse > 0,
  };
}

export async function journeyFor(organizationId: string, live: LiveFacts = {}, now = new Date()): Promise<Journey | null> {
  const facts = await journeyFactsFor(organizationId, live, now);
  return facts ? successJourney(facts) : null;
}

/**
 * Whether to ask "Is MAIRO making advertising easier for your business?" on
 * the Overview: from the first week, at most once a month, never in the
 * first days when there's nothing to judge yet.
 */
export async function pulseDue(organizationId: string, now = new Date()): Promise<boolean> {
  const [org, last] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { createdAt: true } }),
    db.customerFeedback.findFirst({ where: { organizationId, kind: "PULSE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  if (!org) return false;
  if (now.getTime() - org.createdAt.getTime() < 7 * DAY) return false;
  return !last || now.getTime() - last.createdAt.getTime() > 30 * DAY;
}

/** Last time the business opened MAIRO, to the hour. One conditional write. */
export async function touchActivity(organizationId: string, now = new Date()): Promise<void> {
  await db.organization.updateMany({
    where: { id: organizationId, OR: [{ lastActiveAt: null }, { lastActiveAt: { lt: new Date(now.getTime() - 3_600_000) } }] },
    data: { lastActiveAt: now },
  });
}
