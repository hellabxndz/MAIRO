import type { AdDestination, AdGoal, BudgetType, MessageChannel, MetaPlacement, SpecialAdCategory } from "@/generated/prisma/enums";
import { PROMOTES_OPTIONS, type Promotes } from "@/lib/campaigns/objectives";
import { AGE_CEILING, AGE_FLOOR } from "@/lib/campaigns/audience";
import type { CampaignPlan, WizardStep } from "@/lib/campaigns/plan";

// "Similar to my previous campaign": a new plan that starts from one the
// business already ran, so doing it again is a couple of changes rather than
// seven screens of answers.
//
// What carries over is what the campaign row records: the goal, where people
// go, who sees it, the budget and what it promoted. What doesn't is the ad
// itself and the dates — a new campaign gets its own ad (the wizard's Ad step
// always runs) and starts when it's approved. Nothing is built, launched or
// spent by copying: it's a draft in the wizard, which still ends at the AI
// review and an explicit Launch.

export type PreviousCampaign = {
  name: string;
  objective: AdGoal;
  destinationType: AdDestination;
  destinationUrl: string | null;
  destinationPhone: string | null;
  messageChannel: MessageChannel;
  geoKey: string | null;
  geoLabel: string | null;
  geoRadius: number | null;
  ageMin: number;
  ageMax: number;
  genders: number;
  totalDailyBudgetCents: number;
  budgetType: BudgetType;
  lifetimeBudgetCents: number | null;
  placements: MetaPlacement[];
  specialAdCategory: SpecialAdCategory | null;
  metaAppId: string | null;
  promotes: string | null;
};

/** The parts of a previous campaign that start the new plan. */
export function planFromCampaign(fresh: CampaignPlan, c: PreviousCampaign): CampaignPlan {
  const promotes = PROMOTES_OPTIONS.some((o) => o.value === c.promotes) ? (c.promotes as Promotes) : fresh.promotes;
  const targeted = Boolean(c.geoKey) || c.ageMin !== AGE_FLOOR || c.ageMax !== AGE_CEILING || c.genders !== 0;
  return {
    ...fresh,
    promotes,
    goal: c.objective,
    destinationType: c.destinationType,
    destinationValue: (c.destinationType === "PHONE_CALL" ? c.destinationPhone : c.destinationUrl) ?? "",
    messageChannel: c.messageChannel,
    metaAppId: c.metaAppId ?? "",
    audienceMode: targeted ? "manual" : "ai",
    geoKey: c.geoKey,
    geoLabel: c.geoLabel,
    geoRadius: c.geoRadius ?? fresh.geoRadius,
    ageMin: c.ageMin,
    ageMax: c.ageMax,
    genders: c.genders,
    specialAdCategory: c.specialAdCategory,
    choosingPlacements: c.placements.length > 0,
    placements: c.placements,
    budgetType: c.budgetType,
    dailyAmount: c.totalDailyBudgetCents > 0 ? Math.round(c.totalDailyBudgetCents) / 100 : fresh.dailyAmount,
    lifetimeAmount: c.lifetimeBudgetCents ? Math.round(c.lifetimeBudgetCents) / 100 : fresh.lifetimeAmount,
  };
}

/** "What would you like to change?" — each answer opens the wizard on that step. */
export const REPEAT_CHANGES: { key: string; label: string; hint: string; step: WizardStep }[] = [
  { key: "ad", label: "Just a new ad", hint: "Same goal, audience and budget", step: "ad" },
  { key: "budget", label: "The budget", hint: "Spend more or less each day", step: "budget" },
  { key: "audience", label: "Who sees it", hint: "Place, age or people", step: "audience" },
  { key: "business", label: "What I'm promoting", hint: "A different product, service or offer", step: "business" },
];

/** Steps a copied plan may open on: never the review or launch, which are always reached by going through. */
export function repeatStep(raw: string | undefined): WizardStep | null {
  return REPEAT_CHANGES.find((c) => c.step === raw)?.step ?? null;
}

/** "Promote something different": a plan whose first answer is already filled in. */
export function planAbout(fresh: CampaignPlan, about: string): CampaignPlan {
  const text = about.trim().slice(0, 200);
  if (!text) return fresh;
  const offer = /(%|\boff\b|\bsale\b|discount|\bdeal\b|\boffer\b|promo|coupon|free shipping)/i.test(text);
  return { ...fresh, promotes: offer ? "OFFER" : "OTHER", promotesDetail: text };
}
