import { z } from "zod";

// The free Mairo Advertising Plan: its shape, and the rules that keep it
// consistent when the business changes one part of it.
//
// Pure — no database, no AI — so every rule here is checked by
// scripts/check-strategy-plan.ts.
//
// Two rules the whole review screen depends on:
//   - Nothing changes silently. Every change, including one made because
//     another part changed, comes back as a PlanChange with its reason.
//   - The business's choice wins. A tradeoff comes back as a Suggestion they
//     can take or leave; it is never applied for them.

export const PLAN_GOALS = ["SALES", "LEADS", "TRAFFIC", "AWARENESS", "ENGAGEMENT", "APP_PROMOTION"] as const;
export type PlanGoal = (typeof PLAN_GOALS)[number];

export const GOAL_LABEL: Record<PlanGoal, string> = {
  SALES: "More online sales",
  LEADS: "More leads and enquiries",
  TRAFFIC: "More website visits",
  AWARENESS: "More people knowing your brand",
  ENGAGEMENT: "More messages and conversations",
  APP_PROMOTION: "More app installs",
};

/** Mairo runs Meta only: Facebook and Instagram. */
export const PLATFORMS = ["FACEBOOK", "INSTAGRAM"] as const;
export type PlanPlatform = (typeof PLATFORMS)[number];
export const PLATFORM_LABEL: Record<PlanPlatform, string> = { FACEBOOK: "Facebook", INSTAGRAM: "Instagram" };

export const CAMPAIGN_TYPES = [
  { value: "SALES_WEBSITE", label: "Sales campaign — purchases on your website", goal: "SALES", destination: "WEBSITE" },
  { value: "LEAD_FORM", label: "Lead campaign — a quick form inside the ad", goal: "LEADS", destination: "LEAD_FORM" },
  { value: "LEADS_WEBSITE", label: "Lead campaign — enquiries on your website", goal: "LEADS", destination: "WEBSITE" },
  { value: "CALLS", label: "Call campaign — people tap to ring you", goal: "LEADS", destination: "PHONE_CALL" },
  { value: "MESSAGES", label: "Message campaign — Messenger, Instagram or WhatsApp", goal: "ENGAGEMENT", destination: "DIRECT_MESSAGE" },
  { value: "TRAFFIC", label: "Traffic campaign — visits to your website", goal: "TRAFFIC", destination: "WEBSITE" },
  { value: "AWARENESS", label: "Awareness campaign — reach as many local people as possible", goal: "AWARENESS", destination: "WEBSITE" },
  { value: "APP_INSTALLS", label: "App campaign — installs from the app store", goal: "APP_PROMOTION", destination: "APP" },
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number]["value"];
export const CAMPAIGN_TYPE_VALUES = CAMPAIGN_TYPES.map((t) => t.value) as [CampaignType, ...CampaignType[]];

export function campaignTypeInfo(value: CampaignType) {
  return CAMPAIGN_TYPES.find((t) => t.value === value) ?? CAMPAIGN_TYPES[0];
}

export const AGE_MIN = 18;
export const AGE_MAX = 65;
export const MIN_DAILY = 5;
export const MAX_DAILY = 5000;
/** Below this a single ad set learns slowly. */
export const SLOW_BELOW = 10;
/** From here there is room for a retargeting ad set. */
export const RETARGET_FROM = 30;
/** From here there is room to test two new-customer audiences. */
export const TEST_FROM = 60;

const str = (max: number) => z.string().trim().max(max);

export const conceptSchema = z.object({
  title: str(80).min(1),
  description: str(400).min(1),
  format: z.enum(["image", "video", "carousel"]),
});

export const splitSchema = z.object({ label: str(80).min(1), percent: z.number().min(0).max(100), why: str(300) });
export const structureSchema = z.object({ level: z.enum(["Campaign", "Ad set", "Ads"]), name: str(120).min(1), detail: str(300) });

export const strategySchema = z.object({
  v: z.literal(1).default(1),
  summary: str(900).default(""),
  goal: z.enum(PLAN_GOALS),
  goalWhy: str(400).default(""),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(2),
  platformsWhy: str(400).default(""),
  dailyBudget: z.number().min(MIN_DAILY).max(MAX_DAILY),
  budgetWhy: str(400).default(""),
  audience: z.object({
    summary: str(400).default(""),
    location: str(120).default(""),
    ageMin: z.number().int().min(AGE_MIN).max(AGE_MAX),
    ageMax: z.number().int().min(AGE_MIN).max(AGE_MAX),
    interests: z.array(str(60).min(1)).max(10).default([]),
  }),
  campaignType: z.enum(CAMPAIGN_TYPE_VALUES),
  campaignTypeWhy: str(400).default(""),
  product: str(200).default(""),
  productWhy: str(400).default(""),
  offer: str(200).default(""),
  offerWhy: str(400).default(""),
  creativeStrategy: str(900).default(""),
  concepts: z.array(conceptSchema).max(5).default([]),
  hooks: z.array(str(160).min(1)).max(8).default([]),
  retargeting: str(600).default(""),
  website: z.array(str(300).min(1)).max(6).default([]),
  split: z.array(splitSchema).max(4).default([]),
  structure: z.array(structureSchema).max(8).default([]),
});

export type StrategyContent = z.infer<typeof strategySchema>;

export function parseStrategy(raw: string | null | undefined): StrategyContent | null {
  if (!raw) return null;
  try {
    const parsed = strategySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// --- Sections -------------------------------------------------------------

export const SECTIONS = [
  { key: "goal", label: "Business Goal" },
  { key: "platforms", label: "Platforms" },
  { key: "budget", label: "Budget" },
  { key: "audience", label: "Target Audience" },
  { key: "campaignType", label: "Campaign Type" },
  { key: "product", label: "Products / Services" },
  { key: "offer", label: "Offer" },
  { key: "creativeStrategy", label: "Creative Strategy" },
  { key: "concepts", label: "Creative Concepts" },
  { key: "hooks", label: "Recommended Hooks" },
  { key: "retargeting", label: "Retargeting Strategy" },
  { key: "website", label: "Website Recommendations" },
  { key: "split", label: "Budget Split" },
  { key: "structure", label: "Campaign Structure" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];
export const SECTION_LABEL = Object.fromEntries(SECTIONS.map((s) => [s.key, s.label])) as Record<SectionKey, string>;
export const SECTION_KEYS = SECTIONS.map((s) => s.key) as SectionKey[];

/** The parts of the plan each section is made of, for comparing two versions. */
function sectionValue(p: StrategyContent, key: SectionKey): unknown {
  switch (key) {
    case "goal": return p.goal;
    case "platforms": return [...p.platforms].sort();
    case "budget": return p.dailyBudget;
    case "audience": return { ...p.audience, summary: undefined };
    case "campaignType": return p.campaignType;
    case "product": return p.product;
    case "offer": return p.offer;
    case "creativeStrategy": return p.creativeStrategy;
    case "concepts": return p.concepts;
    case "hooks": return p.hooks;
    case "retargeting": return p.retargeting;
    case "website": return p.website;
    case "split": return p.split.map((s) => [s.label, s.percent]);
    case "structure": return p.structure.map((s) => [s.level, s.name, s.detail]);
  }
}

export function changedSections(prev: StrategyContent, next: StrategyContent): SectionKey[] {
  return SECTION_KEYS.filter((k) => JSON.stringify(sectionValue(prev, k)) !== JSON.stringify(sectionValue(next, k)));
}

export function usd(n: number): string {
  return Number.isInteger(n) ? `$${n.toLocaleString("en-US")}` : `$${n.toFixed(2)}`;
}

export function platformsText(platforms: PlanPlatform[]): string {
  const sorted = PLATFORMS.filter((p) => platforms.includes(p));
  return sorted.map((p) => PLATFORM_LABEL[p]).join(" + ");
}

export function agesText(a: { ageMin: number; ageMax: number }): string {
  return `${a.ageMin}–${a.ageMax >= AGE_MAX ? "65+" : a.ageMax}`;
}

/** One line per section, for "Previous" and "Updated". */
export function describeSection(p: StrategyContent, key: SectionKey): string {
  switch (key) {
    case "goal": return GOAL_LABEL[p.goal];
    case "platforms": return platformsText(p.platforms);
    case "budget": return `${usd(p.dailyBudget)}/day (about ${usd(Math.round(p.dailyBudget * 30))}/month)`;
    case "audience":
      return [p.audience.location || "Location to confirm", agesText(p.audience), p.audience.interests.slice(0, 4).join(", ")].filter(Boolean).join(" · ");
    case "campaignType": return campaignTypeInfo(p.campaignType).label;
    case "product": return p.product || "Not set";
    case "offer": return p.offer || "No offer";
    case "creativeStrategy": return clip(p.creativeStrategy, 160) || "Not set";
    case "concepts": return p.concepts.map((c) => c.title).join(" · ") || "None";
    case "hooks": return p.hooks.length ? `${p.hooks.length} hooks — “${clip(p.hooks[0], 70)}”…` : "None";
    case "retargeting": return clip(p.retargeting, 160) || "Not set";
    case "website": return p.website.length ? `${p.website.length} recommendation${p.website.length === 1 ? "" : "s"}` : "None";
    case "split": return p.split.map((s) => `${s.label} ${s.percent}%`).join(" · ");
    case "structure": return structureText(p);
  }
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

function structureText(p: StrategyContent): string {
  const sets = p.structure.filter((s) => s.level === "Ad set").length;
  const ads = p.concepts.length || 1;
  return `1 campaign · ${sets} ad set${sets === 1 ? "" : "s"} · ${ads} ad${ads === 1 ? "" : "s"} each`;
}

// --- Recommendations that follow from other choices ------------------------

export function budgetWhyFor(daily: number, platforms: PlanPlatform[]): string {
  const both = platforms.length === 2;
  if (daily < SLOW_BELOW) {
    return `At ${usd(daily)}/day results will build slowly — Meta needs a steady number of results each week to learn who responds. Expect the first weeks to be about learning, not volume.`;
  }
  if (daily < RETARGET_FROM) {
    return `At ${usd(daily)}/day Mairo keeps everything in one ad set${both ? ", shared across Facebook and Instagram," : ""} so Meta can learn faster instead of splitting a small budget.`;
  }
  if (daily < TEST_FROM) {
    return `${usd(daily)}/day is enough to reach new customers and remind people who already showed interest, in two ad sets.`;
  }
  return `${usd(daily)}/day gives room to test two new-customer audiences against each other and still run reminder ads.`;
}

export function recommendedSplit(p: Pick<StrategyContent, "dailyBudget" | "platforms">): StrategyContent["split"] {
  const both = p.platforms.length === 2;
  const shared = both ? " Facebook and Instagram share it automatically — Meta shows each ad where it costs least." : "";
  if (p.dailyBudget < RETARGET_FROM) {
    return [{ label: "New customers", percent: 100, why: `All of ${usd(p.dailyBudget)}/day goes to finding new customers; split further and neither part gets enough results to learn.${shared}` }];
  }
  const retarget = Math.round(p.dailyBudget * 0.2 * 100) / 100;
  return [
    { label: "New customers", percent: 80, why: `${usd(Math.round((p.dailyBudget - retarget) * 100) / 100)}/day to reach people who don't know you yet.${shared}` },
    { label: "Retargeting", percent: 20, why: `${usd(retarget)}/day for reminder ads to people who visited or engaged.` },
  ];
}

export function recommendedRetargeting(p: Pick<StrategyContent, "dailyBudget" | "offer" | "product">): string {
  const hook = p.offer || p.product || "your best offer";
  if (p.dailyBudget < RETARGET_FROM) {
    return `Hold retargeting for now. At ${usd(p.dailyBudget)}/day Mairo puts everything into reaching new customers first. Once around 1,000 people have visited or engaged, Mairo will suggest adding reminder ads with about 20% of the budget.`;
  }
  return `About 20% of the budget shows reminder ads to people who visited your website or engaged with you on Facebook or Instagram in the last 30 days, leading with ${hook}.`;
}

export function recommendedStructure(p: StrategyContent): StrategyContent["structure"] {
  const where = p.audience.location || "your area";
  const who = `${where}, ages ${agesText(p.audience)}`;
  const ads = Math.max(1, p.concepts.length);
  const rows: StrategyContent["structure"] = [
    { level: "Campaign", name: `${GOAL_LABEL[p.goal]} — ${p.product || "your business"}`, detail: `${usd(p.dailyBudget)}/day on ${platformsText(p.platforms)}` },
  ];
  if (p.dailyBudget >= TEST_FROM) {
    rows.push({ level: "Ad set", name: "New customers — interests", detail: `${who}; interests: ${p.audience.interests.slice(0, 3).join(", ") || "from your plan"}` });
    rows.push({ level: "Ad set", name: "New customers — broad", detail: `${who}; Meta finds the people most likely to respond` });
  } else {
    rows.push({ level: "Ad set", name: "New customers", detail: who });
  }
  if (p.dailyBudget >= RETARGET_FROM) {
    rows.push({ level: "Ad set", name: "Retargeting", detail: "People who visited or engaged in the last 30 days" });
  }
  rows.push({ level: "Ads", name: `${ads} ad${ads === 1 ? "" : "s"} in each ad set`, detail: "One per creative concept, so Meta can favour the one that works" });
  return rows;
}

export function defaultCampaignType(goal: PlanGoal, destination?: string | null): CampaignType {
  const match = CAMPAIGN_TYPES.find((t) => t.goal === goal && t.destination === destination);
  if (match) return match.value;
  return (CAMPAIGN_TYPES.find((t) => t.goal === goal) ?? CAMPAIGN_TYPES[0]).value;
}

export type PlanChange = {
  section: SectionKey;
  previous: string;
  updated: string;
  reason: string;
  /** True when this changed because another part did. */
  dependent: boolean;
};

function change(prev: StrategyContent, next: StrategyContent, key: SectionKey, reason: string, dependent: boolean): PlanChange {
  return { section: key, previous: describeSection(prev, key), updated: describeSection(next, key), reason, dependent };
}

/**
 * Brings the rest of the plan in line after some sections changed.
 *
 * `touched` are the sections the business (or Mairo, at their request) changed
 * on purpose; those are never overwritten here. Everything this does change
 * comes back with its reason.
 */
export function reconcile(prev: StrategyContent, input: StrategyContent, touched: SectionKey[]): { plan: StrategyContent; dependent: PlanChange[] } {
  let next = { ...input };
  const t = new Set(touched);
  const dependent: PlanChange[] = [];
  const budgetMoved = prev.dailyBudget !== next.dailyBudget;
  const platformsMoved = platformsText(prev.platforms) !== platformsText(next.platforms);
  const goalMoved = prev.goal !== next.goal;

  if (goalMoved && !t.has("campaignType") && campaignTypeInfo(next.campaignType).goal !== next.goal) {
    const before = next;
    next = { ...next, campaignType: defaultCampaignType(next.goal, campaignTypeInfo(prev.campaignType).destination) };
    next.campaignTypeWhy = `Matches the goal “${GOAL_LABEL[next.goal]}”.`;
    dependent.push(change(before, next, "campaignType", `The goal changed to “${GOAL_LABEL[next.goal]}”, and the old campaign type was built for a different goal.`, true));
  }

  // The explanation under the budget always describes the budget as it is.
  if (budgetMoved || platformsMoved) next = { ...next, budgetWhy: budgetWhyFor(next.dailyBudget, next.platforms) };

  if ((budgetMoved || platformsMoved) && !t.has("split")) {
    const before = next;
    next = { ...next, split: recommendedSplit(next) };
    if (changedSections(before, next).includes("split")) {
      dependent.push(
        change(before, next, "split", budgetMoved
          ? next.dailyBudget < RETARGET_FROM
            ? `At ${usd(next.dailyBudget)}/day, splitting the budget would leave each part too little to learn, so it all goes to new customers.`
            : `At ${usd(next.dailyBudget)}/day there's room to keep 20% for reminder ads.`
          : "Follows the platforms you chose.", true),
      );
    }
  }

  const crossed = (a: number, b: number, line: number) => (a < line) !== (b < line);
  if (budgetMoved && !t.has("retargeting") && crossed(prev.dailyBudget, next.dailyBudget, RETARGET_FROM)) {
    const before = next;
    next = { ...next, retargeting: recommendedRetargeting(next) };
    dependent.push(change(before, next, "retargeting", next.dailyBudget < RETARGET_FROM
      ? `Below ${usd(RETARGET_FROM)}/day Mairo holds reminder ads until there are enough visitors to remind.`
      : `From ${usd(RETARGET_FROM)}/day there's enough budget for reminder ads.`, true));
  }

  const structureDrivers = budgetMoved || platformsMoved || goalMoved || prev.product !== next.product || prev.audience.location !== next.audience.location || agesText(prev.audience) !== agesText(next.audience);
  if (structureDrivers && !t.has("structure")) {
    const before = next;
    next = { ...next, structure: recommendedStructure(next) };
    if (changedSections(before, next).includes("structure")) {
      dependent.push(change(before, next, "structure", budgetMoved
        ? `The number of ad sets follows the budget: ${next.dailyBudget < RETARGET_FROM ? "one" : next.dailyBudget < TEST_FROM ? "two" : "three"} at ${usd(next.dailyBudget)}/day.`
        : "Updated to match the rest of your plan.", true));
    }
  }

  return { plan: next, dependent };
}

// --- Suggestions (tradeoffs the business can take or leave) ---------------

export type SuggestionPatch = Partial<Pick<StrategyContent, "dailyBudget" | "platforms" | "goal" | "campaignType">> & {
  audience?: Partial<StrategyContent["audience"]>;
};

export type Suggestion = {
  id: string;
  message: string;
  applyLabel: string;
  patch: SuggestionPatch;
};

export function suggestionFor(p: StrategyContent, section: SectionKey, ctx: { purchaseTracking: boolean }): Suggestion | null {
  if (section === "budget" && p.dailyBudget < SLOW_BELOW) {
    return {
      id: "budget-floor",
      message: `At ${usd(p.dailyBudget)}/day results will build slowly. Mairo recommends at least ${usd(SLOW_BELOW)}/day so Meta can learn who responds within the first couple of weeks.`,
      applyLabel: `Use ${usd(SLOW_BELOW)}/day`,
      patch: { dailyBudget: SLOW_BELOW },
    };
  }
  if (section === "platforms" && p.platforms.length === 1) {
    const only = PLATFORM_LABEL[p.platforms[0]];
    return {
      id: "both-platforms",
      message: `Running only on ${only} limits where Meta can show your ads, which usually raises the cost of each result. Mairo recommends keeping Facebook and Instagram together and letting Meta put each dollar where it works best.`,
      applyLabel: "Use Facebook + Instagram",
      patch: { platforms: ["FACEBOOK", "INSTAGRAM"] },
    };
  }
  if ((section === "goal" || section === "campaignType") && p.goal === "SALES" && !ctx.purchaseTracking) {
    return {
      id: "sales-tracking",
      message: "Sales campaigns need purchase tracking (the Meta Pixel) on your website so Meta can learn who buys. It isn't set up yet — Mairo suggests starting with website visits and switching to sales once tracking is in place.",
      applyLabel: "Start with website visits",
      patch: { goal: "TRAFFIC", campaignType: "TRAFFIC" },
    };
  }
  if (section === "campaignType" && campaignTypeInfo(p.campaignType).goal !== p.goal) {
    const fit = defaultCampaignType(p.goal);
    return {
      id: "type-goal",
      message: `“${campaignTypeInfo(p.campaignType).label}” is built for a different goal than “${GOAL_LABEL[p.goal]}”. Mairo recommends a campaign type that matches your goal, so Meta optimises for the result you want.`,
      applyLabel: `Use ${campaignTypeInfo(fit).label.split(" — ")[0]}`,
      patch: { campaignType: fit },
    };
  }
  if (section === "audience") {
    const span = p.audience.ageMax - p.audience.ageMin;
    if (span < 10 && p.dailyBudget < TEST_FROM) {
      const ageMin = Math.max(AGE_MIN, p.audience.ageMin - 5);
      const ageMax = Math.min(AGE_MAX, p.audience.ageMax + 5);
      return {
        id: "age-span",
        message: `Ages ${agesText(p.audience)} is a narrow range for ${usd(p.dailyBudget)}/day, which makes each result cost more. Mairo recommends ${agesText({ ageMin, ageMax })} and letting Meta find the people most likely to respond.`,
        applyLabel: `Use ${agesText({ ageMin, ageMax })}`,
        patch: { audience: { ageMin, ageMax } },
      };
    }
  }
  return null;
}

// --- Manual edits ---------------------------------------------------------

export type ManualEdit =
  | { section: "budget"; dailyBudget: number }
  | { section: "platforms"; platforms: PlanPlatform[] }
  | { section: "goal"; goal: PlanGoal }
  | { section: "campaignType"; campaignType: CampaignType }
  | { section: "product"; product: string }
  | { section: "offer"; offer: string }
  | { section: "audience"; location: string; ageMin: number; ageMax: number; interests: string[] };

export type EditResult =
  | { ok: true; plan: StrategyContent; changes: PlanChange[]; suggestion: Suggestion | null }
  | { ok: false; error: string };

export function clampBudget(n: number): number {
  return Math.round(Math.min(MAX_DAILY, Math.max(MIN_DAILY, n)) * 100) / 100;
}

/** Applies what the business typed, then everything that follows from it. */
export function applyEdit(prev: StrategyContent, edit: ManualEdit, ctx: { purchaseTracking: boolean }, reason = "You changed this."): EditResult {
  const next: StrategyContent = { ...prev };
  switch (edit.section) {
    case "budget":
      if (!Number.isFinite(edit.dailyBudget) || edit.dailyBudget < MIN_DAILY) return { ok: false, error: `The daily budget has to be at least ${usd(MIN_DAILY)}.` };
      if (edit.dailyBudget > MAX_DAILY) return { ok: false, error: `Mairo plans up to ${usd(MAX_DAILY)}/day.` };
      next.dailyBudget = clampBudget(edit.dailyBudget);
      break;
    case "platforms": {
      const chosen = PLATFORMS.filter((p) => edit.platforms.includes(p));
      if (chosen.length === 0) return { ok: false, error: "Pick at least one: Facebook or Instagram." };
      next.platforms = chosen;
      next.platformsWhy = chosen.length === 2 ? "Facebook and Instagram together, so Meta can show each ad where it costs least." : `Only ${PLATFORM_LABEL[chosen[0]]}, as you chose.`;
      break;
    }
    case "goal":
      next.goal = edit.goal;
      next.goalWhy = "Set by you.";
      break;
    case "campaignType":
      next.campaignType = edit.campaignType;
      next.campaignTypeWhy = "Set by you.";
      break;
    case "product": {
      const product = edit.product.trim().slice(0, 200);
      if (!product) return { ok: false, error: "Say what you want to advertise." };
      next.product = product;
      next.productWhy = "Set by you.";
      break;
    }
    case "offer":
      next.offer = edit.offer.trim().slice(0, 200);
      next.offerWhy = next.offer ? "Set by you." : "No offer — the ads lead with the product itself.";
      break;
    case "audience": {
      let ageMin = Math.round(edit.ageMin);
      let ageMax = Math.round(edit.ageMax);
      if (!Number.isFinite(ageMin) || !Number.isFinite(ageMax)) return { ok: false, error: "Ages have to be numbers." };
      ageMin = Math.min(AGE_MAX, Math.max(AGE_MIN, ageMin));
      ageMax = Math.min(AGE_MAX, Math.max(AGE_MIN, ageMax));
      if (ageMin > ageMax) return { ok: false, error: "The youngest age has to be below the oldest." };
      const interests = edit.interests.map((i) => i.trim().slice(0, 60)).filter(Boolean).slice(0, 10);
      next.audience = { ...prev.audience, location: edit.location.trim().slice(0, 120), ageMin, ageMax, interests };
      break;
    }
  }

  const section: SectionKey = edit.section;
  const touched = changedSections(prev, next);
  if (touched.length === 0) return { ok: true, plan: prev, changes: [], suggestion: null };

  const primary = touched.map((k) => change(prev, next, k, reason, false));
  const { plan, dependent } = reconcile(prev, next, touched);
  return { ok: true, plan, changes: [...primary, ...dependent], suggestion: suggestionFor(plan, section, ctx) };
}

/** Applies a suggestion's patch as though the business had edited it. */
export function applySuggestion(prev: StrategyContent, patch: SuggestionPatch): { plan: StrategyContent; changes: PlanChange[] } {
  const next: StrategyContent = {
    ...prev,
    ...(patch.dailyBudget !== undefined ? { dailyBudget: clampBudget(patch.dailyBudget), budgetWhy: budgetWhyFor(patch.dailyBudget, prev.platforms) } : {}),
    ...(patch.platforms ? { platforms: PLATFORMS.filter((p) => patch.platforms!.includes(p)), platformsWhy: "Facebook and Instagram together, so Meta can show each ad where it costs least." } : {}),
    ...(patch.goal ? { goal: patch.goal, goalWhy: "Mairo's recommendation, accepted by you." } : {}),
    ...(patch.campaignType ? { campaignType: patch.campaignType, campaignTypeWhy: "Mairo's recommendation, accepted by you." } : {}),
    audience: patch.audience ? { ...prev.audience, ...patch.audience } : prev.audience,
  };
  if (next.platforms.length === 0) next.platforms = prev.platforms;
  const touched = changedSections(prev, next);
  const primary = touched.map((k) => change(prev, next, k, "You accepted Mairo's suggestion.", false));
  const { plan, dependent } = reconcile(prev, next, touched);
  return { plan, changes: [...primary, ...dependent] };
}

// --- The plain-language revision parser (used when the AI isn't available) --

const GOAL_WORDS: [RegExp, PlanGoal][] = [
  [/\b(sales|purchases|sell more|orders)\b/i, "SALES"],
  [/\b(leads?|enquir|inquir|bookings?|appointments?|calls?)\b/i, "LEADS"],
  [/\b(traffic|visits|visitors|clicks)\b/i, "TRAFFIC"],
  [/\b(awareness|brand|reach)\b/i, "AWARENESS"],
  [/\b(messages|dms?|whatsapp|conversations)\b/i, "ENGAGEMENT"],
];

export type RevisionPatch = {
  dailyBudget?: number;
  platforms?: PlanPlatform[];
  goal?: PlanGoal;
  location?: string;
  ageMin?: number;
  ageMax?: number;
  product?: string;
  offer?: string;
};

/**
 * Reads the common, unambiguous requests without the AI: a budget, the
 * platforms, an age range, a place, a goal, a product or an offer. Anything
 * else returns null and the business is told plainly it couldn't be done.
 */
export function parseRequest(text: string): RevisionPatch | null {
  const t = text.trim();
  const patch: RevisionPatch = {};

  const money = t.match(/\$\s?(\d{1,5}(?:\.\d{1,2})?)\s*(?:\/|a|per)?\s*(day|daily|month|monthly|mo|week|weekly)?/i)
    ?? t.match(/budget\s+(?:to|of|at)?\s*(\d{1,5}(?:\.\d{1,2})?)\s*(?:\/|a|per)?\s*(day|daily|month|monthly|mo|week|weekly)?/i);
  if (money) {
    const n = Number(money[1]);
    const unit = (money[2] ?? "day").toLowerCase();
    const daily = unit.startsWith("mo") ? n / 30 : unit.startsWith("week") ? n / 7 : n;
    if (Number.isFinite(daily) && daily > 0) patch.dailyBudget = Math.round(daily * 100) / 100;
  }

  const onlyIg = /\b(only|just)\b[^.,;]{0,20}\binstagram\b(?!\s+and)|\binstagram\s+only\b/i.test(t);
  const onlyFb = /\b(only|just)\b[^.,;]{0,20}\bfacebook\b(?!\s+and)|\bfacebook\s+only\b/i.test(t);
  if (onlyIg && !onlyFb) patch.platforms = ["INSTAGRAM"];
  else if (onlyFb && !onlyIg) patch.platforms = ["FACEBOOK"];
  else if (/\bboth\b|facebook\s+and\s+instagram|instagram\s+and\s+facebook/i.test(t)) patch.platforms = ["FACEBOOK", "INSTAGRAM"];

  const ages = t.match(/\b(1[89]|[2-5]\d|6[0-5])\s*(?:-|–|to)\s*(1[89]|[2-5]\d|6[0-5])\+?/);
  if (ages) {
    patch.ageMin = Number(ages[1]);
    patch.ageMax = Number(ages[2]);
  }

  const place = t.match(/\b(?:people|customers|everyone|audience|ads?)\s+(?:in|near|around)\s+([A-Z][\w'.-]*(?:[ ,]+[A-Z][\w'.-]*)*)/)
    ?? t.match(/\b(?:location|area|city)\s+(?:to|is|=)\s+([A-Z][\w'.-]*(?:[ ,]+[A-Z][\w'.-]*)*)/i)
    ?? t.match(/\btarget(?:ing)?\s+(?:people\s+)?(?:in|near|around)\s+([A-Z][\w'.-]*(?:[ ,]+[A-Z][\w'.-]*)*)/i);
  if (place) patch.location = place[1].replace(/[ ,]+$/, "").slice(0, 120);

  // Only when they talk about the goal itself — "sales" in "my sales page"
  // isn't a request to change it.
  const scope = t.match(/\b(?:goal|focus|aim|optimi[sz]e)\b([^.;]*)/i)?.[1] ?? "";
  if (scope) {
    for (const [re, goal] of GOAL_WORDS) {
      if (re.test(scope)) {
        patch.goal = goal;
        break;
      }
    }
  }

  const product = t.match(/\b(?:promote|advertise|focus on|feature)\s+(?:our\s+|my\s+|the\s+)?([^.,;]{3,80})/i);
  if (product && !patch.goal && !/\b(instagram|facebook|leads?|sales|traffic)\b/i.test(product[1])) patch.product = product[1].trim();

  const offer = t.match(/\b(\d{1,2}\s?% off[^.,;]{0,60}|free [^.,;]{3,60}|buy one[^.,;]{0,60})/i)
    ?? t.match(/\boffer\s+(?:is|to|of|:)?\s*([^.;]{3,100})/i);
  if (offer) patch.offer = offer[1].trim();

  return Object.keys(patch).length ? patch : null;
}

/** Turns a parsed or AI patch into manual edits, in a stable order. */
export function patchToEdits(p: StrategyContent, patch: RevisionPatch): ManualEdit[] {
  const edits: ManualEdit[] = [];
  if (patch.goal && patch.goal !== p.goal) edits.push({ section: "goal", goal: patch.goal });
  if (patch.platforms) edits.push({ section: "platforms", platforms: patch.platforms });
  if (patch.dailyBudget !== undefined) edits.push({ section: "budget", dailyBudget: patch.dailyBudget });
  if (patch.location !== undefined || patch.ageMin !== undefined || patch.ageMax !== undefined) {
    edits.push({
      section: "audience",
      location: patch.location ?? p.audience.location,
      ageMin: patch.ageMin ?? p.audience.ageMin,
      ageMax: patch.ageMax ?? p.audience.ageMax,
      interests: p.audience.interests,
    });
  }
  if (patch.product) edits.push({ section: "product", product: patch.product });
  if (patch.offer !== undefined) edits.push({ section: "offer", offer: patch.offer });
  return edits;
}

/** Runs several edits one after another and merges what changed. */
export function applyEdits(prev: StrategyContent, edits: ManualEdit[], ctx: { purchaseTracking: boolean }, reason: string): EditResult {
  let plan = prev;
  const all: PlanChange[] = [];
  let suggestion: Suggestion | null = null;
  for (const e of edits) {
    const r = applyEdit(plan, e, ctx, reason);
    if (!r.ok) return r;
    plan = r.plan;
    all.push(...r.changes);
    suggestion = r.suggestion ?? suggestion;
  }
  return { ok: true, plan, changes: mergeChanges(prev, plan, all), suggestion };
}

/** One entry per section: the first reason given, previous from the start, updated from the end. */
export function mergeChanges(first: StrategyContent, last: StrategyContent, changes: PlanChange[]): PlanChange[] {
  const out = new Map<SectionKey, PlanChange>();
  for (const c of changes) if (!out.has(c.section)) out.set(c.section, c);
  const still = new Set(changedSections(first, last));
  return [...out.values()]
    .filter((c) => still.has(c.section))
    .map((c) => ({ ...c, previous: describeSection(first, c.section), updated: describeSection(last, c.section) }));
}

/** "Budget changed from $50/day to $35/day." — for the version history. */
export function revisionSummary(changes: PlanChange[]): string {
  const primary = changes.filter((c) => !c.dependent);
  const list = (primary.length ? primary : changes).slice(0, 3);
  if (list.length === 0) return "No changes.";
  return list.map((c) => `${SECTION_LABEL[c.section]}: ${clip(c.previous, 50)} → ${clip(c.updated, 50)}`).join("; ");
}
