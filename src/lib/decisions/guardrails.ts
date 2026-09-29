import type { AutomationLevel } from "@/generated/prisma/enums";
import { mayDoAutomatically, type AutomationAction } from "@/lib/automation/levels";
import { usd } from "@/lib/protection/rules";
import type { DecisionChange, Guardrails } from "./types";

// What a change counts as, and whether MAIRO may make it without asking.
//
// Pure. The two questions every decision is asked before anything happens:
//
//   Is it inside the customer's limits at all? A change that breaks a limit
//   is refused even with approval — the ceiling is a ceiling, and raising it
//   is a settings change the customer makes on purpose.
//
//   May it happen without a person? Only when the automation level allows
//   that kind of action AND no approval switch holds it back. Everything else
//   waits on the Decisions page.

/** The approval switches on the Guardrails card. */
export type ApprovalSwitches = {
  requireApprovalNewCreatives: boolean;
  requireApprovalAudience: boolean;
  requireApprovalPlatformShift: boolean;
};

/** The automation action a set of changes amounts to, for the level check. */
export function actionFor(changes: DecisionChange[]): AutomationAction | null {
  const budgets = changes.filter((c) => c.type === "set-budget");
  if (budgets.length > 0) {
    const delta = budgets.reduce((n, c) => n + (c.toCents - c.fromCents), 0);
    if (delta > 0) return "raise-total-budget";
    // Lowering one campaign and raising another by the same amount is moving
    // money, not adding it. Only lowering is the cheapest change there is.
    return budgets.some((c) => c.toCents > c.fromCents) ? "shift-budget" : "pause-underperformer";
  }
  if (changes.some((c) => c.type === "widen-audience")) return "adjust-audience";
  if (changes.some((c) => c.type === "new-ad-variation")) return "test-new-creative";
  if (changes.some((c) => c.type === "pause-ad")) return "pause-underperformer";
  return null;
}

/** Whether the changes move money between different ad networks. */
export function crossesNetworks(changes: DecisionChange[]): boolean {
  const platforms = new Set(
    changes.filter((c) => c.type === "set-budget").map((c) => (c.type === "set-budget" ? c.platform : null)),
  );
  return platforms.size > 1;
}

/**
 * The reason a change breaks the customer's limits, or null when it doesn't.
 *
 * `currentDailyTotalCents` is what every running campaign spends a day now.
 */
export function limitProblem(
  changes: DecisionChange[],
  g: Guardrails,
  currentDailyTotalCents: number,
): string | null {
  for (const c of changes) {
    if (c.type !== "set-budget") continue;
    if (c.toCents < 100) return `${c.campaignName} can't go below $1 a day.`;
    if (c.toCents > c.fromCents) {
      const risePct = ((c.toCents - c.fromCents) / c.fromCents) * 100;
      if (risePct > g.maxDailyIncreasePercent + 0.5) {
        return `Raising ${c.campaignName} from ${usd(c.fromCents)} to ${usd(c.toCents)} is more than the ${g.maxDailyIncreasePercent}% daily increase your guardrails allow.`;
      }
    } else if (c.toCents < c.fromCents) {
      const cutPct = ((c.fromCents - c.toCents) / c.fromCents) * 100;
      if (cutPct > g.maxDailyDecreasePercent + 0.5) {
        return `Cutting ${c.campaignName} from ${usd(c.fromCents)} to ${usd(c.toCents)} is more than the ${g.maxDailyDecreasePercent}% daily decrease your guardrails allow.`;
      }
    }
  }
  const delta = changes.reduce((n, c) => (c.type === "set-budget" ? n + (c.toCents - c.fromCents) : n), 0);
  if (delta > 0 && g.maxDailyBudgetCents !== null && currentDailyTotalCents + delta > g.maxDailyBudgetCents) {
    return `That would take your daily spend to ${usd(currentDailyTotalCents + delta)}, over the ${usd(g.maxDailyBudgetCents)} maximum you set. Raise the maximum in Settings first if you want this.`;
  }
  return null;
}

/**
 * Whether MAIRO may carry these changes out on its own.
 *
 * False means "put it on the Decisions page and wait", never "skip it".
 */
export function mayAutoApply(
  level: AutomationLevel,
  changes: DecisionChange[],
  switches: ApprovalSwitches,
): boolean {
  if (changes.length === 0 || changes.some((c) => c.type === "guide")) return false;
  const action = actionFor(changes);
  if (!action || !mayDoAutomatically(level, action)) return false;
  if (switches.requireApprovalNewCreatives && changes.some((c) => c.type === "new-ad-variation")) return false;
  if (switches.requireApprovalAudience && changes.some((c) => c.type === "widen-audience")) return false;
  if (switches.requireApprovalPlatformShift && crossesNetworks(changes)) return false;
  return true;
}

/** A change as the customer reads it: what, before, after. */
export function describeChange(c: DecisionChange): { label: string; before: string | null; after: string | null } {
  switch (c.type) {
    case "set-budget":
      return { label: `${c.campaignName} — daily budget`, before: `${usd(c.fromCents)}/day`, after: `${usd(c.toCents)}/day` };
    case "pause-ad":
      return { label: `${c.adLabel} in ${c.campaignName}`, before: "Running", after: "Paused" };
    case "new-ad-variation":
      return { label: `${c.campaignName} — new ad`, before: null, after: `A new version written from ${c.basedOnLabel}` };
    case "widen-audience": {
      const place = (a: { geoRadius: number | null; ageMin: number; ageMax: number }) =>
        `${a.geoRadius !== null ? `${a.geoRadius} miles, ` : ""}ages ${a.ageMin}–${a.ageMax}`;
      return { label: `${c.campaignName} — audience`, before: place(c.from), after: place(c.to) };
    }
    case "guide":
      return { label: c.label, before: null, after: null };
  }
}
