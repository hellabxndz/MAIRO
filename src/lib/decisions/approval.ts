import type { AgentRole, AutomationLevel } from "@/generated/prisma/enums";
import { ALWAYS_NEEDS_APPROVAL, levelInfo } from "@/lib/automation/levels";
import { agentForDecision } from "@/lib/team/agents";
import { usd } from "@/lib/protection/rules";
import { actionFor, mayAutoApply, type ApprovalSwitches } from "./guardrails";
import type { DecisionChange } from "./types";

// What the Approval Center says about each proposed change, beyond the change
// itself: who on the AI team is responsible, what it does to spending, and
// what has to authorize it. Worked out from the change and the business's own
// settings — the same rules the daily review and approval use. Pure; pinned
// by scripts/check-command-center.ts.

export type BudgetImpact = { direction: "up" | "down" | "same" | "none"; text: string };
export type Authorization = { explicit: boolean; text: string };
export type ApprovalFacts = { owner: AgentRole; budget: BudgetImpact; authorization: Authorization };

export function budgetImpact(changes: DecisionChange[]): BudgetImpact {
  const budgets = changes.filter((c): c is Extract<DecisionChange, { type: "set-budget" }> => c.type === "set-budget");
  if (budgets.length) {
    const delta = budgets.reduce((n, c) => n + (c.toCents - c.fromCents), 0);
    if (delta > 0) return { direction: "up", text: `Adds ${usd(delta)} a day to what you spend.` };
    if (delta < 0 && budgets.every((c) => c.toCents <= c.fromCents)) return { direction: "down", text: `Spends ${usd(-delta)} a day less.` };
    const moved = budgets.filter((c) => c.toCents > c.fromCents).reduce((n, c) => n + (c.toCents - c.fromCents), 0);
    const from = budgets.find((c) => c.toCents < c.fromCents)?.campaignName;
    const to = budgets.find((c) => c.toCents > c.fromCents)?.campaignName;
    return delta === 0
      ? { direction: "same", text: `Moves ${usd(moved)} a day${from && to ? ` from ${from} to ${to}` : ""}. Your total daily budget stays the same.` }
      : { direction: "down", text: `Moves money between campaigns and spends ${usd(-delta)} a day less in total.` };
  }
  if (changes.some((c) => c.type === "new-ad-variation")) return { direction: "none", text: "No change to what you spend — the new version shares the campaign's budget." };
  if (changes.some((c) => c.type === "pause-ad")) return { direction: "none", text: "No change to the budget — the campaign's money goes to its other ads." };
  if (changes.some((c) => c.type === "widen-audience")) return { direction: "none", text: "No change to what you spend." };
  if (changes.some((c) => c.type === "try-meta-feature")) return { direction: "none", text: "No change to what you spend now." };
  return { direction: "none", text: "Nothing changes on Meta." };
}

export function authorizationFor(changes: DecisionChange[], level: AutomationLevel, switches: ApprovalSwitches): Authorization {
  if (changes.length === 0 || changes.every((c) => c.type === "guide")) return { explicit: false, text: "Nothing to authorize — it's a step for you to take." };
  if (changes.some((c) => c.type === "try-meta-feature")) return { explicit: true, text: "Your approval. MAIRO only tries a new Meta option when you say yes." };
  const action = actionFor(changes);
  const guardian = changes.some((c) => c.type === "set-budget") ? " Budget Guardian checks it against your limits again before anything runs." : "";
  if (action && ALWAYS_NEEDS_APPROVAL.includes(action)) {
    return { explicit: true, text: `Your explicit approval. Raising what you spend always needs you — MAIRO never does it on its own.${guardian}` };
  }
  const name = levelInfo(level).label;
  if (mayAutoApply(level, changes, switches)) {
    return { explicit: false, text: `Your approval here — or, at your automation level (${name}), MAIRO may make this kind of change itself within your limits.${guardian}` };
  }
  return { explicit: true, text: `Your approval. At your automation level (${name}) MAIRO doesn't make this kind of change on its own.${guardian}` };
}

export function approvalFacts(d: { kind: string; category: string; changes: DecisionChange[] }, ctx: { level: AutomationLevel; switches: ApprovalSwitches }): ApprovalFacts {
  return { owner: agentForDecision(d.kind, d.category), budget: budgetImpact(d.changes), authorization: authorizationFor(d.changes, ctx.level, ctx.switches) };
}
