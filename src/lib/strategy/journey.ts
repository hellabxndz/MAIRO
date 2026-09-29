import { db } from "@/lib/db";
import { hasActivePlan, readinessFor } from "@/lib/readiness";
import { billingEnforced } from "@/lib/plans";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { WIZARD_STEPS } from "@/lib/campaigns/plan";
import { activateIfPaid, approvedPlanOf } from "./store";
import { compareWithPlan, type CompareRow } from "./compare";
import type { StrategyContent } from "./plan-logic";

// Where a business is between "plan approved" and "first campaign live".
//
// Every step is read from what actually exists — the Meta connection, the
// funding check Meta answers, the Create draft, the campaign on the network —
// never assumed. A step MAIRO can't confirm (funding when Meta doesn't say)
// is "unknown", which never counts as done.

export type StepState = "done" | "current" | "todo" | "unknown";
export type JourneyStep = { id: string; label: string; state: StepState; detail: string | null; href: string | null };

export type Journey = {
  plan: StrategyContent;
  approvedAt: Date | null;
  activated: boolean;
  billingOn: boolean;
  steps: JourneyStep[];
  draftId: string | null;
  campaign: {
    id: string;
    name: string;
    launchApprovedAt: Date | null;
    reviewState: string | null;
    lastError: string | null;
  } | null;
  comparison: CompareRow[] | null;
  built: boolean;
  launched: boolean;
  launchedAt: Date | null;
  next: "connect" | "build" | "review" | "waiting" | "live";
};

const DRAFT_ORDER = WIZARD_STEPS.map((s) => s.id) as string[];

export async function loadJourney(organizationId: string, opts: { checkFunding: boolean }): Promise<Journey | null> {
  const row = await activateIfPaid(organizationId);
  if (!row) return null;
  const plan = approvedPlanOf(row);
  if (!plan) return null;

  const [org, meta, pixel, draft, campaign, leadForm] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, metaAdAccountId: true, pageId: true, pageName: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
    row.campaignDraftId ? db.campaignDraft.findFirst({ where: { id: row.campaignDraftId, organizationId }, select: { id: true, step: true } }) : null,
    row.campaignId
      ? db.mairoCampaign.findFirst({
          where: { id: row.campaignId, organizationId },
          include: { platformCampaigns: true, ads: { orderBy: { position: "asc" }, select: { headline: true, primaryText: true, kind: true } } },
        })
      : null,
    plan.campaignType === "LEAD_FORM" ? db.leadForm.findFirst({ where: { organizationId }, select: { id: true } }) : null,
  ]);

  const paid = org ? hasActivePlan(org) : false;
  const connected = meta?.status === "CONNECTED";
  const readiness = connected && opts.checkFunding ? await readinessFor(organizationId, { checkFunding: true }) : null;
  const funding = readiness?.steps.find((s) => s.id === "funding") ?? null;

  const pcs = campaign?.platformCampaigns ?? [];
  const built = pcs.some((p) => p.externalCampaignId && p.externalAdId);
  const launched = pcs.some((p) => p.status === "ACTIVE");
  let launchedAt = row.launchedAt;
  if (launched && !launchedAt) {
    launchedAt = new Date();
    await db.strategyPlan.update({ where: { id: row.id }, data: { launchedAt } });
  }

  const draftAt = draft ? DRAFT_ORDER.indexOf(draft.step) : -1;
  const past = (step: string) => built || (draftAt >= 0 && draftAt > DRAFT_ORDER.indexOf(step));

  const raw: (Omit<JourneyStep, "state"> & { done: boolean; unknown: boolean })[] = [];
  const add = (id: string, label: string, done: boolean, detail: string | null = null, href: string | null = null, unknown = false) =>
    raw.push({ id, label, done, detail, href, unknown });

  add("strategy", "Business Plan Approved", true, `Revision ${row.approvedVersion ?? 0}, approved ${row.approvedAt?.toLocaleDateString("en-US", { month: "short", day: "numeric" }) ?? ""}`, "/plan");
  add(
    "connect",
    "Ad Account Connected",
    connected && Boolean(meta?.metaAdAccountId),
    connected ? `${meta?.metaAdAccountId}${meta?.pageName ? ` · Page: ${meta.pageName}` : " · choose a Page on the Meta screen"}` : "Sign in with Facebook so Mairo can build in your own ad account.",
    connected ? "/dashboard/meta" : "/api/meta/connect?returnTo=%2Fdashboard%2Flaunch",
  );
  add("selected", "Mairo Plan Selected", paid, null, "/dashboard/billing");
  add("subscription", "Subscription Active", paid, org?.subscriptionStatus === "trialing" ? "Free trial — the first charge is after the trial" : null, "/dashboard/billing");
  add(
    "funding",
    "Meta Payment Method Verified",
    funding?.done ?? false,
    !connected ? null : funding ? (funding.done ? "Meta can charge your ad account" : funding.unknown ? "Mairo couldn't confirm this with Meta just now — it will check again" : funding.detail) : null,
    funding?.href ?? "/dashboard/meta",
    Boolean(funding?.unknown),
  );
  if (plan.campaignType === "LEAD_FORM") {
    add("leadform", "Write Your Lead Form Questions", Boolean(leadForm), leadForm ? null : "The questions people answer inside the ad.", "/dashboard/leads?setup=1");
  }
  add("goal", "Confirm campaign goal", past("goal"), null, null);
  add("audience", "Confirm audience", past("audience"), "Confirm the location with Meta's place search", null);
  add("creatives", "Generate / approve creatives", past("ad"), "From your approved concepts and hooks", null);
  add("budget", "Confirm ad budget", past("budget"), null, null);
  add("split", "Confirm platform split", past("budget"), null, null);
  add("placements", "Confirm placements", past("budget"), null, null);
  add("check", "Run Pre-Launch Ad Score", past("review"), null, null);
  add("build", "Build Campaign", built, built ? "Built in your ad account, paused" : null, null);
  add("approval", "Final Review", Boolean(campaign?.launchApprovedAt), null, null);
  add("launch", "Launch", launched, null, null);

  let currentSet = false;
  const steps: JourneyStep[] = raw.map((s) => {
    let state: StepState = s.done ? "done" : s.unknown ? "unknown" : "todo";
    if (!s.done && !currentSet) {
      currentSet = true;
      if (state === "todo") state = "current";
    }
    return { id: s.id, label: s.label, state, detail: s.detail, href: s.href };
  });

  const pc = pcs[0] ?? null;
  const comparison = campaign && built
    ? compareWithPlan(
        plan,
        {
          objective: campaign.objective,
          budgetType: campaign.budgetType,
          totalDailyBudgetCents: campaign.totalDailyBudgetCents,
          lifetimeBudgetCents: campaign.lifetimeBudgetCents,
          destinationType: campaign.destinationType,
          geoLabel: campaign.geoLabel,
          geoRadius: campaign.geoRadius,
          ageMin: campaign.ageMin,
          ageMax: campaign.ageMax,
          advantageAudience: campaign.advantageAudience,
          placements: campaign.placements,
          ads: campaign.ads,
          adSets: pcs.filter((p) => p.externalAdGroupId).length,
        },
        { pixelActive: pixel ? canOptimizeTowards(pixel.status) : false },
      )
    : null;

  const next: Journey["next"] = launched ? "live" : !connected ? "connect" : !built ? "build" : campaign?.launchApprovedAt ? "waiting" : "review";

  return {
    plan,
    approvedAt: row.approvedAt,
    activated: Boolean(row.activatedAt),
    billingOn: billingEnforced(),
    steps,
    draftId: draft?.id ?? null,
    campaign: campaign
      ? { id: campaign.id, name: campaign.name, launchApprovedAt: campaign.launchApprovedAt, reviewState: pc?.adReviewState ?? null, lastError: pc?.lastError ?? null }
      : null,
    comparison,
    built,
    launched,
    launchedAt,
    next,
  };
}
