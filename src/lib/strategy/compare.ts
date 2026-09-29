import type { AdDestination, AdGoal, BudgetType, MetaPlacement } from "@/generated/prisma/enums";
import {
  GOAL_LABEL,
  PLATFORM_LABEL,
  agesText,
  campaignTypeInfo,
  platformsText,
  usd,
  type PlanPlatform,
  type StrategyContent,
} from "./plan-logic";

// APPROVED PLAN beside REAL CAMPAIGN, before the business presses Launch.
//
// Pure, so it's checked by scripts/check-strategy-plan.ts. Every row says
// whether the campaign matches the plan; where it doesn't, it says why in
// plain words. A difference Mairo expects (interests aren't hard limits on
// Meta) is "explained" rather than hidden.

export type RealCampaign = {
  objective: AdGoal;
  budgetType: BudgetType;
  totalDailyBudgetCents: number;
  lifetimeBudgetCents: number | null;
  destinationType: AdDestination;
  geoLabel: string | null;
  geoRadius: number | null;
  ageMin: number;
  ageMax: number;
  advantageAudience: boolean;
  placements: MetaPlacement[];
  ads: { headline: string | null; primaryText: string | null; kind: string }[];
  /** Ad sets actually built on Meta. */
  adSets: number;
};

export type CompareRow = {
  key: "goal" | "budget" | "platforms" | "audience" | "interests" | "campaignType" | "structure" | "creative" | "tracking";
  label: string;
  approved: string;
  real: string;
  status: "same" | "different" | "explained";
  note: string | null;
};

const DESTINATION_LABEL: Record<AdDestination, string> = {
  WEBSITE: "People go to your website",
  PHONE_CALL: "People tap to call you",
  LEAD_FORM: "People fill in a quick form",
  DIRECT_MESSAGE: "People message you",
  POST_ENGAGEMENT: "People react to the ad",
  APP: "People install your app",
};

export function platformsOfPlacements(placements: MetaPlacement[]): PlanPlatform[] {
  if (placements.length === 0) return ["FACEBOOK", "INSTAGRAM"];
  const out = new Set<PlanPlatform>();
  for (const p of placements) {
    if (p === "FACEBOOK_FEED") out.add("FACEBOOK");
    else if (p === "INSTAGRAM_FEED") out.add("INSTAGRAM");
    else {
      out.add("FACEBOOK");
      out.add("INSTAGRAM");
    }
  }
  return (["FACEBOOK", "INSTAGRAM"] as const).filter((p) => out.has(p));
}

function sameLocation(plan: string, real: string | null): boolean {
  if (!plan.trim()) return true;
  if (!real) return false;
  const first = plan.toLowerCase().split(/[,(]/)[0].trim();
  return first.length > 0 && real.toLowerCase().includes(first);
}

export function trackingFor(goal: AdGoal, destination: AdDestination, pixelActive: boolean): { text: string; ok: boolean } {
  if (goal === "SALES") {
    return pixelActive
      ? { text: "Purchases counted by the Meta Pixel on your website", ok: true }
      : { text: "Purchases can't be counted yet — the Meta Pixel isn't set up", ok: false };
  }
  if (destination === "LEAD_FORM") return { text: "Leads counted by Meta when the form is sent", ok: true };
  if (destination === "PHONE_CALL") return { text: "Taps on Call counted by Meta (not how long calls last)", ok: true };
  if (destination === "DIRECT_MESSAGE") return { text: "Conversations started, counted by Meta", ok: true };
  if (destination === "APP") return { text: "Installs counted through your app's Meta SDK", ok: true };
  return pixelActive
    ? { text: "Visits and actions counted by the Meta Pixel", ok: true }
    : { text: "Link clicks counted by Meta; actions on your site need the Meta Pixel", ok: true };
}

export function compareWithPlan(plan: StrategyContent, real: RealCampaign, ctx: { pixelActive: boolean }): CompareRow[] {
  const rows: CompareRow[] = [];

  rows.push({
    key: "goal",
    label: "Goal",
    approved: GOAL_LABEL[plan.goal],
    real: GOAL_LABEL[real.objective],
    status: plan.goal === real.objective ? "same" : "different",
    note: plan.goal === real.objective ? null : "The goal was changed while building the campaign. Meta will optimise for the campaign's goal.",
  });

  const realDaily = real.budgetType === "DAILY" ? real.totalDailyBudgetCents / 100 : null;
  const budgetSame = realDaily !== null && Math.abs(realDaily - plan.dailyBudget) < 0.01;
  rows.push({
    key: "budget",
    label: "Budget",
    approved: `${usd(plan.dailyBudget)}/day`,
    real: realDaily !== null ? `${usd(realDaily)}/day` : `${usd((real.lifetimeBudgetCents ?? 0) / 100)} in total`,
    status: budgetSame ? "same" : "different",
    note: budgetSame
      ? null
      : realDaily === null
        ? "Set as a total for the whole run instead of a daily amount."
        : realDaily > plan.dailyBudget
          ? `${usd(realDaily - plan.dailyBudget)}/day more than your approved plan — set while building the campaign.`
          : `${usd(plan.dailyBudget - realDaily)}/day less than your approved plan — set while building the campaign.`,
  });

  const realPlatforms = platformsOfPlacements(real.placements);
  const platformsSame = platformsText(realPlatforms) === platformsText(plan.platforms);
  rows.push({
    key: "platforms",
    label: "Platforms & placements",
    approved: platformsText(plan.platforms),
    real: real.placements.length === 0 ? "Facebook + Instagram — Meta chooses the placements" : `${platformsText(realPlatforms)} — ${real.placements.length} chosen placement${real.placements.length === 1 ? "" : "s"}`,
    status: platformsSame ? "same" : "different",
    note: platformsSame ? null : `The campaign runs on ${platformsText(realPlatforms)}, not ${platformsText(plan.platforms)} as approved.`,
  });

  const where = real.geoLabel ? `${real.geoLabel}${real.geoRadius ? ` + ${real.geoRadius} mi` : ""}` : "Whole United States";
  const agesSame = real.ageMin === plan.audience.ageMin && real.ageMax === plan.audience.ageMax;
  const locSame = sameLocation(plan.audience.location, real.geoLabel);
  rows.push({
    key: "audience",
    label: "Audience",
    approved: `${plan.audience.location || "Location not set"} · ages ${agesText(plan.audience)}`,
    real: `${where} · ages ${agesText(real)}${real.advantageAudience ? " · Meta may widen" : ""}`,
    status: agesSame && locSame ? "same" : "different",
    note: agesSame && locSame
      ? null
      : [!locSame ? "The location differs from your plan." : "", !agesSame ? "The age range differs from your plan." : ""].filter(Boolean).join(" "),
  });

  if (plan.audience.interests.length) {
    rows.push({
      key: "interests",
      label: "Interests",
      approved: plan.audience.interests.join(", "),
      real: "Not set as hard limits",
      status: "explained",
      note: "Meta finds people like these on its own and does better without strict interest limits, so Mairo uses them to shape the ads rather than to fence the audience.",
    });
  }

  const type = campaignTypeInfo(plan.campaignType);
  const typeSame = type.destination === real.destinationType;
  rows.push({
    key: "campaignType",
    label: "Campaign type",
    approved: type.label,
    real: DESTINATION_LABEL[real.destinationType],
    status: typeSame ? "same" : "different",
    note: typeSame ? null : "Where people go when they tap the ad was changed while building the campaign.",
  });

  const planned = plan.structure.filter((r) => r.level === "Ad set").length;
  rows.push({
    key: "structure",
    label: "Campaign structure",
    approved: `${planned} ad set${planned === 1 ? "" : "s"}`,
    real: `${real.adSets} ad set${real.adSets === 1 ? "" : "s"}`,
    status: planned === real.adSets ? "same" : "explained",
    note:
      planned === real.adSets
        ? null
        : "Mairo builds the new-customer ad set first. The retargeting and test ad sets in your plan need people who've already seen your ads, so Mairo will suggest adding them from your dashboard once there are enough — it won't add them on its own.",
  });

  const ads = real.ads;
  rows.push({
    key: "creative",
    label: "Creative",
    approved: `${plan.concepts.length} concepts · ${plan.hooks.length} hooks`,
    real: ads.length ? `${ads.length} ad${ads.length === 1 ? "" : "s"}${ads[0].headline ? ` — “${ads[0].headline}”` : ""}` : "No ad yet",
    status: ads.length ? "explained" : "different",
    note: ads.length ? "Your final ads, made in the Ad step from your approved creative strategy." : "The campaign has no ad yet, so it can't run.",
  });

  const approvedTracking = trackingFor(plan.goal, type.destination as AdDestination, ctx.pixelActive);
  const realTracking = trackingFor(real.objective, real.destinationType, ctx.pixelActive);
  rows.push({
    key: "tracking",
    label: "Tracking",
    approved: approvedTracking.text,
    real: realTracking.text,
    status: !realTracking.ok ? "different" : approvedTracking.text === realTracking.text ? "same" : "explained",
    note: !realTracking.ok
      ? "Mairo won't report purchases it can't see. Set up the Meta Pixel in Tracking before launching, or launch knowing sales won't be counted."
      : approvedTracking.text === realTracking.text
        ? null
        : "Follows the campaign's goal and where people go.",
  });

  return rows;
}

export { PLATFORM_LABEL };
