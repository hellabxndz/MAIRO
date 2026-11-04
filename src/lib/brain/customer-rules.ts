import type { DecisionChange } from "@/lib/decisions/types";

// The business's rules for MAIRO, as code can enforce them.
//
// A customer says "we only want customers within 20 miles of Miami" once —
// in the chat or on the business profile — and it is stored as a Business
// Brain fact (maxRadiusMiles, source and time kept like every fact). From
// then on it binds deterministically, not by asking the AI to remember:
//
//   - the daily review drops any recommendation that would widen an
//     audience past it (lib/decisions/run.ts);
//   - every change MAIRO applies, approved or automatic, is checked against
//     it with the spending limits (guardrails.limitProblem), so even an
//     approval can't carry a change that breaks it — the owner changes the
//     rule first.
//
// Standing instructions in the customer's words go to MAIRO's AI with every
// request (brainPrompt); they can't be enforced in code, so nothing that
// spends or launches relies on them alone.

export type CustomerRules = {
  /** The furthest from the business's area, in miles, that MAIRO may advertise. Null: no rule. */
  maxRadiusMiles: number | null;
  standingInstructions: string[];
};

export const NO_RULES: CustomerRules = { maxRadiusMiles: null, standingInstructions: [] };

/** "20", "20 miles", "within 20mi" → 20. Anything unclear isn't a rule (null), never a guess. */
export function parseRadius(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 && raw <= 500 ? raw : null;
  if (typeof raw !== "string") return null;
  const m = raw.trim().match(/^(?:within\s+)?(\d{1,3}(?:\.\d+)?)\s*(?:mi|miles?)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 500 ? n : null;
}

export function customerRulesFrom(profile: Record<string, unknown> | null | undefined): CustomerRules {
  if (!profile) return NO_RULES;
  const list = profile.standingInstructions;
  return {
    maxRadiusMiles: parseRadius(profile.maxRadiusMiles),
    standingInstructions: Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, 20) : [],
  };
}

/** Which rule a set of changes would break, in the owner's words, or null. */
export function ruleProblem(changes: DecisionChange[], rules: Pick<CustomerRules, "maxRadiusMiles">): string | null {
  if (rules.maxRadiusMiles === null) return null;
  for (const c of changes) {
    if (c.type !== "widen-audience") continue;
    if (c.to.geoRadius === null && c.from.geoRadius !== null) {
      return `${c.campaignName}: that would remove the distance limit, and your rule is to advertise no further than ${rules.maxRadiusMiles} miles from your area.`;
    }
    if (c.to.geoRadius !== null && c.to.geoRadius > rules.maxRadiusMiles) {
      return `${c.campaignName}: ${c.to.geoRadius} miles is further than your rule of ${rules.maxRadiusMiles} miles from your area. Change the rule in your business profile first if you want this.`;
    }
  }
  return null;
}
