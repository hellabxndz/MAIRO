import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT } from "./agents";

// What each specialty is doing right now, worked out from what actually
// happened — its recorded runs, the decisions it's waiting on, and the
// account's connections. An agent is "Working" only while one of its runs is
// genuinely in progress, and "Monitoring" only if it checked recently and
// there is something live to check. Periodic checks are called periodic.
// Pure; pinned by scripts/check-team.ts.

export type AgentState = "WORKING" | "MONITORING" | "WAITING" | "COMPLETED" | "ATTENTION" | "IDLE" | "CONNECT" | "ERROR";

export const STATE_LABEL: Record<AgentState, string> = {
  WORKING: "Working",
  MONITORING: "Monitoring",
  WAITING: "Waiting for approval",
  COMPLETED: "Completed",
  ATTENTION: "Needs attention",
  IDLE: "Idle",
  CONNECT: "Connection required",
  ERROR: "Error",
};

export type RunLite = { task: string; status: "RUNNING" | "DONE" | "NOTHING" | "FAILED"; summary: string | null; startedAt: Date; finishedAt: Date | null };

export type AgentFacts = {
  role: AgentRole;
  now: Date;
  metaConnected: boolean;
  liveCampaigns: number;
  /** This agent's recent runs, newest first. */
  runs: RunLite[];
  /** Its recommendations waiting for the customer. */
  pending: number;
  /** Something else it's waiting on the customer for (a plan to approve, a launch). */
  waitingFor: string | null;
  /** An urgent problem in its area, in a sentence. */
  attention: string | null;
};

export type AgentStatus = {
  role: AgentRole;
  state: AgentState;
  label: string;
  /** One sentence: what's going on. */
  line: string;
  /** The last thing it finished, with when. */
  lastDone: { summary: string; at: Date } | null;
  /** What it's doing, only while it really is. */
  current: string | null;
};

const HOUR = 3_600_000;
/** A run older than this that never finished is treated as failed (and swept). */
export const STUCK_AFTER_MS = 30 * 60_000;

const time = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const when = (d: Date, now: Date) => {
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86_400_000);
  return days === 0 ? `today at ${time(d)}` : days === 1 ? `yesterday at ${time(d)}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const IDLE_LINE: Record<AgentRole, string> = {
  STRATEGIST: "Ready to plan when you tell MAIRO your goal.",
  AUDIENCE: "Works on who to reach when a plan or campaign is being made.",
  CREATIVE: "Ready to make ads when you start a campaign or ask for one.",
  ARCHITECT: "Ready to build a campaign from your approved plan.",
  OPTIMIZER: "Starts looking for improvements once a campaign has been running a few days.",
  GUARDIAN: "Watches spend once a campaign is live.",
  ANALYST: "Starts reporting once a campaign has results.",
  GROWTH: "Looks for growth once there are results to build on.",
};

export function agentStatus(f: AgentFacts): AgentStatus {
  const info = AGENT[f.role];
  const done = f.runs.find((r) => r.status === "DONE" || r.status === "NOTHING") ?? null;
  const lastDone = done && done.finishedAt && done.summary ? { summary: done.summary, at: done.finishedAt } : null;
  const running = f.runs.find((r) => r.status === "RUNNING" && f.now.getTime() - r.startedAt.getTime() < STUCK_AFTER_MS) ?? null;
  const failed = f.runs.find((r) => r.status === "FAILED" || (r.status === "RUNNING" && f.now.getTime() - r.startedAt.getTime() >= STUCK_AFTER_MS)) ?? null;
  const failedAt = failed ? (failed.finishedAt ?? failed.startedAt) : null;
  const make = (state: AgentState, line: string, current: string | null = null): AgentStatus => ({ role: f.role, state, label: STATE_LABEL[state], line, lastDone, current });

  if (info.needsMeta && !f.metaConnected) return make("CONNECT", "Connect your Meta ad account so this agent can work.");
  if (running) return make("WORKING", `Working on it now — started ${time(running.startedAt)}.`, running.summary ?? running.task);
  if (failedAt && (!lastDone || failedAt > lastDone.at) && f.now.getTime() - failedAt.getTime() < 48 * HOUR) {
    return make("ERROR", "Couldn't finish its last task. MAIRO tries again at the next check.");
  }
  if (f.attention) return make("ATTENTION", f.attention);
  if (f.pending > 0) return make("WAITING", `${f.pending} recommendation${f.pending === 1 ? "" : "s"} waiting for your approval.`);
  if (f.waitingFor) return make("WAITING", f.waitingFor);
  if (info.periodic && f.liveCampaigns > 0 && lastDone && f.now.getTime() - lastDone.at.getTime() < 36 * HOUR) {
    return make("MONITORING", `Last checked ${when(lastDone.at, f.now)}. Checks once a day, and when you open MAIRO.`);
  }
  if (lastDone && f.now.getTime() - lastDone.at.getTime() < 72 * HOUR) return make("COMPLETED", `Finished ${when(lastDone.at, f.now)}.`);
  return make("IDLE", IDLE_LINE[f.role]);
}

/**
 * The welcome line on the AI Team screen and the Overview, from real counts
 * only: when the team last reviewed the account, how many specialties did
 * something today, and what's waiting.
 */
export function teamWelcome(input: { now: Date; statuses: AgentStatus[]; pending: number; lastReviewAt: Date | null }): string {
  const today = input.statuses.filter((s) => s.lastDone && startOfDay(s.lastDone.at) === startOfDay(input.now)).length;
  const parts: string[] = [];
  if (input.lastReviewAt) parts.push(`Your MAIRO AI Team last reviewed your campaigns ${when(input.lastReviewAt, input.now)}.`);
  else parts.push("Your MAIRO AI Team is ready.");
  if (today > 0) parts.push(`${today} ${today === 1 ? "specialist" : "specialists"} finished work today`);
  if (input.pending > 0) parts.push(`${input.pending} recommendation${input.pending === 1 ? " is" : "s are"} waiting for your approval`);
  if (parts.length === 1) {
    return input.lastReviewAt ? `${parts[0]} Nothing needs you right now.` : `${parts[0]} It starts reviewing results once a campaign is live.`;
  }
  const [first, ...rest] = parts;
  return `${first} ${rest.join(", and ").replace(/^./, (c) => c.toUpperCase())}.`;
}
