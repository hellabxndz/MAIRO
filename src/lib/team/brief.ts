import type { AgentRole } from "@/generated/prisma/enums";

// The Daily Brief, from records only: the results the team last read, what
// changed, what the team finished, what's wrong, what's waiting for the
// business and when the team looks next. Before anything has launched there
// are no results to brief on, so it says what's left to get there instead of
// showing figures it doesn't have. Pure; pinned by
// scripts/check-command-center.ts.

export type BriefItem = { text: string; href: string | null; at: Date | null; agent: AgentRole | null };

export type BriefInput = {
  now: Date;
  /** Something has run on Meta at some point. */
  launched: boolean;
  setup: { goal: boolean; meta: boolean; plan: boolean; built: boolean; launchApproved: boolean };
  /** The Analytics Agent's results line from the latest review. */
  results: { summary: string; detail: string | null; at: Date } | null;
  leadsLastDay: number;
  changes: BriefItem[];
  completed: BriefItem[];
  issues: BriefItem[];
  pending: { count: number; top: string | null };
  nextReview: Date | null;
  liveCampaigns: number;
};

export type Brief =
  | { kind: "onboarding"; steps: { label: string; done: boolean; href: string }[] }
  | {
      kind: "brief";
      results: BriefItem[];
      changes: BriefItem[];
      completed: BriefItem[];
      issues: BriefItem[];
      pending: { count: number; text: string };
      next: string;
      nextAt: Date | null;
    };

const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

export function dailyBrief(i: BriefInput): Brief {
  if (!i.launched) {
    return {
      kind: "onboarding",
      steps: [
        { label: "Tell MAIRO your goal", done: i.setup.goal, href: "/dashboard/mission" },
        { label: "Connect your Meta ad account", done: i.setup.meta, href: "/dashboard/meta" },
        { label: "Approve your advertising plan", done: i.setup.plan, href: "/dashboard/mission" },
        { label: "Let your Campaign Agent build your first campaign", done: i.setup.built, href: "/dashboard/create" },
        { label: "Approve the launch, with the budget shown", done: i.setup.launchApproved, href: "/dashboard/decisions" },
      ],
    };
  }
  const results: BriefItem[] = [];
  if (i.results) results.push({ text: i.results.summary, href: "/dashboard/reports/monthly?m=current", at: i.results.at, agent: "ANALYST" });
  if (i.leadsLastDay > 0) results.push({ text: `${n(i.leadsLastDay, "new lead")} in the last 24 hours.`, href: "/dashboard/leads", at: null, agent: null });
  if (!results.length) results.push({ text: "No results read yet — the team reads them at its next review.", href: null, at: null, agent: null });

  const next = i.liveCampaigns > 0 && i.nextReview ? "Your team's next scheduled review" : "Scheduled reviews start once a campaign is live";
  return {
    kind: "brief",
    results,
    changes: i.changes.slice(0, 4),
    completed: i.completed.slice(0, 5),
    issues: i.issues.slice(0, 4),
    pending: {
      count: i.pending.count,
      text: i.pending.count === 0 ? "Nothing is waiting for your approval." : `${n(i.pending.count, "item")} waiting for your approval${i.pending.top ? `, starting with: ${i.pending.top}` : ""}.`,
    },
    next,
    nextAt: i.liveCampaigns > 0 ? i.nextReview : null,
  };
}
