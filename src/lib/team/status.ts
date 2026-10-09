import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT } from "./agents";

// What each specialty is doing right now, worked out from what actually
// happened — its recorded runs, the decisions it's waiting on, and the
// account's connections. An agent is "Working" only while one of its runs is
// genuinely in progress, and "Monitoring scheduled" only if it checked
// recently and there is something live to check — with the time of its next
// scheduled check, because it checks on a schedule, not every second.
// Pure; pinned by scripts/check-team.ts.

export type AgentState = "WORKING" | "MONITORING" | "WAITING" | "COMPLETED" | "ATTENTION" | "IDLE" | "CONNECT" | "ERROR";

export const STATE_LABEL: Record<AgentState, string> = {
  WORKING: "Working",
  MONITORING: "Monitoring scheduled",
  WAITING: "Waiting for approval",
  COMPLETED: "Completed",
  ATTENTION: "Needs attention",
  IDLE: "Idle",
  CONNECT: "Connection required",
  ERROR: "Failed",
};

/**
 * When the daily team review runs: /api/cron/review in vercel.json
 * ("30 9 * * *", UTC). Kept in step with it by scripts/check-team.ts. Opening
 * MAIRO can also start a review when the last one is stale.
 */
export const DAILY_REVIEW_UTC = { hour: 9, minute: 30 } as const;

/** The next scheduled daily review after `now`. */
export function nextScheduledReview(now: Date): Date {
  const t = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), DAILY_REVIEW_UTC.hour, DAILY_REVIEW_UTC.minute));
  return t > now ? t : new Date(t.getTime() + 86_400_000);
}

/** What a task is, in words — for "Now: …" while it runs. */
const TASK_LABEL: Record<string, string> = {
  "team-review": "Reviewing your campaigns",
  "read-results": "Reading your latest results",
  "find-improvements": "Looking for improvements",
  recommend: "Writing recommendations",
  "check-limits": "Checking proposed changes against your limits",
  "check-approval": "Checking a change against your limits before it runs",
  "auto-apply": "Making a change you've allowed",
  "apply-approved": "Making the change you approved",
  "daily-brief": "Writing your Daily Brief",
  "coach-review": "Following your results from ad to customer",
  "coach-funnel": "Following your results from ad to customer",
  "build-campaign": "Building a campaign on Meta, switched off",
  launch: "Putting an approved campaign live",
  "ad-concept": "Writing ad ideas",
  "studio-image": "Making an ad image",
  "write-plan": "Writing your advertising plan",
  "read-website": "Reading your website",
  "plan-audience": "Choosing who to reach",
  "plan-creative": "Drafting ad ideas for your plan",
  "revise-plan": "Updating your plan",
  "cancel-launch": "Keeping a campaign switched off",
  "spend-check": "Checking spend against your limits",
  "weekly-report": "Writing your weekly report",
};
export const taskLabel = (task: string) => TASK_LABEL[task] ?? "Working on a task";

export type RunLite = { task: string; status: "RUNNING" | "DONE" | "NOTHING" | "FAILED"; summary: string | null; startedAt: Date; finishedAt: Date | null };

export type AgentFacts = {
  role: AgentRole;
  now: Date;
  /** The business's timezone, for the times it reads. */
  timeZone?: string;
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
  /** Its next scheduled check, for a specialty that checks on a schedule and has something live to check. */
  nextCheck: Date | null;
  /** Its last few finished tasks, newest first. */
  recent: { summary: string; at: Date; status: "DONE" | "NOTHING" | "FAILED" }[];
};

const HOUR = 3_600_000;
/** A run older than this that never finished is treated as failed (and swept). */
export const STUCK_AFTER_MS = 30 * 60_000;

const time = (d: Date, timeZone?: string) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone });
/** The calendar day of `d` in the zone, as a sortable number of days. */
const dayNumber = (d: Date, timeZone?: string) => {
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(d).split("-").map(Number);
  return Date.UTC(y, m - 1, day) / 86_400_000;
};
const when = (d: Date, now: Date, timeZone?: string) => {
  const days = dayNumber(now, timeZone) - dayNumber(d, timeZone);
  return days === 0 ? `today at ${time(d, timeZone)}` : days === 1 ? `yesterday at ${time(d, timeZone)}` : days === -1 ? `tomorrow at ${time(d, timeZone)}` : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
};
export const whenText = when;

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
  const tz = f.timeZone;
  const nextCheck = info.periodic && f.metaConnected && f.liveCampaigns > 0 ? nextScheduledReview(f.now) : null;
  const recent = f.runs
    .filter((r) => r.status !== "RUNNING" && r.summary)
    .slice(0, 3)
    .map((r) => ({ summary: r.summary!, at: r.finishedAt ?? r.startedAt, status: r.status as "DONE" | "NOTHING" | "FAILED" }));
  const make = (state: AgentState, line: string, current: string | null = null): AgentStatus => ({ role: f.role, state, label: STATE_LABEL[state], line, lastDone, current, nextCheck, recent });

  if (info.needsMeta && !f.metaConnected) return make("CONNECT", "Connect your Meta ad account so this agent can work.");
  if (running) return make("WORKING", `Started ${time(running.startedAt, tz)}. Shown as working only while the task is actually running.`, taskLabel(running.task));
  if (failedAt && (!lastDone || failedAt > lastDone.at) && f.now.getTime() - failedAt.getTime() < 48 * HOUR) {
    const why = failed?.status === "FAILED" && failed.summary ? `${failed.summary.replace(/\.$/, "")}.` : "Its last task didn't finish.";
    return make("ERROR", `${why} MAIRO tries again at the next check${nextCheck ? `, ${when(nextCheck, f.now, tz)}` : ""}.`);
  }
  if (f.attention) return make("ATTENTION", f.attention);
  if (f.pending > 0) return make("WAITING", `${f.pending} recommendation${f.pending === 1 ? "" : "s"} waiting for your approval.`);
  if (f.waitingFor) return make("WAITING", f.waitingFor);
  if (info.periodic && f.liveCampaigns > 0 && lastDone && f.now.getTime() - lastDone.at.getTime() < 36 * HOUR) {
    return make("MONITORING", `Last checked ${when(lastDone.at, f.now, tz)}. Next scheduled check ${when(nextCheck ?? nextScheduledReview(f.now), f.now, tz)}.`);
  }
  if (lastDone && f.now.getTime() - lastDone.at.getTime() < 72 * HOUR) return make("COMPLETED", `Finished ${when(lastDone.at, f.now, tz)}.`);
  return make("IDLE", IDLE_LINE[f.role]);
}

/**
 * The welcome line on the AI Team screen and the Overview, from real counts
 * only: when the team last reviewed the account, how many specialties did
 * something today, and what's waiting.
 */
export function teamWelcome(input: { now: Date; statuses: AgentStatus[]; pending: number; lastReviewAt: Date | null; timeZone?: string }): string {
  const tz = input.timeZone;
  const today = input.statuses.filter((s) => s.lastDone && dayNumber(s.lastDone.at, tz) === dayNumber(input.now, tz)).length;
  const parts: string[] = [];
  if (input.lastReviewAt) parts.push(`Your MAIRO AI Team last reviewed your campaigns ${when(input.lastReviewAt, input.now, tz)}.`);
  else parts.push("Your MAIRO AI Team is ready.");
  if (today > 0) parts.push(`${today} ${today === 1 ? "specialist" : "specialists"} finished work today`);
  if (input.pending > 0) parts.push(`${input.pending} recommendation${input.pending === 1 ? " is" : "s are"} waiting for your approval`);
  if (parts.length === 1) {
    return input.lastReviewAt ? `${parts[0]} Nothing needs you right now.` : `${parts[0]} It starts reviewing results once a campaign is live.`;
  }
  const [first, ...rest] = parts;
  return `${first} ${rest.join(", and ").replace(/^./, (c) => c.toUpperCase())}.`;
}
