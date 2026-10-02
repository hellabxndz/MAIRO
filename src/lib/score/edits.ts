import { contextOf, type CampaignContext, type CampaignPlan } from "@/lib/campaigns/plan";
import type { CopyOption } from "@/lib/campaigns/ad-copy";
import type { FixKind } from "@/lib/score/rules";

// The edits "Fix with AI" proposes, and applying them. Pure and free of the
// AI SDK so the Create wizard can apply an approved fix in the browser.

/** One change to the plan, applied in the browser after the customer approves it. */
export type PlanEdit =
  | { op: "copy-field"; index: number; field: "headline" | "primaryText" | "cta"; value: string }
  | { op: "add-copy"; option: CopyOption }
  | { op: "set"; patch: Partial<Pick<CampaignPlan, "audienceMode" | "geoRadius" | "ageMin" | "ageMax" | "choosingPlacements" | "placements" | "dailyAmount">> }
  /** Campaign-only information from the owner (never the Business Profile). */
  | { op: "context"; patch: Partial<Omit<CampaignContext, "answers">>; answers?: Record<string, string> };

export type FixResult =
  | { ok: true; kind: FixKind; label: string; before: string | null; after: string | null; explanation: string; edits: PlanEdit[]; suggestions?: string[] }
  | { ok: false; kind: FixKind; error: string; suggestions?: string[] };

/** "Improve With MAIRO": three alternatives, one recommended, the customer picks. */
export type ImproveOption = { text: string; why: string; edits: PlanEdit[]; recommended: boolean };
export type OptionsResult =
  | { ok: true; kind: FixKind; label: string; before: string | null; options: ImproveOption[] }
  | { ok: false; kind: FixKind; error: string; suggestions?: string[] };

/** Applies approved edits to a plan. Pure, and used in the browser too. */
export function applyEdits(plan: CampaignPlan, edits: PlanEdit[]): CampaignPlan {
  let next: CampaignPlan = { ...plan, copyOptions: plan.copyOptions.map((o) => ({ ...o })) };
  for (const e of edits) {
    if (e.op === "copy-field" && next.copyOptions[e.index]) {
      next.copyOptions[e.index] = { ...next.copyOptions[e.index], [e.field]: e.value };
    } else if (e.op === "add-copy") {
      next = { ...next, copyOptions: [...next.copyOptions, e.option] };
    } else if (e.op === "set") {
      next = { ...next, ...e.patch };
    } else if (e.op === "context") {
      const c = contextOf(next);
      next = { ...next, context: { ...c, ...e.patch, answers: { ...c.answers, ...(e.answers ?? {}) } } };
    }
  }
  return next;
}
