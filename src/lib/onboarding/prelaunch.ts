// The pre-launch review: everything a business is about to say yes to,
// before its first campaign spends anything.
//
// Two bills are kept visibly apart. The ad budget is paid to Meta, charged by
// Meta to the business's own ad account. The MAIRO subscription is paid to
// MAIRO through Stripe. Neither is ever described as the other.
//
// composePreLaunch is pure (the tests use it); loadPreLaunch reads the
// records for one business.

import { db } from "@/lib/db";
import { planFor } from "@/lib/plans";
import { hasActivePlan } from "@/lib/readiness";
import { canOptimizeTowards } from "@/lib/tracking/pixels";
import { GOAL_LABEL, type StrategyContent } from "@/lib/strategy/plan-logic";
import type { CompareRow } from "@/lib/strategy/compare";
import type { JourneyStep } from "@/lib/strategy/journey";

const OBJECTIVE: Record<string, { label: string; meaning: string }> = {
  LEADS: { label: "Leads", meaning: "Meta shows your ads to people most likely to get in touch." },
  SALES: { label: "Sales", meaning: "Meta shows your ads to people most likely to buy." },
  TRAFFIC: { label: "Website visits", meaning: "Meta shows your ads to people most likely to click through to your site." },
  AWARENESS: { label: "Awareness", meaning: "Meta shows your ads to as many people in your audience as it can." },
  ENGAGEMENT: { label: "Messages and engagement", meaning: "Meta shows your ads to people most likely to message you or react." },
  APP_PROMOTION: { label: "App installs", meaning: "Meta shows your ads to people most likely to install your app." },
};

const PLACEMENT: Record<string, string> = { FACEBOOK_FEED: "Facebook feed", INSTAGRAM_FEED: "Instagram feed", STORIES: "Stories", REELS: "Reels" };
const GENDERS: Record<number, string> = { 0: "Everyone", 1: "Men", 2: "Women" };

const money = (cents: number) => (cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const dollars = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const day = (d: Date, tz?: string) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: tz });

export type ApprovalState = "done" | "pending" | "problem" | "unknown";

export type PreLaunchInput = {
  plan: StrategyContent;
  campaign: {
    id: string;
    name: string;
    objective: string;
    destinationType: string;
    destinationUrl: string | null;
    destinationPhone: string | null;
    geoLabel: string | null;
    geoRadius: number | null;
    ageMin: number;
    ageMax: number;
    genders: number;
    advantageAudience: boolean;
    placements: string[];
    budgetType: string;
    totalDailyBudgetCents: number;
    lifetimeBudgetCents: number | null;
    startDate: Date | null;
    endDate: Date | null;
    launchApprovedAt: Date | null;
    specialAdCategory: string | null;
  };
  ads: { id: string; kind: string; headline: string | null; primaryText: string | null; callToAction: string | null; image: string | null; sourceAdName: string | null }[];
  account: { adAccount: string | null; pageName: string | null; connected: boolean };
  subscription: { tier: string; status: string | null; paid: boolean; trialEnds: Date | null };
  pixelActive: boolean;
  adReview: string | null;
  funding: { state: ApprovalState; detail: string | null };
  differences: CompareRow[];
  timeZone?: string;
};

export type PreLaunch = ReturnType<typeof composePreLaunch>;

export function composePreLaunch(i: PreLaunchInput) {
  const c = i.campaign;
  const objective = OBJECTIVE[c.objective] ?? { label: c.objective, meaning: "" };

  const destination =
    c.destinationType === "PHONE_CALL"
      ? `A call to ${c.destinationPhone ?? "your phone number"}`
      : c.destinationType === "LEAD_FORM"
        ? "A short form MAIRO hosts for you"
        : c.destinationType === "DIRECT_MESSAGE"
          ? "A message to your Facebook Page"
          : c.destinationType === "POST_ENGAGEMENT"
            ? "Reactions and comments on the ad itself"
            : c.destinationUrl
              ? `Your website: ${c.destinationUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`
              : "Your website";

  const location = c.geoLabel ? `${c.geoLabel}${c.geoRadius ? ` and ${c.geoRadius} miles around` : ""}` : i.plan.audience.location || "Not set";
  const audience = {
    location,
    ages: `${c.ageMin}–${c.ageMax}${c.ageMax >= 65 ? "+" : ""}`,
    genders: GENDERS[c.genders] ?? "Everyone",
    widen: c.advantageAudience,
    placements: c.placements.length ? c.placements.map((p) => PLACEMENT[p] ?? p).join(", ") : "Where Meta expects the best results (Facebook and Instagram)",
    interests: i.plan.audience.interests,
    special: c.specialAdCategory,
  };

  const lifetime = c.budgetType === "LIFETIME" && c.lifetimeBudgetCents;
  const perDayCents = lifetime ? null : c.totalDailyBudgetCents;
  const budget = {
    perDay: perDayCents != null ? money(perDayCents) : null,
    per30: perDayCents != null ? money(perDayCents * 30) : null,
    total: lifetime ? money(c.lifetimeBudgetCents!) : null,
    start: c.startDate ? day(c.startDate, i.timeZone) : "As soon as Meta approves the ad",
    end: c.endDate ? day(c.endDate, i.timeZone) : "Runs until you pause or stop it",
    headline: lifetime ? `Up to ${money(c.lifetimeBudgetCents!)} in total` : `${money(c.totalDailyBudgetCents)} a day`,
  };

  const plan = planFor(i.subscription.tier as never);
  const subscription = {
    name: plan.name,
    price: plan.priceMonthly > 0 ? `${dollars(plan.priceMonthly)} a month` : "—",
    status: i.subscription.paid ? (i.subscription.status === "trialing" ? `Free trial${i.subscription.trialEnds ? ` until ${day(i.subscription.trialEnds, i.timeZone)}` : ""}` : "Active") : "Not active",
    paid: i.subscription.paid,
  };

  // What MAIRO and Meta can and can't count, said before launch rather than
  // discovered in the first report.
  const tracking: string[] = [];
  if (c.destinationType === "WEBSITE") {
    if (i.pixelActive) tracking.push("Your Meta pixel is active, so Meta can count sales and sign-ups on your website.");
    else {
      tracking.push("MAIRO can't yet count sales or sign-ups that happen on your website — your Meta pixel isn't active. Meta will count clicks and visits until it is.");
      tracking.push("You can set it up later from Tracking; nothing is lost in the meantime.");
    }
  } else if (c.destinationType === "LEAD_FORM") tracking.push("Every form sent is counted by MAIRO — nothing to install.");
  else if (c.destinationType === "PHONE_CALL") tracking.push("Meta counts taps on the call button. Whether a call became a customer is something only you know — you can mark it in Leads.");
  else if (c.destinationType === "DIRECT_MESSAGE") tracking.push("Meta counts conversations started. Which ones became customers you can mark in Leads.");
  tracking.push("Meta's figures usually arrive a few hours after the ad starts, and can change for a day or two as Meta finishes counting.");

  const reviewDone = i.adReview ? /approved|active/i.test(i.adReview) : false;
  const reviewProblem = i.adReview ? /disapproved|rejected|with_issues/i.test(i.adReview) : false;
  const approvals: { key: string; label: string; who: string; state: ApprovalState; detail: string; fix?: { label: string; href: string; external?: boolean } }[] = [
    {
      key: "you",
      label: "Your approval of this campaign and its budget",
      who: "You",
      state: c.launchApprovedAt ? "done" : "pending",
      detail: c.launchApprovedAt ? `Given ${day(c.launchApprovedAt, i.timeZone)}` : "Below — nothing spends without it",
    },
    {
      key: "subscription",
      label: "Your MAIRO subscription is active",
      who: "Stripe",
      state: i.subscription.paid ? "done" : "problem",
      detail: i.subscription.paid ? subscription.status : "Choose a plan to continue",
      ...(i.subscription.paid ? {} : { fix: { label: "Choose a plan", href: "/dashboard/billing" } }),
    },
    {
      key: "funding",
      label: "Meta can charge your ad account",
      who: "Meta",
      state: i.funding.state,
      detail: i.funding.detail ?? (i.funding.state === "done" ? "Payment method confirmed by Meta" : "Add a payment method in Meta"),
      ...(i.funding.state === "problem" ? { fix: { label: "Add a payment method on Meta", href: "https://business.facebook.com/billing_hub", external: true } } : {}),
    },
    {
      key: "review",
      label: "Meta approves the ad",
      who: "Meta",
      state: reviewProblem ? "problem" : reviewDone ? "done" : "pending",
      detail: reviewProblem ? "Meta flagged the ad — change it and it's reviewed again" : reviewDone ? "Approved by Meta" : "Meta reviews every new ad, usually within a day",
      ...(reviewProblem ? { fix: { label: "Change the ad", href: `/dashboard/campaigns/${c.id}` } } : {}),
    },
  ];

  return {
    campaign: { id: c.id, name: c.name },
    goal: { label: GOAL_LABEL[i.plan.goal], why: i.plan.goalWhy },
    objective,
    destination,
    audience,
    ads: i.ads.map((a, n) => ({
      ...a,
      label: n === 0 ? "Main ad" : `Test version ${n}`,
      text: a.kind === "EXISTING_AD" ? `Runs your existing ad${a.sourceAdName ? ` “${a.sourceAdName}”` : ""} again` : null,
    })),
    account: i.account,
    budget,
    subscription,
    tracking,
    approvals,
    differences: i.differences.filter((d) => d.status === "different"),
    launchApproved: Boolean(c.launchApprovedAt),
    ready: i.subscription.paid && i.account.connected && !reviewProblem,
  };
}

/** Everything about the plan's campaign that the review shows, for one business. */
export async function loadPreLaunch(
  organizationId: string,
  journey: { plan: StrategyContent; campaign: { id: string; reviewState: string | null } | null; comparison: CompareRow[] | null; steps: JourneyStep[] },
): Promise<PreLaunch | null> {
  if (!journey.campaign) return null;
  const [campaign, ads, org, meta, pixel] = await Promise.all([
    db.mairoCampaign.findFirst({ where: { id: journey.campaign.id, organizationId } }),
    db.campaignAd.findMany({ where: { mairoCampaignId: journey.campaign.id, mairoCampaign: { organizationId } }, orderBy: { position: "asc" } }),
    db.organization.findUnique({ where: { id: organizationId }, select: { subscriptionTier: true, subscriptionStatus: true, paymentRequired: true, currentPeriodEnd: true, timezone: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { status: true, metaAdAccountId: true, pageName: true } }),
    db.trackingPixel.findUnique({ where: { organizationId_platform: { organizationId, platform: "META" } }, select: { status: true } }),
  ]);
  if (!campaign || !org) return null;
  const creativeIds = ads.map((a) => a.creativeRequestId).filter((x): x is string => Boolean(x));
  const creatives = creativeIds.length ? await db.creativeRequest.findMany({ where: { id: { in: creativeIds }, organizationId }, select: { id: true, assetUrl: true } }) : [];
  const asset = new Map(creatives.map((c) => [c.id, c.assetUrl]));
  const funding = journey.steps.find((s) => s.id === "funding");
  return composePreLaunch({
    plan: journey.plan,
    campaign,
    ads: ads.map((a) => ({
      id: a.id,
      kind: a.kind,
      headline: a.headline,
      primaryText: a.primaryText,
      callToAction: a.callToAction,
      image: a.imageUrl ?? a.videoPosterUrl ?? (a.creativeRequestId ? (asset.get(a.creativeRequestId) ?? null) : null),
      sourceAdName: a.sourceAdName,
    })),
    account: { adAccount: meta?.metaAdAccountId ?? null, pageName: meta?.pageName ?? null, connected: meta?.status === "CONNECTED" },
    subscription: { tier: org.subscriptionTier, status: org.subscriptionStatus, paid: hasActivePlan(org), trialEnds: org.subscriptionStatus === "trialing" ? org.currentPeriodEnd : null },
    pixelActive: pixel ? canOptimizeTowards(pixel.status) : false,
    adReview: journey.campaign.reviewState,
    funding: funding ? { state: funding.state === "done" ? "done" : funding.state === "unknown" ? "unknown" : "problem", detail: funding.detail } : { state: "unknown", detail: null },
    differences: journey.comparison ?? [],
    timeZone: org.timezone,
  });
}
