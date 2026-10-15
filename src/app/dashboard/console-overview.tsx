import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { loadConsole, type ConsoleData } from "@/lib/dashboard/console";
import type { RangeDays } from "@/lib/dashboard/overview";
import type { DashboardMode } from "@/lib/view-mode";
import { activeMission, proposedMission } from "@/lib/mission/store";
import { loadBrief } from "@/lib/team/brief-store";
import { journeyFor, pulseDue } from "@/lib/success/store";
import { PULSE_LATER_COOKIE } from "@/lib/success/journey";
import { assistantNameOf } from "@/lib/ai/agents";
import { ConsoleHeader } from "@/components/console/header";
import { MetricStrip } from "@/components/console/metrics";
import { ActionCenter } from "@/components/console/action-center";
import { DecisionControls } from "@/components/console/decision-controls";
import { CampaignsPanel } from "@/components/console/campaigns";
import { CreativesPanel } from "@/components/console/creatives";
import { ResultsPanel } from "@/components/console/results";
import { TeamPanel } from "@/components/console/team";
import { Panel } from "@/components/console/kit";
import { DashboardModeToggle } from "@/components/dashboard/overview/mode-toggle";
import { RangePicker } from "@/components/dashboard/overview/range-picker";
import { AskTeam } from "@/components/dashboard/ask-team";
import { RecentWork } from "@/components/dashboard/command-home";
import { DailyBrief } from "@/components/team/daily-brief";
import { JourneyCard } from "@/components/success/journey-card";
import { PulseCard } from "@/components/success/feedback";
import { GoalStarters } from "@/components/mairo/goal-actions";
import { ResultsNote } from "@/components/results-disclaimer";

// The Overview: MAIRO's command center, in the same order an owner asks.
//
//   Who's here, which business and ad account, what the AI team is doing
//   The four numbers: spent, what came back, results, cost per result
//   The AI Action Center: what MAIRO wants the owner to look at, with controls
//   Campaigns and creatives at a glance
//   Results over time, and the AI team
//   The Daily Brief and what MAIRO did recently
//
// Simple and Advanced share it; Advanced adds the full figures below (see
// page.tsx). Every value comes from loadConsole — this business's records and
// its connected Meta account — so a demonstration of these components on the
// website and a real account are the same screen.

export async function ConsoleOverview({
  organizationId,
  userName,
  days,
  mode,
  askFeedback = false,
  below,
  above,
  data,
}: {
  organizationId: string;
  userName: string;
  days: RangeDays;
  mode: DashboardMode;
  askFeedback?: boolean;
  /** Advanced's extra sections, under the shared console. */
  below?: React.ReactNode;
  /** Notices that outrank everything (a launch that just happened, a billing problem). */
  above?: React.ReactNode;
  /** Already read by the page (Advanced reads it once for its own sections too). */
  data?: ConsoleData;
}) {
  const [c, org, mission, proposal, pulseWanted, pulseLater] = await Promise.all([
    data ?? loadConsole(organizationId, userName, days, { adBreakdown: mode === "advanced" }),
    db.organization.findUnique({ where: { id: organizationId }, select: { foundingCustomer: true, assistantName: true } }),
    activeMission(organizationId),
    proposedMission(organizationId),
    pulseDue(organizationId),
    cookies().then((k) => k.get(PULSE_LATER_COOKIE)?.value === "1"),
  ]);
  const now = new Date();
  const [brief, journey] = await Promise.all([
    loadBrief(organizationId, c.teamView, now),
    journeyFor(organizationId, { spendCents: c.overview.current.spendCents }).catch(() => null),
  ]);
  const fresh = !mission && !proposal && c.overview.campaigns.length === 0;
  const showPulse = askFeedback || (pulseWanted && !pulseLater);
  const controls = Object.fromEntries(Object.entries(c.actions.decisions).map(([k, d]) => [k, <DecisionControls key={k} decision={d} />]));

  return (
    <div className="mx-auto max-w-[1320px]">
      <ConsoleHeader
        data={c.header}
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <RangePicker days={days} since={c.overview.range.since} until={c.overview.range.until} />
            <DashboardModeToggle mode={mode} />
          </div>
        }
      />

      <div className="space-y-4 sm:space-y-5">
        {above}
        {journey?.show && <JourneyCard journey={journey} founding={Boolean(org?.foundingCustomer)} />}

        {fresh ? (
          <Panel id="start" title="Start here" tone="lit">
            <h2 className="text-[clamp(22px,2.6vw,30px)] font-semibold tracking-[-0.02em] text-white">What would you like MAIRO to help you accomplish?</h2>
            <p className="mt-1.5 text-[14px] text-muted">MAIRO builds the plan and shows it to you first. Nothing launches or spends until you approve it.</p>
            <div className="mt-5">
              <GoalStarters />
            </div>
          </Panel>
        ) : (
          <AskTeam name={assistantNameOf(org?.assistantName)} />
        )}

        <h2 className="pt-1 text-[clamp(20px,2.2vw,26px)] font-semibold tracking-[-0.02em] text-white">Your business at a glance.</h2>
        <MetricStrip metrics={c.metrics} period={c.period} />

        <ActionCenter
          items={c.actions.items}
          total={c.actions.total}
          controls={controls}
          allHref="/dashboard/decisions"
          emptyText="Nothing needs you right now. When your AI team recommends a change — a better ad, an audience, a budget — it waits here with the reason, and nothing changes in your ad account until you approve it."
        />

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <CampaignsPanel counts={c.campaigns.counts} rows={c.campaigns.rows} allHref="/dashboard/campaigns" createHref="/dashboard/create" emptyText="No campaigns yet. MAIRO builds your first one from your approved plan, and nothing runs until you approve the launch." />
          <CreativesPanel items={c.creatives.items} allHref="/dashboard/creatives" note={c.creatives.note} emptyText={c.creatives.empty} />
        </div>

        <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <ResultsPanel points={c.results.points} empty={c.results.empty} insights={c.results.insights} count={c.results.count} allHref="/dashboard/analytics" period={c.period.toLowerCase()} />
          <Panel id="brief" title="Your Daily Brief" action={{ href: "/dashboard/team#brief", label: "AI Team" }}>
            <DailyBrief brief={brief} now={now} timeZone={c.teamView.timeZone} compact />
          </Panel>
        </div>

        <TeamPanel members={c.team.members} intro={c.team.intro} allHref="/dashboard/team" />

        <Panel id="recent" title="What MAIRO did recently" action={{ href: "/dashboard/team#activity", label: "Full activity" }}>
          <RecentWork team={c.teamView} now={now} />
        </Panel>

        {below}
        {showPulse && <PulseCard />}
        <ResultsNote className="mt-2" />
      </div>
    </div>
  );
}
