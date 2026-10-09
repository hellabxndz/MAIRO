import Link from "next/link";
import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { EMPTY_METRICS } from "@/lib/ad-platforms/types";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { readinessFor } from "@/lib/readiness";
import { toView } from "@/lib/decisions/store";
import { activeMission, proposedMission } from "@/lib/mission/store";
import { missionGoal, type MetricFamily } from "@/lib/mission/goals";
import { firstCampaignState } from "@/lib/strategy/first-campaign";
import { firstNameFrom } from "@/components/mairo/simple-dashboard";
import { localDay, performanceTiles } from "@/lib/dashboard/home";
import { leadFunnel, outcomeSummary } from "@/lib/leads/outcomes";
import { cookies } from "next/headers";
import { journeyFor, pulseDue } from "@/lib/success/store";
import { PULSE_LATER_COOKIE } from "@/lib/success/journey";
import { JourneyCard } from "@/components/success/journey-card";
import { loadTeam } from "@/lib/team/store";
import { loadBrief } from "@/lib/team/brief-store";
import { otherApprovals } from "@/lib/approvals/queue";
import { assistantNameOf } from "@/lib/ai/agents";
import { PulseCard } from "@/components/success/feedback";
import { DailyBrief } from "@/components/team/daily-brief";
import { AttentionCard, EmptyHome, PerformanceCard, type AttentionItem } from "@/components/dashboard/simple-home";
import { ApprovalsPreview, HomeSection, RecentWork, TeamStrip } from "@/components/dashboard/command-home";
import { AskTeam } from "@/components/dashboard/ask-team";
import { DashboardModeToggle } from "@/components/dashboard/overview/mode-toggle";
import { ChangeGoalModalButton } from "@/components/mairo/goal-actions";

// The Overview in Simple mode: one helpful assistant in front of a whole
// advertising department. Five sections, in the order an owner asks:
//
//   1. Business results            how is my advertising doing? (this month)
//   2. Your AI advertising team    who's on it, and what is each one doing?
//   3. What MAIRO did recently     what actually happened?
//   4. Waiting for your approval   what needs my yes?
//   5. Your Daily Brief            the day's results, changes, issues and next check
//
// With "Ask your AI team" above them, and — only when something is in the
// way — what needs fixing first. Everything here comes from records; before
// anything has launched the Brief shows the steps left, never figures.
// Advanced and Profit First stay one switch away for the full numbers.

export async function SimpleOverview({ organizationId, userName, launched, askFeedback = false }: { organizationId: string; userName: string; launched: { launched: boolean; names: string[] }; askFeedback?: boolean }) {
  const [org, mission, proposal, campaignCount, connections, pulseWanted, pulseLater] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true, foundingCustomer: true, assistantName: true } }),
    activeMission(organizationId),
    proposedMission(organizationId),
    db.mairoCampaign.count({ where: { organizationId, status: { not: "ARCHIVED" } } }),
    connectionSummaries(organizationId),
    pulseDue(organizationId),
    cookies().then((c) => c.get(PULSE_LATER_COOKIE)?.value === "1"),
  ]);
  const showPulse = askFeedback || (pulseWanted && !pulseLater);
  const tz = org?.timezone || "America/New_York";
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  const greeting = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${userName ? `, ${firstNameFrom(userName, "")}` : ""}.`;
  const assistant = assistantNameOf(org?.assistantName);

  if (!mission && !proposal && campaignCount === 0) {
    // A brand-new account still gets its first-30-days guide under the
    // starting question — it's the one thing that says what happens next.
    const early = await journeyFor(organizationId);
    return (
      <>
        <EmptyHome greeting={greeting} />
        <div className="mx-auto max-w-[920px] space-y-4">
          {early?.show && <JourneyCard journey={early} founding={Boolean(org?.foundingCustomer)} />}
          {showPulse && <PulseCard />}
        </div>
      </>
    );
  }

  const today = localDay(now, tz);
  const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
  const family: MetricFamily = mission ? missionGoal(mission.primaryGoal).metrics : "sales";
  const metaConnected = [...connections.values()].some((c) => c.connected && c.platform === "META");
  const billingRead = metaConnected ? fetchMetaBillingStatus(organizationId).catch(() => null) : Promise.resolve(null);

  const [billing, perf, readiness, decisions, firstCampaign, monthLeads, team, others] = await Promise.all([
    billingRead,
    campaignCount > 0 ? fetchOrganizationPerformance(organizationId, { since: monthStart, until: now }).catch(() => null) : Promise.resolve(null),
    billingRead.then((b) => readinessFor(organizationId, { billing: b })),
    db.mairoDecision.findMany({ where: { organizationId, status: "PENDING" }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], take: 10 }),
    firstCampaignState(organizationId),
    db.lead.findMany({ where: { organizationId, createdAt: { gte: monthStart } }, select: { status: true, valueCents: true } }),
    loadTeam(organizationId, { now }),
    otherApprovals(organizationId, now).catch(() => []),
  ]);
  const brief = await loadBrief(organizationId, team, now);
  const billingProblem = billing && billing.state !== "funded" && billing.state !== "unknown" ? billing : null;
  const m = perf?.total ?? EMPTY_METRICS;

  // Only what's in the way. Recommendations and launches live in section 4.
  const blockers: AttentionItem[] = [];
  if (readiness.next && !readiness.ready && readiness.next.owner === "you") {
    blockers.push({ key: "readiness", title: readiness.next.label, text: readiness.next.detail, action: readiness.next.id === "funding" && billingProblem?.actionUrl ? { href: billingProblem.actionUrl, label: billingProblem.actionLabel ?? "Fix in Meta", external: true } : { href: readiness.next.href, label: "Fix this" } });
  } else if (billingProblem) {
    blockers.push({ key: "billing", title: billingProblem.state === "no_payment_method" ? "Meta has no way to charge for your ads yet" : "Meta can't run your ads right now", text: billingProblem.message ?? "Open your Meta billing settings to fix it.", action: billingProblem.actionUrl ? { href: billingProblem.actionUrl, label: billingProblem.actionLabel ?? "Fix in Meta", external: true } : { href: "/dashboard/meta", label: "See details" } });
  }
  if (firstCampaign && !firstCampaign.launched) blockers.push({ key: "first", title: "Finish setting up your first campaign", text: "A few steps are left before it can run.", action: { href: "/dashboard/launch", label: "Continue" } });
  if (launched.launched) blockers.push({ key: "launched", title: launched.names.length === 1 ? `“${launched.names[0]}” is now live` : `${launched.names.length} campaigns are now live`, text: "Meta approved the ads and confirmed your account can be charged, so the launch you approved went ahead. You can pause any time.", action: { href: "/dashboard/campaigns", label: "See campaigns" } });

  const perfNote = perf?.problems.length
    ? "Meta couldn't be read just now, so some numbers may be missing — not zero. They fill in on the next look."
    : campaignCount === 0
      ? "Your results appear here once your first campaign runs."
      : (m.spendCents ?? 0) === 0
        ? "Nothing spent yet this month."
        : null;
  const goal = mission ? (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-white/85">
      <span className="text-faint">Your goal:</span>
      <span className="font-medium text-white">{missionGoal(mission.primaryGoal).label}</span>
      <ChangeGoalModalButton />
    </p>
  ) : proposal ? (
    <p className="text-[14px] text-white/85">
      MAIRO created a plan for you: <span className="font-medium text-white">{proposal.title}</span>.{" "}
      <Link href="/dashboard/mission" className="text-violet-bright hover:underline">Review it</Link>
    </p>
  ) : null;

  const journey = await journeyFor(organizationId, { readiness, spendCents: m.spendCents }).catch(() => null);
  const views = decisions.map(toView);
  const waiting = views.length + others.length;

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[clamp(24px,3vw,30px)] font-semibold tracking-[-0.02em] text-white">{greeting}</h1>
          <p className="mt-1 text-[14.5px] text-muted">Your advertising, and the AI team working on it, at a glance.</p>
        </div>
        <DashboardModeToggle mode="simple" />
      </header>
      <div className="space-y-4 sm:space-y-5">
        {journey?.show && <JourneyCard journey={journey} founding={Boolean(org?.foundingCustomer)} />}
        {blockers.length > 0 && <AttentionCard items={blockers} />}
        <AskTeam name={assistant} />

        <PerformanceCard heading="Business results" tiles={performanceTiles(family, m)} note={perfNote} outcome={outcomeSummary(leadFunnel(monthLeads), m.spendCents)} goal={goal} href="/dashboard/reports/monthly?m=current" />

        <HomeSection id="home-team" title="Your AI advertising team" action={{ href: "/dashboard/team", label: "Open your AI Team" }}>
          <TeamStrip team={team} />
        </HomeSection>

        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          <HomeSection id="home-recent" title="What MAIRO did recently" action={{ href: "/dashboard/team#activity", label: "Full activity" }}>
            <RecentWork team={team} now={now} />
          </HomeSection>
          <HomeSection id="home-approvals" title="Waiting for your approval" action={{ href: "/dashboard/decisions", label: `Approval Center${waiting ? ` (${waiting})` : ""}` }}>
            <ApprovalsPreview decisions={views} others={others} />
          </HomeSection>
        </div>

        <HomeSection id="home-brief" title="Your Daily Brief" tint action={{ href: "/dashboard/team#brief", label: "Open on your AI Team" }}>
          <DailyBrief brief={brief} now={now} timeZone={team.timeZone} compact />
        </HomeSection>

        {showPulse && <PulseCard />}
      </div>
    </div>
  );
}
