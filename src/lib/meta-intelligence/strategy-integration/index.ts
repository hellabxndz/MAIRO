import { db } from "@/lib/db";
import type { DecisionDraft } from "@/lib/decisions/types";
import { missionGoal, type MetricFamily, type MissionGoal } from "@/lib/mission/goals";
import { eligibility } from "../discovery";
import { flagKeyFor, stageAllows } from "../feature-flags";
import { BASELINE_FEATURES } from "../feature-registry/baseline";
import type { FlagStage } from "@/lib/platform-intelligence/types";

// What the Strategy Engine may consider from Meta, for one business.
//
// The business goal comes first: a Meta capability is considered only when
// it can serve the active goal, MAIRO has validated it (registry support),
// its flag is on for this business, the business's own ad account can use it,
// and — for anything new — the owner said yes. And the business's own results
// get the last word: if campaigns without a tool did better for them, MAIRO
// doesn't keep reaching for it. Newest is never assumed to be best.

export type MetaFeatureRow = {
  featureKey: string;
  name: string;
  description: string;
  mairoSupport: string;
  deprecated: boolean;
  goalFit: string[];
  aiCapability: boolean;
  availability: string;
  permissions: string[];
  regionRestrictions: string[];
};

export type MetaOption = { featureKey: string; name: string; why: string; isNew: boolean };
export type MetaConsidered = { option: MetaOption; ok: boolean; reason: string };

const BASELINE_KEYS = new Set(BASELINE_FEATURES.map((f) => f.featureKey));

/** Plain words for why a validated tool may help, per goal. */
function whyFor(f: MetaFeatureRow, family: MetricFamily): string {
  const goal = { sales: "sales", leads: "leads", bookings: "bookings", calls: "calls", traffic: "website visits", awareness: "reach", social: "engagement", visits: "local visits" }[family];
  return `${f.description.replace(/\.$/, "")} — it can serve your goal (${goal}).`;
}

/**
 * Pure: which validated Meta tools fit this business now, and why each other
 * one doesn't. `learned` is what this business's own results said about a
 * tool ("with" or "without" did better).
 */
export function chooseMetaOptions(input: {
  features: MetaFeatureRow[];
  family: MetricFamily;
  flags: Map<string, { stage: FlagStage; internalOrgIds: string[]; selectedOrgIds: string[] }>;
  organizationId: string;
  account: { country: string | null; permissions: string[]; capabilities: string[]; accountStatus: number | null } | null;
  optIns: Map<string, "APPROVED" | "DECLINED">;
  learned: Map<string, "with" | "without">;
  specialAdCategory?: boolean;
}): MetaConsidered[] {
  const out: MetaConsidered[] = [];
  for (const f of input.features) {
    if (!f.aiCapability) continue; // Only Meta's optional automation tools are choices; the rest is plumbing.
    const isNew = !BASELINE_KEYS.has(f.featureKey);
    const option: MetaOption = { featureKey: f.featureKey, name: f.name, why: whyFor(f, input.family), isNew };
    const no = (reason: string) => out.push({ option, ok: false, reason });
    if (f.deprecated || f.mairoSupport === "DEPRECATED") { no("Meta is retiring it."); continue; }
    if (!["SUPPORTED", "PARTIALLY_SUPPORTED"].includes(f.mairoSupport)) { no("MAIRO hasn't validated it yet."); continue; }
    if (!f.goalFit.includes(input.family)) { no("It doesn't serve this goal."); continue; }
    if (input.specialAdCategory && f.featureKey === "advantage_plus.audience") { no("Not allowed for special ad categories."); continue; }
    const flag = input.flags.get(flagKeyFor(f.featureKey));
    if (flag && !stageAllows(flag.stage, input.organizationId, flag)) { no("Its rollout hasn't reached this account."); continue; }
    if (isNew && !flag) { no("New capabilities need a rollout flag."); continue; }
    // GA features without extra requirements are available to every account.
    const simple = f.availability === "GA" && !f.regionRestrictions.length && f.permissions.every((p) => ["ads_management", "ads_read"].includes(p));
    if (!simple) {
      const e = eligibility({ availability: f.availability, permissions: f.permissions, regionRestrictions: f.regionRestrictions, deprecated: f.deprecated }, input.account);
      if (!e.eligible) { no(e.reasons[0] ?? "This account can't use it."); continue; }
    }
    if (isNew && input.optIns.get(f.featureKey) !== "APPROVED") { no("Waiting for the owner's approval."); continue; }
    if (input.learned.get(f.featureKey) === "without") { no("Campaigns without it did better for this business."); continue; }
    out.push({ option: input.learned.get(f.featureKey) === "with" ? { ...option, why: `${option.why} It has worked for you before.` } : option, ok: true, reason: "Fits the goal, validated and available." });
  }
  return out;
}

async function context(organizationId: string) {
  const [features, flags, account, optIns, lessons] = await Promise.all([
    db.platformFeature.findMany({ where: { platform: "META" } }),
    db.platformFeatureFlag.findMany({ where: { platform: "META" } }),
    db.platformAccountCapability.findUnique({ where: { platform_organizationId: { platform: "META", organizationId } } }),
    db.platformFeatureOptIn.findMany({ where: { platform: "META", organizationId } }),
    db.mairoLearning.findMany({ where: { organizationId, active: true, key: { startsWith: "engine:meta-feature:" }, confidence: { in: ["HIGH", "MEDIUM"] } } }),
  ]);
  const learned = new Map<string, "with" | "without">();
  for (const l of lessons) {
    // key: engine:meta-feature:<with|without>-<featureKey slug>
    const m = /^engine:meta-feature:(with|without)-(.+)$/.exec(l.key);
    const feature = m ? features.find((f) => f.featureKey.replace(/[^a-z0-9]+/g, "-") === m[2]) : null;
    if (m && feature) learned.set(feature.featureKey, m[1] as "with" | "without");
  }
  return {
    features,
    flags: new Map(flags.map((f) => [f.key, { stage: f.stage as FlagStage, internalOrgIds: f.internalOrgIds, selectedOrgIds: f.selectedOrgIds }])),
    account: account && !account.error ? { country: account.country, permissions: account.permissions, capabilities: account.capabilities, accountStatus: account.accountStatus } : null,
    optIns: new Map(optIns.map((o) => [o.featureKey, o.status as "APPROVED" | "DECLINED"])),
    learned,
  };
}

/** The Meta tools the Strategy Engine may use for this business's goal. */
export async function metaOptionsFor(organizationId: string, family: MetricFamily, opts: { specialAdCategory?: boolean } = {}): Promise<MetaConsidered[]> {
  const ctx = await context(organizationId).catch(() => null);
  if (!ctx) return [];
  return chooseMetaOptions({ ...ctx, family, organizationId, specialAdCategory: opts.specialAdCategory });
}

/**
 * "Meta introduced a new optimization option that may better match your
 * current goal." Only for NEW capabilities that MAIRO validated, whose
 * rollout reached this business, that its account can use and that serve
 * its active goal — and only once (Not now is remembered).
 */
export async function metaRecommendationDrafts(organizationId: string, goal: MissionGoal): Promise<DecisionDraft[]> {
  const family = missionGoal(goal).metrics;
  const ctx = await context(organizationId).catch(() => null);
  if (!ctx) return [];
  // Candidates as if the owner had already said yes: everything else must hold.
  const asked = chooseMetaOptions({ ...ctx, family, organizationId, optIns: new Map([...ctx.optIns, ...ctx.features.filter((f) => !BASELINE_KEYS.has(f.featureKey) && !ctx.optIns.has(f.featureKey)).map((f) => [f.featureKey, "APPROVED"] as const)]) });
  return asked
    .filter((c) => c.ok && c.option.isNew && !ctx.optIns.has(c.option.featureKey))
    .slice(0, 1)
    .map((c) => ({
      kind: "meta-capability",
      category: "GROWTH" as const,
      urgent: false,
      mairoCampaignId: null,
      platform: "META" as const,
      title: `Meta introduced a new option that may fit your goal: ${missionGoal(goal).label.toLowerCase()}`,
      noticed: `Meta introduced ${c.option.name}. MAIRO has tested it and your ad account can use it.`,
      noticedAdvanced: `${c.option.featureKey}: validated in MAIRO's Feature Registry; rollout includes this account.`,
      whyItMatters: `It may better match your current goal — ${missionGoal(goal).label.toLowerCase()}. MAIRO only suggests new Meta tools that serve your goal, not just because they're new.`,
      recommendation: "MAIRO recommends testing it in your next campaign. Your running campaigns stay exactly as they are.",
      impact: "Expected purpose: find out whether it helps your results, compared with how your campaigns run today. Not a guarantee — MAIRO keeps it only if it works for you.",
      risk: "LOW" as const,
      confidence: "MEDIUM" as const,
      evidence: [{ label: "Meta capability", value: c.option.name }],
      changes: [{ type: "try-meta-feature" as const, featureKey: c.option.featureKey, featureName: c.option.name, learnMoreHref: `/dashboard/meta-capabilities/${encodeURIComponent(c.option.featureKey)}` }],
      dedupeKey: `meta-capability:${c.option.featureKey}`,
      priority: 25,
    }));
}
