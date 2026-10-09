import type { AgentRole } from "@/generated/prisma/enums";
import type { DataStatus, DecisionChange, DecisionDraft, DecisionInput, Guardrails } from "@/lib/decisions/types";
import { pastLearning } from "@/lib/decisions/rules";
import { limitProblem } from "@/lib/decisions/guardrails";
import { aggregate } from "@/lib/budget/optimizer";
import { AGENT, agentForDecision } from "./agents";
import type { RunResult } from "./runs";

// What each step of the daily team review says it did. Pure: given what the
// step actually computed, the sentence the customer reads. Nothing here
// claims more than the figures show — "too early" and "nothing to change"
// are said as plainly as a finding. Pinned by scripts/check-team.ts.

const dollars = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: c >= 100_000 ? 0 : 2 });
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** Analytics Agent: reading the results the rest of the team works from. */
export function readResults(input: DecisionInput, dataStatus: DataStatus): RunResult {
  const count = input.campaigns.length;
  if (count === 0) return { status: "NOTHING", summary: "No live campaigns to read yet." };
  const settled = input.campaigns.filter((c) => pastLearning(c, input.now));
  const week = aggregate(input.campaigns.map((c) => c.week).filter((m): m is NonNullable<typeof m> => m !== null));
  const spent = week.spendCents;
  const figures = spent !== null && spent > 0 ? ` In the last 7 days: ${dollars(spent)} spent${week.purchases ? `, ${n(week.purchases, "sale")}` : week.leads ? `, ${n(week.leads, "lead")}` : ""}.` : "";
  const lag = " Meta's figures can lag by a few hours.";
  if (dataStatus === "learning" || settled.length === 0) {
    return { status: "DONE", summary: `Read results for ${n(count, "campaign")}. Still in Meta's learning period, so it's too early to judge.`, detail: `${figures.trim()}${lag}`.trim(), href: "/dashboard/analytics" };
  }
  return { status: "DONE", summary: `Read the latest results for ${n(count, "campaign")}.${figures}`, detail: lag.trim(), href: "/dashboard/analytics" };
}

/** Which specialty proposed each draft, grouped. */
export function proposalsByAgent(drafts: DecisionDraft[]): Map<AgentRole, DecisionDraft[]> {
  const out = new Map<AgentRole, DecisionDraft[]>();
  for (const d of drafts) {
    const role = agentForDecision(d.kind, d.category);
    out.set(role, [...(out.get(role) ?? []), d]);
  }
  return out;
}

/** One specialty's proposals, as its run summary. */
export function proposalSummary(role: AgentRole, drafts: DecisionDraft[]): RunResult {
  const first = drafts[0];
  const summary = drafts.length === 1 ? `Recommended: ${first.title}` : `Recommended ${drafts.length} changes, starting with: ${first.title}`;
  return {
    status: "DONE",
    summary,
    detail: drafts.map((d) => `${d.title} — ${d.noticed}`).join("\n"),
    href: "/dashboard/decisions",
  };
}

/** The Optimization Agent when it found nothing to change — said, not hidden. */
export function nothingToChange(dataStatus: DataStatus): RunResult {
  return dataStatus === "learning"
    ? { status: "NOTHING", summary: "Waited: campaigns are still learning, and changing them now would reset that." }
    : { status: "NOTHING", summary: "Looked for problems to fix — rising costs, tired ads, money better spent elsewhere — and found none right now." };
}

const isBudget = (c: DecisionChange) => c.type === "set-budget";

/**
 * Budget Guardian: every proposed change that touches money, checked against
 * the customer's limits — the same check that runs again on approval.
 */
export function guardianCheck(drafts: DecisionDraft[], g: Guardrails, runningDailyCents: number): RunResult {
  const touching = drafts.filter((d) => d.changes.some(isBudget));
  const capLine = g.maxDailyBudgetCents !== null ? ` Your daily limit is ${dollars(g.maxDailyBudgetCents)}; campaigns running now total ${dollars(runningDailyCents)} a day.` : "";
  if (touching.length === 0) {
    return { status: "NOTHING", summary: `No recommendation changes what you spend.${capLine}`.trim() };
  }
  const held = touching.filter((d) => limitProblem(d.changes, g, runningDailyCents));
  if (held.length === 0) {
    return {
      status: "DONE",
      summary: `Checked ${n(touching.length, "budget change")} against your limits — ${touching.length === 1 ? "it stays" : "all stay"} within them.${capLine}`,
      href: "/dashboard/decisions",
    };
  }
  return {
    status: "DONE",
    summary: `Checked ${n(touching.length, "budget change")}: ${n(held.length, "goes", "go")} over your limits, so ${held.length === 1 ? "it" : "they"} won't be made unless you change the limit.`,
    detail: held.map((d) => `${d.title}: ${limitProblem(d.changes, g, runningDailyCents)}`).join("\n"),
    href: "/dashboard/settings#spend-protection",
  };
}

/** The coordinating run's own line: what the team produced this time. */
export function reviewSummary(input: { campaigns: number; proposals: number; autoApplied: number; dataStatus: DataStatus }): RunResult {
  if (input.campaigns === 0) return { status: "NOTHING", summary: "No live campaigns to review yet." };
  const parts = [`Coordinated the daily review of ${n(input.campaigns, "campaign")}`];
  if (input.proposals) parts.push(`${n(input.proposals, "recommendation")} for you`);
  if (input.autoApplied) parts.push(`${n(input.autoApplied, "change")} made within your automation level`);
  if (!input.proposals && !input.autoApplied) parts.push(input.dataStatus === "learning" ? "too early to change anything" : "nothing needed changing");
  const [head, ...rest] = parts;
  return { status: input.proposals || input.autoApplied ? "DONE" : "NOTHING", summary: `${head} — ${rest.join(", and ")}.`, href: "/dashboard/team" };
}

/** The specialty's name for a run line, e.g. "Budget Guardian". */
export const agentName = (role: AgentRole) => AGENT[role].name;
