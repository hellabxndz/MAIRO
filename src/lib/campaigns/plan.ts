import type {
  AdDestination,
  AdGoal,
  MessageChannel,
  MetaPlacement,
  SpecialAdCategory,
} from "@/generated/prisma/enums";
import type { PagePost } from "@/lib/campaigns/sales-source";
import type { Promotes } from "@/lib/campaigns/objectives";
import { AGE_CEILING, AGE_FLOOR } from "@/lib/campaigns/audience";
import { instantFromLocal } from "@/lib/campaigns/schedule";
import type { CopyOption } from "@/lib/campaigns/ad-copy";

// Everything the Create wizard knows about the campaign being planned, in one
// serializable shape: it is what the screens edit, what a draft saves, what the
// review checks and what becomes the form the server builds from.

/** The Create wizard's screens, in order. */
export const WIZARD_STEPS = [
  { id: "business", label: "Your Business" },
  { id: "goal", label: "Your Goal" },
  { id: "audience", label: "Your Audience" },
  { id: "budget", label: "Your Budget" },
  { id: "ad", label: "Your Advertisement" },
  { id: "review", label: "AI Review" },
  { id: "launch", label: "Launch" },
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number]["id"];

export function isWizardStep(value: unknown): value is WizardStep {
  return WIZARD_STEPS.some((s) => s.id === value);
}

export type AdChoice =
  | "none"
  | "generate"
  | "attached"
  | "upload"
  /** A video the customer uploads. */
  | "video"
  /** Pictures the customer uploads themselves — no credits, one ad each. */
  | "images"
  /** An ad already in their Meta ad account. */
  | "EXISTING_AD"
  | "later"
  | "FACEBOOK_POST"
  | "INSTAGRAM_POST";

export type CampaignPlan = {
  service: "meta" | "tiktok" | "multi";
  /** Who the campaign is for — the business, unless they said otherwise. */
  businessName: string;
  promotes: Promotes | null;
  /** The product, service or offer, when it's one thing. */
  promotesDetail: string;
  offering: string;
  targetAudience: string;
  differentiator: string;
  website: string;
  goal: AdGoal | null;
  destinationType: AdDestination | null;
  /** The URL, phone number or app store link the destination needs. */
  destinationValue: string;
  messageChannel: MessageChannel;
  metaAppId: string;
  audienceMode: "ai" | "manual";
  geoKey: string | null;
  geoLabel: string | null;
  geoRadius: number;
  ageMin: number;
  ageMax: number;
  genders: number;
  specialAdCategory: SpecialAdCategory | null;
  choosingPlacements: boolean;
  placements: MetaPlacement[];
  budgetType: "DAILY" | "LIFETIME";
  /** Dollars per day. */
  dailyAmount: number;
  /** Dollars for the whole run. */
  lifetimeAmount: number;
  /** Meta's share of a Meta + TikTok budget, in whole per cent. */
  metaPercent: number;
  startOnDate: boolean;
  startLocal: string;
  endOnDate: boolean;
  endLocal: string;
  timeZone: string;
  adChoice: AdChoice;
  selectedPost: PagePost | null;
  attachedPreview: string | null;
  /** The Creative Studio asset attached as the ad's picture. */
  studioAssetId: string | null;
  video: PlanVideo | null;
  /** The customer's own pictures, when adChoice is "images". */
  images: PlanImage[];
  existingAd: { id: string; name: string; thumbnailUrl: string | null; headline: string | null; body: string | null } | null;
  /** The versions of the ad's words, as written and then edited. */
  copyOptions: CopyOption[];
  /** Which version runs. */
  chosenCopy: number;
  /** Run several versions as separate ads and let Meta favour the winner. */
  testing: boolean;
  /** The versions in the test, by index into copyOptions. */
  testPicks: number[];
};

export type PlanImage = {
  url: string;
  name: string;
  width: number;
  height: number;
};

/** How many of their own pictures one campaign takes. */
export const MAX_OWN_IMAGES = 5;

export type PlanVideo = {
  url: string;
  posterUrl: string;
  name: string;
  width: number;
  height: number;
  durationSec: number;
  bytes: number;
};

/** The ad choices that carry words the customer writes. */
export function hasOwnWords(plan: Pick<CampaignPlan, "adChoice">): boolean {
  return plan.adChoice === "attached" || plan.adChoice === "video" || plan.adChoice === "images";
}

/** The versions that will run, in order: the chosen one first. */
export function runningCopy(plan: CampaignPlan): CopyOption[] {
  const chosen = plan.copyOptions[plan.chosenCopy];
  if (!chosen) return [];
  if (!plan.testing) return [chosen];
  const others = plan.testPicks
    .filter((i) => i !== plan.chosenCopy)
    .map((i) => plan.copyOptions[i])
    .filter((c): c is CopyOption => Boolean(c));
  return [chosen, ...others];
}

export function newPlan(input: {
  service: CampaignPlan["service"];
  businessName: string;
  website: string | null;
  offering: string | null;
  targetAudience: string | null;
  differentiator: string | null;
  messageChannel: MessageChannel;
  timeZone: string;
  metaPercent: number;
}): CampaignPlan {
  return {
    service: input.service,
    businessName: input.businessName,
    promotes: null,
    promotesDetail: "",
    offering: input.offering ?? "",
    targetAudience: input.targetAudience ?? "",
    differentiator: input.differentiator ?? "",
    website: input.website ?? "",
    goal: null,
    destinationType: null,
    destinationValue: "",
    messageChannel: input.messageChannel,
    metaAppId: "",
    audienceMode: "ai",
    geoKey: null,
    geoLabel: null,
    geoRadius: 10,
    ageMin: AGE_FLOOR,
    ageMax: AGE_CEILING,
    genders: 0,
    specialAdCategory: null,
    choosingPlacements: false,
    placements: [],
    budgetType: "DAILY",
    dailyAmount: 20,
    lifetimeAmount: 300,
    metaPercent: input.metaPercent,
    startOnDate: false,
    startLocal: "",
    endOnDate: false,
    endLocal: "",
    timeZone: input.timeZone,
    adChoice: "none",
    selectedPost: null,
    attachedPreview: null,
    studioAssetId: null,
    video: null,
    images: [],
    existingAd: null,
    copyOptions: [],
    chosenCopy: 0,
    testing: false,
    testPicks: [],
  };
}

/** The budget choices offered before "custom". */
export const DAILY_PRESETS = [10, 20, 50] as const;

/** Below this Meta can barely deliver at all; the review blocks it. */
export const MIN_DAILY_CENTS = 100;
/** Below this there's rarely enough delivery to learn from; the review says so. */
export const LOW_DAILY_CENTS = 500;

export type PlannedSpend = {
  /** The most this plan can spend, in cents. Null when it runs with no end. */
  maxCents: number | null;
  /** What it spends in a typical day, in cents. */
  perDayCents: number;
  /** How many days it runs, when it has an end. */
  days: number | null;
  /** What 30 days costs, for a campaign with no end. */
  per30DaysCents: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The planned spend, worked out the way the networks will spend it.
 *
 * A daily budget with no end has no maximum — it runs until stopped — so the
 * honest figure is what 30 days costs, not an invented total.
 */
export function plannedSpend(plan: CampaignPlan, now: Date = new Date()): PlannedSpend {
  const start = plan.startOnDate ? instantFromLocal(plan.startLocal, plan.timeZone) : null;
  const end = plan.endOnDate ? instantFromLocal(plan.endLocal, plan.timeZone) : null;
  const from = start && start.getTime() > now.getTime() ? start : now;
  const days = end ? Math.max(1, Math.ceil((end.getTime() - from.getTime()) / DAY_MS)) : null;

  if (plan.budgetType === "LIFETIME") {
    const total = Math.round(plan.lifetimeAmount * 100);
    const perDay = days ? Math.floor(total / days) : total;
    return { maxCents: total, perDayCents: perDay, days, per30DaysCents: perDay * 30 };
  }

  const perDay = Math.round(plan.dailyAmount * 100);
  return {
    maxCents: days ? perDay * days : null,
    perDayCents: perDay,
    days,
    per30DaysCents: perDay * 30,
  };
}

/** Whole dollars, for amounts shown to a person. */
export function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  });
}
