"use client";

import type { AgentRole } from "@/generated/prisma/enums";
import { DemoFrame } from "@/components/console/demo";
import { Panel } from "@/components/console/kit";
import { TeamPanel, type TeamMemberData } from "@/components/console/team";
import { FeedLine } from "@/components/team/agent-ui";
import type { FeedItem } from "@/lib/team/store";
import type { ClipLayout } from "@/lib/demo/clip";
import { SHOP } from "@/lib/demo/shop-sample";
import type { Clip } from "./stage";

// "An entire advertising team, powered by AI." — one morning's review for the
// sample shop, step by step, as the AI Team page records it: each specialty's
// state from its records (a still dot, never an animation), what each did and
// when, the one change worth trying checked against the owner's limits and
// sent for approval — and a specialty with nothing to do saying so.

const TZ = "America/New_York";
const NOW = new Date("2026-10-13T11:05:00.000Z");
const at = (h: number, m: number) => new Date(Date.UTC(2026, 9, 13, h + 4, m));

export const TEAM_T = { analyst: 3300, optimizer: 5300, creativeStart: 7300, creativeDone: 9400, guardian: 10900, waiting: 12400, growth: 13900, end: 18500 } as const;
const T = TEAM_T;

const FEED: { show: number; item: FeedItem; doneAt?: number; doneSummary?: string }[] = [
  { show: T.analyst, item: { id: "f1", agent: "ANALYST", status: "DONE", summary: "Read yesterday's figures from Meta: $29.10 spent, 1 purchase.", detail: null, href: null, at: at(7, 0) } },
  { show: T.optimizer, item: { id: "f2", agent: "OPTIMIZER", status: "DONE", summary: "One ad brought 9 of the 12 purchases. Too early to pause the others — Meta is still learning.", detail: null, href: null, at: at(7, 1) } },
  { show: T.creativeStart, doneAt: T.creativeDone, doneSummary: "Drafted a second opening line for the best ad, from your confirmed facts only.", item: { id: "f3", agent: "CREATIVE", status: "RUNNING", summary: "Writing a second opening line for the best ad.", detail: null, href: null, at: at(7, 2) } },
  { show: T.guardian, item: { id: "f4", agent: "GUARDIAN", status: "DONE", summary: "Checked the draft: no change to what you spend, inside your limits.", detail: null, href: null, at: at(7, 3) } },
  { show: T.waiting, item: { id: "f5", agent: "CREATIVE", status: "DONE", summary: "Sent to Approvals: “Consider testing a new opening line.”", detail: null, href: null, at: at(7, 3) } },
  { show: T.growth, item: { id: "f6", agent: "GROWTH", status: "NOTHING", summary: "Nothing to suggest today — the test comes first.", detail: null, href: null, at: at(7, 4) } },
];

function member(role: AgentRole, t: number): TeamMemberData {
  const m = (state: string, tone: TeamMemberData["tone"], line: string) => ({ role, state, tone, line });
  switch (role) {
    case "STRATEGIST":
      return m("Completed", "blue", "Wrote the plan you approved.");
    case "AUDIENCE":
      return m("Completed", "blue", "Set up the audience you approved.");
    case "ARCHITECT":
      return m("Completed", "blue", "Built the campaign you launched.");
    case "ANALYST":
      return t >= T.analyst ? m("Completed", "blue", "Read Meta's figures at 7:00 AM.") : m("Monitoring scheduled", "live", "Daily review at 7:00 AM.");
    case "OPTIMIZER":
      return t >= T.optimizer ? m("Completed", "blue", "Compared the ads at 7:01 AM.") : m("Monitoring scheduled", "live", "Daily review at 7:00 AM.");
    case "CREATIVE":
      return t >= T.waiting ? m("Waiting for approval", "warn", "Drafted a second opening line.") : t >= T.creativeStart ? m("Working", "violet", "Writing a second opening line.") : m("Idle", "muted", "Nothing to make right now.");
    case "GUARDIAN":
      return t >= T.guardian ? m("Completed", "blue", "Checked the draft against your limits.") : m("Monitoring scheduled", "live", "Spend is inside your limits.");
    case "GROWTH":
      return t >= T.growth ? m("Idle", "muted", "Nothing to suggest today.") : m("Idle", "muted", "Looks for next steps after a test.");
  }
}

const ROLES: AgentRole[] = ["STRATEGIST", "CREATIVE", "AUDIENCE", "ARCHITECT", "OPTIMIZER", "GUARDIAN", "ANALYST", "GROWTH"];

function Team({ t, narrow }: { t: number; narrow: boolean }) {
  const feed = FEED.filter((f) => t >= f.show).map((f) => (f.doneAt && t >= f.doneAt ? { ...f.item, status: "DONE" as const, summary: f.doneSummary! } : f.item));
  const waiting = t >= T.waiting ? 1 : 0;
  return (
    <DemoFrame view="overview" active="/dashboard/team" owner={SHOP.owner} sampleLabel={false} label="Product demo: the MAIRO AI Team page for a fictional shop">
      <div className="space-y-4">
        <div>
          <p className="text-[24px] font-semibold tracking-[-0.02em] text-white">AI Team</p>
          <p className="mt-1 text-[13.5px] text-muted">Eight AI specialties of one system, working on {SHOP.name}.</p>
        </div>
        <TeamPanel members={ROLES.map((r) => member(r, t))} intro={`Your MAIRO AI Team is monitoring one live campaign. ${waiting ? "1 recommendation is" : "No recommendations are"} waiting for your approval.`} />
        <Panel id="feed" title={narrow ? "This morning" : "This morning's review · Tuesday"}>
          {feed.length === 0 ? (
            <p className="text-[13px] text-muted">The daily review starts at 7:00 AM.</p>
          ) : (
            <ul className="-mx-3 divide-y divide-white/[0.05]">
              {[...feed].reverse().map((i) => (
                <FeedLine key={i.id + i.status} item={i} now={NOW} timeZone={TZ} />
              ))}
            </ul>
          )}
          <p className="mt-3 text-[12px] text-faint">Next daily review tomorrow, 7:00 AM.</p>
        </Panel>
      </div>
    </DemoFrame>
  );
}

export const TEAM_CLIP: Clip = {
  id: "team",
  title: "One morning's review by MAIRO's AI team for a fictional shop",
  duration: T.end,
  posterAt: 12800,
  captions: [
    { start: 0, end: T.analyst, text: "Eight AI specialties of one system, each with one job." },
    { start: T.analyst, end: T.creativeStart, text: "Every morning they review your results — and every step is on record." },
    { start: T.creativeStart, end: T.waiting, text: "When something is worth trying, they prepare it and check it against your limits." },
    { start: T.waiting, end: 15200, text: "Then it waits for your approval." },
    { start: 15200, end: T.end, text: "When there's nothing to do, they say so. No pretend activity." },
  ],
  scenes: [
    {
      id: "team",
      label: "AI Team",
      start: 0,
      end: T.end,
      world: (t: number, layout: ClipLayout) => <Team t={t} narrow={layout === "narrow"} />,
      layoutKey: (t) => String(FEED.filter((f) => t >= f.show).length) + (t >= T.creativeDone ? "d" : ""),
      cursor: [
        { at: T.waiting + 600, cue: "text:Waiting for approval" },
      ],
      camera: [
        { at: 0, cue: '[data-panel="team-panel"]', zoom: 1.1, narrowZoom: 1, align: "top", dur: 1 },
        { at: T.analyst - 400, cue: '[data-panel="feed"]', zoom: 1.15, narrowZoom: 1, align: "top", dur: 1000 },
        { at: T.waiting, cue: '[data-panel="team-panel"]', zoom: 1.1, narrowZoom: 1, align: "top", dur: 1000 },
        { at: T.growth, cue: '[data-panel="feed"]', zoom: 1.15, narrowZoom: 1, align: "top", dur: 1000 },
        { at: 16200, cue: '[data-panel="team-panel"]', zoom: 1, narrowZoom: 1, align: "top", dur: 1200 },
      ],
    },
  ],
};
