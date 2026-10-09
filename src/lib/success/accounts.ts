import { EXPIRY_WARNING_DAYS, daysLeft } from "@/lib/meta/token-expiry";
import { db } from "@/lib/db";
import { successJourney, type Journey } from "./journey";
import { journeyFactsFor } from "./store";
import { accountHealth, programMetrics, type Health, type ProgramMetrics } from "./health";

// The MAIRO team's view of every customer: where each is in its first month,
// who's struggling and why, and the program's numbers. Read from the
// database only — listing every account never calls Meta.

const DAY = 86_400_000;

export type SuccessAccount = {
  id: string;
  name: string;
  createdAt: Date;
  founding: boolean;
  consent: boolean;
  plan: string;
  status: string | null;
  paid: boolean;
  payingNow: boolean;
  lastActiveAt: Date | null;
  canceledAt: Date | null;
  journey: Journey;
  health: Health;
  daysToFirstCampaign: number | null;
  latestPulse: "YES" | "SOMEWHAT" | "NO" | null;
  openIssues: number;
  cancelReason: string | null;
  /** The Meta connection as last recorded (no Meta call): what support checks first. */
  meta: "connected" | "expiring" | "expired" | "error" | "none";
  /** When a cancelled subscription ends, while it's still active. */
  cancelAt: Date | null;
  /** MAIRO campaigns live on Meta now. */
  runningCampaigns: number;
};

export async function successAccount(organizationId: string, now = new Date()): Promise<SuccessAccount | null> {
  const [org, facts, first, firstLive, pulse, problems, issues, cancel] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true, name: true, createdAt: true, foundingCustomer: true, caseStudyConsentAt: true, subscriptionTier: true,
        subscriptionStatus: true, hasPaid: true, lastActiveAt: true, canceledAt: true, autoLaunchedAt: true,
        subscriptionCancelAt: true,
        metaAdAccount: { select: { status: true, tokenExpiresAt: true } },
        _count: { select: { mairoCampaigns: { where: { status: { not: "ARCHIVED" }, platformCampaigns: { some: { platform: "META", status: "ACTIVE", externalCampaignId: { not: null } } } } } } },
      },
    }),
    journeyFactsFor(organizationId, {}, now),
    db.mairoCampaign.aggregate({ where: { organizationId, launchApprovedAt: { not: null } }, _min: { launchApprovedAt: true } }),
    // A campaign live on Meta counts as approved too — the same rule the
    // customer's own journey uses, so the two views never disagree.
    db.mairoCampaign.aggregate({ where: { organizationId, platformCampaigns: { some: { status: "ACTIVE" } } }, _min: { createdAt: true } }),
    db.customerFeedback.findFirst({ where: { organizationId, kind: "PULSE" }, orderBy: { createdAt: "desc" }, select: { easier: true } }),
    db.customerFeedback.count({ where: { organizationId, kind: "PROBLEM", status: { not: "RESOLVED" } } }),
    db.customerFeedback.count({ where: { organizationId, kind: { in: ["PROBLEM", "CONFUSING", "IDEA"] }, status: { not: "RESOLVED" } } }),
    db.customerFeedback.findFirst({ where: { organizationId, kind: "CANCELLATION" }, orderBy: { createdAt: "desc" }, select: { text: true } }),
  ]);
  if (!org || !facts) return null;

  const journey = successJourney(facts);
  const firstAt = first._min.launchApprovedAt ?? org.autoLaunchedAt ?? firstLive._min.createdAt;
  const daysToFirstCampaign = firstAt ? Math.max(0, Math.floor((firstAt.getTime() - org.createdAt.getTime()) / DAY)) : null;
  const payingNow = org.subscriptionStatus === "active" || org.subscriptionStatus === "trialing";
  const latestPulse = pulse?.easier ?? null;

  return {
    id: org.id,
    name: org.name,
    createdAt: org.createdAt,
    founding: org.foundingCustomer,
    consent: Boolean(org.caseStudyConsentAt),
    plan: org.subscriptionTier,
    status: org.subscriptionStatus,
    paid: org.hasPaid,
    payingNow,
    lastActiveAt: org.lastActiveAt,
    canceledAt: org.canceledAt,
    journey,
    health: accountHealth({
      journey,
      now,
      subscriptionStatus: org.subscriptionStatus,
      canceledAt: org.canceledAt,
      lastActiveAt: org.lastActiveAt,
      campaignProblems: facts.problems,
      openProblems: problems,
      latestPulse,
      daysToFirstCampaign,
      paid: org.hasPaid || payingNow,
    }),
    daysToFirstCampaign,
    latestPulse,
    openIssues: issues,
    cancelReason: cancel?.text ?? null,
    meta: metaHealth(org.metaAdAccount, now),
    cancelAt: org.subscriptionCancelAt,
    runningCampaigns: org._count.mairoCampaigns,
  };
}

function metaHealth(m: { status: string; tokenExpiresAt: Date | null } | null, now: Date): SuccessAccount["meta"] {
  if (!m) return "none";
  if (m.status === "TOKEN_EXPIRED") return "expired";
  if (m.status !== "CONNECTED") return "error";
  const left = daysLeft(m.tokenExpiresAt, now);
  if (m.tokenExpiresAt && left === null) return "expired";
  if (left !== null && left <= EXPIRY_WARNING_DAYS) return "expiring";
  return "connected";
}

const RANK = { struggling: 0, watch: 1, healthy: 2, cancelled: 3 } as const;

/** Every customer business (not MAIRO's own), struggling first. */
export async function successAccounts(opts: { foundingOnly?: boolean } = {}, now = new Date()): Promise<{ accounts: SuccessAccount[]; metrics: ProgramMetrics }> {
  const orgs = await db.organization.findMany({
    where: { users: { none: { role: "OWNER" } }, ...(opts.foundingOnly ? { foundingCustomer: true } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true },
  });
  const accounts = (await Promise.all(orgs.map((o) => successAccount(o.id, now)))).filter((a): a is SuccessAccount => a !== null);
  accounts.sort((a, b) => RANK[a.health.level] - RANK[b.health.level] || b.createdAt.getTime() - a.createdAt.getTime());
  const metrics = programMetrics(
    accounts.map((a) => ({
      health: a.health,
      activated: a.journey.stages[0].state === "done",
      daysToFirstCampaign: a.daysToFirstCampaign,
      paid: a.paid,
      payingNow: a.payingNow,
      activeLast7: Boolean(a.lastActiveAt && now.getTime() - a.lastActiveAt.getTime() <= 7 * DAY),
      latestPulse: a.latestPulse,
    })),
  );
  return { accounts, metrics };
}
