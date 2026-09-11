import { db } from "@/lib/db";
import { billingEnforced, planFor } from "@/lib/plans";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import type { BillingStatus } from "@/lib/ad-platforms/billing";

// Everything standing between a business and its first ad going live.
//
// One place, because four screens need the same answer and a customer given
// two different lists of what is left will do neither. The dashboard shows it,
// the campaigns page explains why nothing is running, the AI specialists are
// told it so their answers match the screen, and auto-launch reads it to
// decide whether it may go ahead.
//
// The order is the order they block in. There is no point telling somebody to
// approve a creative before they have told MAIRO what their business is.

export type ReadinessStepId =
  | "plan"
  | "business"
  | "ad_account"
  | "funding"
  | "creative"
  | "campaign";

export type ReadinessStep = {
  id: ReadinessStepId;
  done: boolean;
  /** What the customer has to do, in their words. */
  label: string;
  /** Why it blocks. Shown when it is the thing they are stuck on. */
  detail: string;
  href: string;
  /**
   * True when MAIRO cannot tell whether this is done.
   *
   * Different from `done: false`, and the difference matters: an unreadable
   * billing state must never be reported as "you have no card", and must never
   * let auto-launch proceed. Not knowing is its own answer.
   */
  unknown?: boolean;
};

export type Readiness = {
  steps: ReadinessStep[];
  /** Everything that must be true before an ad may run. */
  ready: boolean;
  /** The next thing for them to do, or null when there is nothing left. */
  next: ReadinessStep | null;
  remaining: number;
};

/**
 * Whether this organization is on a paid plan.
 *
 * While BILLING_ENFORCED is off, everyone counts as paid. That is the same
 * rule planFor() already follows and it exists for a specific reason: the Meta
 * App Review submission tells the reviewer they will have full access, and a
 * paywall in front of them is a rejection. Turning the variable on is what
 * makes the lock real.
 */
export function hasActivePlan(org: {
  subscriptionTier: string;
  subscriptionStatus: string | null;
}): boolean {
  if (!billingEnforced()) return true;
  if (org.subscriptionTier === "NONE") return false;
  // Stripe's own words. past_due and unpaid are deliberately not here — a
  // failed card means the plan stops working, which is the point of charging.
  return org.subscriptionStatus === "active" || org.subscriptionStatus === "trialing";
}

/**
 * Works out where a business is up to.
 *
 * Funding is the one step that cannot be answered from our own database, so
 * there are two ways to supply it. `billing` takes an answer the caller has
 * already fetched — the dashboard reads it anyway, and asking Meta the same
 * question twice on one render is a slow page for no reason. `checkFunding`
 * makes this function fetch it itself.
 *
 * With neither, funding comes back `unknown`. That is honest rather than
 * convenient: a checklist that has not asked must not claim an answer, and
 * unknown never counts as done, so nothing can go live off an unasked
 * question.
 */
export async function readinessFor(
  organizationId: string,
  {
    checkFunding = false,
    billing,
  }: { checkFunding?: boolean; billing?: BillingStatus | null } = {}
): Promise<Readiness> {
  const [org, intake, meta, creative, campaign] = await Promise.all([
    db.organization.findUnique({
      where: { id: organizationId },
      select: { subscriptionTier: true, subscriptionStatus: true, website: true },
    }),
    db.onboardingIntake.findUnique({ where: { organizationId }, select: { id: true } }),
    db.metaAdAccount.findUnique({
      where: { organizationId },
      select: { id: true, status: true, pageId: true },
    }),
    db.creativeRequest.findFirst({
      where: {
        organizationId,
        status: { in: ["APPROVED", "DELIVERED"] },
        images: { some: { isFinal: true } },
      },
      select: { id: true },
    }),
    // An ad, not a campaign. A campaign with no ad under it cannot show to
    // anybody, so counting it as done would mark the account ready while
    // nothing could possibly run.
    //
    // A deleted one doesn't count either. Its ad still exists on Meta, paused,
    // so the row alone would report an account as ready when the customer has
    // just cleared the decks to start again.
    db.platformCampaign.findFirst({
      where: {
        mairoCampaign: { organizationId, status: { not: "ARCHIVED" } },
        status: { not: "ARCHIVED" },
        externalAdId: { not: null },
      },
      select: { id: true },
    }),
  ]);

  const planName = planFor(org?.subscriptionTier ?? "NONE").name;
  const paid = org ? hasActivePlan(org) : false;
  const connected = meta?.status === "CONNECTED";

  let funded = false;
  let fundingUnknown = true;
  let fundingDetail =
    "MAIRO pays nothing towards your ads — Meta charges you directly, so it needs a card on your ad account before anything can run.";

  if (connected) {
    const status = billing ?? (checkFunding ? await fetchMetaBillingStatus(organizationId) : null);
    if (status) {
      fundingUnknown = status.state === "unknown";
      funded = status.state === "funded";
      if (status.message) fundingDetail = status.message;
    }
    // With no status at all it stays unknown, which is what it is.
  }

  const steps: ReadinessStep[] = [
    {
      id: "plan",
      done: paid,
      label: `Choose a plan`,
      detail: `MAIRO builds and runs the campaigns for you — the ${planName} plan is where that starts. This is separate from what you spend on the ads themselves.`,
      href: "/dashboard/settings#billing",
    },
    {
      id: "business",
      done: Boolean(intake),
      label: "Tell MAIRO about your business",
      detail:
        "What you sell, who buys it, and what you want from advertising. Every plan and every ad is written from these answers.",
      href: "/onboarding",
    },
    {
      id: "ad_account",
      done: connected,
      label: "Connect your Meta ad account",
      detail:
        "Sign in with the Facebook account that manages your ads. MAIRO can only ever touch the account you connect.",
      href: "/dashboard/meta",
    },
    {
      id: "funding",
      done: funded,
      unknown: connected && fundingUnknown,
      label: "Put a card on your Meta account",
      detail: fundingDetail,
      href: "/dashboard/meta",
    },
    {
      id: "creative",
      done: Boolean(creative),
      label: "Approve an ad",
      detail:
        "Send a photo of what you sell and MAIRO writes the ad around it. Nothing runs until you are happy with one.",
      href: "/dashboard/creatives",
    },
    {
      id: "campaign",
      done: Boolean(campaign),
      label: "Let MAIRO build the campaign",
      detail:
        "MAIRO creates it in your own ad account, paused, with the ad already in it. This happens on its own once the steps above are done.",
      href: "/dashboard/campaigns",
    },
  ];

  const next = steps.find((s) => !s.done) ?? null;

  return {
    steps,
    ready: steps.every((s) => s.done),
    next,
    remaining: steps.filter((s) => !s.done).length,
  };
}

/**
 * The same list as one paragraph, for the AI specialists.
 *
 * The agents are told this so what they say matches what the screen says. A
 * customer asking the strategist "why isn't my ad running" and getting a
 * different answer from the one on the dashboard is worse than the agent
 * saying nothing.
 */
export function readinessBrief(readiness: Readiness): string {
  if (readiness.ready) {
    return "This account has finished setting up: the plan is paid, the ad account is connected and funded, an ad is approved, and the campaign is built.";
  }

  const outstanding = readiness.steps.filter((s) => !s.done);
  return [
    "This account cannot run ads yet. What is still outstanding, in the order it blocks:",
    ...outstanding.map((s, i) => `${i + 1}. ${s.label} — ${s.detail}`),
    "",
    "If they ask why nothing is running, say exactly this and nothing more optimistic. Do not promise anything will go live before these are done.",
  ].join("\n");
}
