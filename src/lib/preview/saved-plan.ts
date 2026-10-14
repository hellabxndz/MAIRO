import { z } from "zod";
import type { PreviewGoal } from "@/lib/preview/build";
import { setupGoalFor } from "@/lib/preview/strategy";
import type { OnboardingDraft } from "@/lib/onboarding/draft";

// A free AI ad plan as it's saved or shared: what the visitor gave and what
// MAIRO wrote. The budget split, the strategy and the first 30 days are
// rebuilt from these on the shared page — they're deterministic — so only the
// written parts are kept as they were shown.
//
// Pure: the API, the shared page, sign-up and scripts/check-saved-plan.ts
// share it.

const text = (max: number) => z.string().trim().max(max);
const fact = text(400).default("");

export const savedPlanSchema = z.object({
  inputs: z.object({
    website: text(300).nullable(),
    sells: text(400).min(3),
    goal: z.enum(["sales", "leads", "bookings", "traffic", "awareness"]),
    monthly: z.number().int().min(100).max(1_000_000),
  }),
  facts: z.object({
    name: fact,
    offering: fact,
    customer: fact,
    location: fact,
    offer: fact,
    proof: fact,
    problem: fact,
    businessType: text(40).default(""),
    pixelSeen: z.boolean().nullable().default(null),
    usesLeadForm: z.boolean().default(false),
    /** Which facts came from the website, so a shared plan still says so. */
    fromWebsite: z.array(z.string().max(20)).max(7).default([]),
    /** Where the website sends people, as read from it; null when it wasn't read. */
    destinations: z.object({ booking: text(60).nullable(), form: z.boolean(), phone: z.boolean(), checkout: z.boolean() }).nullable().default(null),
  }),
  /** What MAIRO's reading of the website saw — the only technical claims the plan makes. Null when no website was read. */
  site: z.object({ url: text(300), pagesRead: z.number().int().min(0).max(50), platform: text(40).nullable().default(null) }).nullable().default(null),
  findings: z.array(z.object({ title: text(200), why: text(600), change: text(600), evidence: text(300).nullable().default(null) })).max(6).default([]),
  written: z
    .object({
      appeal: z.array(text(200)).max(3),
      customers: text(120).nullable(),
      messaging: z.array(text(200)).max(4),
      concepts: z.array(z.object({ label: text(60), headline: text(80), primaryText: text(400), format: text(30), visual: text(300), cta: text(30), targetCustomer: text(120), why: text(300) })).min(1).max(3),
      first: z.number().int().min(0).max(2),
      firstWhy: text(300),
    })
    .nullable(),
  source: z.union([z.object({ by: z.literal("ai") }), z.object({ by: z.literal("fixture"), note: text(200) }), z.object({ by: z.literal("templates"), why: text(20) })]),
  dropped: z.array(text(200)).max(20).default([]),
  filled: z.number().int().min(0).max(3).default(0),
});

export type SavedPlan = z.infer<typeof savedPlanSchema>;

/** Saved plans that nobody claimed are deleted after this many days. */
export const UNCLAIMED_DAYS = 30;

/**
 * Setup's draft, opened with what the plan already knows — the website, what
 * they sell, the goal and the budget — for the owner to confirm, never
 * marked as saved. Answers already in the draft win.
 */
export function draftFromPlan(p: SavedPlan, existing: OnboardingDraft): OnboardingDraft {
  const b = existing.business ?? {};
  const g = existing.goal ?? {};
  const notes = [p.facts.customer && `Who it's for: ${p.facts.customer}`, p.facts.proof && `Something true that builds trust: ${p.facts.proof}`, p.written?.concepts[p.written.first] && `Ad to test first (from the free plan): ${p.written.concepts[p.written.first].headline}`].filter(Boolean).join("\n");
  return {
    ...existing,
    business: {
      ...b,
      website: b.website ?? p.inputs.website ?? undefined,
      offering: b.offering ?? (p.facts.offering || p.inputs.sells).slice(0, 200),
      customerLocation: b.customerLocation ?? (p.facts.location || undefined),
      businessType: b.businessType ?? (p.facts.businessType || undefined),
    },
    goal: {
      ...g,
      primaryGoal: g.primaryGoal ?? setupGoalFor(p.inputs.goal as PreviewGoal),
      monthlyBudget: g.monthlyBudget ?? p.inputs.monthly,
      currentOffer: g.currentOffer ?? (p.facts.offer || undefined),
      // Only who the visitor said it's for — MAIRO's suggestion stays a suggestion, in the plan.
      targetAudience: g.targetAudience ?? (p.facts.customer || undefined),
      notes: g.notes ?? (notes || undefined),
    },
  };
}
