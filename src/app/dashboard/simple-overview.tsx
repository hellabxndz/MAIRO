import { db } from "@/lib/db";
import { fetchOrganizationPerformance } from "@/lib/ad-platforms/performance";
import { EMPTY_METRICS } from "@/lib/ad-platforms/types";
import { connectionSummaries } from "@/lib/ad-platforms/connections";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { readinessFor } from "@/lib/readiness";
import { buildRecommendations } from "@/lib/actions/optimize-actions";
import { OptimizationCard } from "@/components/optimization-card";
import { MairoDecisionCard } from "@/components/decisions/decision-card";
import { toView } from "@/lib/decisions/store";
import { loadIntelligence } from "@/lib/intelligence/run";
import { activeMission, missionActivity, proposedMission } from "@/lib/mission/store";
import { goalPhrase, missionGoal, type MetricFamily } from "@/lib/mission/goals";
import { missionConfidence } from "@/lib/engine";
import { socialAccess } from "@/lib/social/access";
import { firstCampaignState } from "@/lib/strategy/first-campaign";
import { firstNameFrom } from "@/components/mairo/simple-dashboard";
import { localDay, performanceTiles, pickInsight, whatsNext, type InsightCandidate, type NextItem } from "@/lib/dashboard/home";
import { WEEKDAYS } from "@/lib/reports/weekly";
import { AttentionCard, EmptyHome, GoalCard, HomeHeader, InsightCard, NextCard, PerformanceCard, ProposalCard, WorkingOnCard, type AttentionItem, type WorkRow } from "@/components/dashboard/simple-home";

// The Overview in Simple mode: five questions, six calm cards.
//
//   1. Your goal            what am I trying to accomplish?
//   2. This month           how is my business performing? (four numbers, for the goal)
//   3. Mairo is working on  what is MAIRO doing? (each row opens its page)
//   4. Needs your attention does MAIRO need anything? (only when it does)
//   5. Mairo insight        one thing worth knowing (See why opens the detail)
//   6. What's next          what MAIRO has planned
//
// Everything else — campaign tables, charts, decision lists, technical
// metrics — lives one click away in Campaigns, Creatives, Analytics or
// Advanced view. Before adding anything here, ask: does the customer need to
// see this immediately?

const DAY = 86_400_000;

export async function SimpleOverview({ organizationId, userName, launched }: { organizationId: string; userName: string; launched: { launched: boolean; names: string[] } }) {
  const org = await db.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  const tz = org?.timezone || "America/New_York";
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  const greeting = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${userName ? `, ${firstNameFrom(userName, "")}` : ""}.`;

  const [mission, proposal, campaignCount] = await Promise.all([
    activeMission(organizationId),
    proposedMission(organizationId),
    db.mairoCampaign.count({ where: { organizationId, status: { not: "ARCHIVED" } } }),
  ]);
  if (!mission && !proposal && campaignCount === 0) return <EmptyHome greeting={greeting} />;

  const today = localDay(now, tz);
  const monthStart = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
  const family: MetricFamily = mission ? missionGoal(mission.primaryGoal).metrics : "sales";

  const connections = await connectionSummaries(organizationId);
  const metaConnected = [...connections.values()].some((c) => c.connected && c.platform === "META");
  const billing = metaConnected ? await fetchMetaBillingStatus(organizationId).catch(() => null) : null;
  const billingProblem = billing && billing.state !== "funded" && billing.state !== "unknown" ? billing : null;

  const [perf, activity, readiness, decisions, intelligence, learnings, recommendations, social, posts, newCreative, notes, campaigns, reportSettings, firstCampaign] = await Promise.all([
    campaignCount > 0 ? fetchOrganizationPerformance(organizationId, { since: monthStart, until: now }).catch(() => null) : Promise.resolve(null),
    missionActivity(organizationId),
    readinessFor(organizationId, { billing }),
    db.mairoDecision.findMany({ where: { organizationId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 10 }),
    loadIntelligence(organizationId).catch(() => null),
    db.mairoLearning.findMany({ where: { organizationId, active: true, confidence: { in: ["HIGH", "MEDIUM"] } }, orderBy: { lastSeenAt: "desc" }, take: 5 }),
    campaignCount > 0 ? buildRecommendations(organizationId).catch(() => []) : Promise.resolve([]),
    socialAccess(organizationId),
    db.instagramPost.findMany({ where: { organizationId, status: { in: ["SUGGESTED", "SCHEDULED"] }, scheduledFor: { gte: now, lte: new Date(now.getTime() + 14 * DAY) } }, orderBy: { scheduledFor: "asc" }, take: 20, select: { id: true, status: true, scheduledFor: true, network: true, mediaType: true } }),
    (async () => {
      // A creative MAIRO made recently that no campaign uses yet.
      const used = await db.campaignAd.findMany({ where: { mairoCampaign: { organizationId }, creativeRequestId: { not: null } }, select: { creativeRequestId: true } });
      return db.creativeRequest.findFirst({ where: { organizationId, status: "APPROVED", createdAt: { gte: new Date(now.getTime() - 14 * DAY) }, id: { notIn: used.map((u) => u.creativeRequestId!) } }, orderBy: { createdAt: "desc" }, select: { id: true, brief: true } });
    })(),
    db.missionNote.findMany({ where: { organizationId, kind: "PROMOTION", active: true, endsAt: { gte: now, lte: new Date(now.getTime() + 8 * DAY) } }, take: 3 }),
    db.mairoCampaign.findMany({ where: { organizationId, startDate: { gt: now, lte: new Date(now.getTime() + 8 * DAY) }, status: { notIn: ["ARCHIVED"] } }, select: { name: true, startDate: true }, take: 3 }),
    db.reportSettings.findUnique({ where: { organizationId }, select: { weeklyEnabled: true, deliveryDay: true } }),
    firstCampaignState(organizationId),
  ]);
  const m = perf?.total ?? EMPTY_METRICS;
  const scale = social.ok;
  const askSocial = scale && !(await db.socialStrategy.findUnique({ where: { organizationId }, select: { id: true } }));

  // --- 1. Goal --------------------------------------------------------------------
  const sure = mission ? await missionConfidence(organizationId, family, m).catch(() => null) : null;
  const goal = mission ? (
    <GoalCard goal={missionGoal(mission.primaryGoal).label} sentence={mission.plan.mission} secondary={mission.secondaryGoal ? missionGoal(mission.secondaryGoal).label : null} confidence={sure?.customer ?? null} />
  ) : proposal ? (
    <ProposalCard title={proposal.title} sentence={proposal.plan.mission} />
  ) : (
    <GoalCard goal="No goal set yet" sentence="Tell MAIRO what you want to achieve — more sales, leads or bookings — and it focuses everything on that." secondary={null} confidence={null} />
  );

  // --- 2. Performance -----------------------------------------------------------
  const perfNote = perf?.problems.length
    ? "Meta couldn't be read just now, so some numbers may be missing. They fill in on the next look."
    : campaignCount === 0
      ? "Your results appear here once your first campaign runs."
      : (m.spendCents ?? 0) === 0
        ? "Nothing spent yet this month."
        : null;

  // --- 3. Working on --------------------------------------------------------------
  const word = { sales: "sales", leads: "lead", bookings: "booking", calls: "calls", traffic: "traffic", awareness: "awareness", social: "social", visits: "local" }[family];
  const rows: WorkRow[] = [
    activity.campaignsRunning > 0
      ? { icon: "🟢", text: `${activity.campaignsRunning} campaign${activity.campaignsRunning === 1 ? "" : "s"} running`, href: "/dashboard/campaigns" }
      : { icon: "⚪", text: campaignCount > 0 ? "No campaigns running right now" : "No campaigns yet", href: campaignCount > 0 ? "/dashboard/campaigns" : "/dashboard/create" },
    ...(activity.creativesTesting > 0 ? [{ icon: "🧪", text: `Testing ${activity.creativesTesting} creative${activity.creativesTesting === 1 ? "" : "s"}`, href: "/dashboard/creatives" }] : []),
    ...(activity.campaignsRunning > 0 ? [{ icon: "⚡", text: `Optimizing your ${word} campaign${activity.campaignsRunning === 1 ? "" : "s"}`, href: "/dashboard/decisions" }] : []),
    ...(scale && activity.socialScheduled ? [{ icon: "📱", text: `${activity.socialScheduled} social post${activity.socialScheduled === 1 ? "" : "s"} scheduled`, href: "/dashboard/social/posts?view=upcoming" }] : []),
    ...(activity.promotionsActive > 0 ? [{ icon: "🏷️", text: activity.promotion ? `Promoting: ${activity.promotion}` : `${activity.promotionsActive} promotion running`, href: "/dashboard/mission" }] : []),
  ].slice(0, 5);

  // --- 4. Needs your attention ------------------------------------------------------
  const views = decisions.map(toView);
  const attention: AttentionItem[] = [];
  if (readiness.next && !readiness.ready && readiness.next.owner === "you") {
    attention.push({ key: "readiness", title: readiness.next.label, text: readiness.next.detail, action: readiness.next.id === "funding" && billingProblem?.actionUrl ? { href: billingProblem.actionUrl, label: billingProblem.actionLabel ?? "Fix in Meta", external: true } : { href: readiness.next.href, label: "Fix this" } });
  } else if (billingProblem) {
    attention.push({ key: "billing", title: billingProblem.state === "no_payment_method" ? "Meta has no way to charge for your ads yet" : "Meta can't run your ads right now", text: billingProblem.message ?? "Open your Meta billing settings to fix it.", action: billingProblem.actionUrl ? { href: billingProblem.actionUrl, label: billingProblem.actionLabel ?? "Fix in Meta", external: true } : { href: "/dashboard/meta", label: "See details" } });
  }
  if (firstCampaign && !firstCampaign.launched) attention.push({ key: "first", title: "Finish setting up your first campaign", text: "A few steps are left before it can run.", action: { href: "/dashboard/launch", label: "Continue" } });
  if (launched.launched) attention.push({ key: "launched", title: launched.names.length === 1 ? `MAIRO put ${launched.names[0]} live` : `MAIRO put ${launched.names.length} campaigns live`, text: "Everything it needed was done, so it started rather than waiting. You can pause any time.", action: { href: "/dashboard/campaigns", label: "See campaigns" } });
  if (mission && proposal) attention.push({ key: "proposal", title: "MAIRO created a new plan", text: `"${proposal.title}" is ready for your approval.`, action: { href: "/dashboard/mission", label: "Review" } });
  const decision = views.find((d) => d.changes.some((c) => c.type !== "guide"));
  if (decision) attention.push({ key: `decision-${decision.id}`, title: decision.kind === "meta-capability" ? "A new Meta option for your goal" : "Campaign recommendation", text: decision.title, action: { drawerTitle: "MAIRO's recommendation", label: "Review recommendation", content: <MairoDecisionCard decision={decision} advanced={false} /> } });
  const waiting = posts.filter((p) => p.status === "SUGGESTED");
  if (scale && waiting[0]?.scheduledFor) {
    const d = waiting[0];
    const when = d.scheduledFor!.toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
    attention.push({ key: "post", title: `${d.network === "FACEBOOK" ? "Facebook" : "Instagram"} ${d.mediaType === "REEL" ? "Reel" : "post"} ready`, text: `MAIRO created ${when}'s ${d.network === "FACEBOOK" ? "Facebook" : "Instagram"} ${d.mediaType === "REEL" ? "Reel" : "post"}${waiting.length > 1 ? ` (and ${waiting.length - 1} more)` : ""}.`, action: { href: "/dashboard/social/posts?view=approval", label: "Approve" } });
  }
  if (newCreative) attention.push({ key: "creative", title: "New creative ready", text: `MAIRO made a new creative${newCreative.brief ? `: ${newCreative.brief.slice(0, 80)}` : ""}.`, action: { href: "/dashboard/creatives?tab=new", label: "Review" } });
  if (recommendations[0]) attention.push({ key: "optimize", title: "Budget recommendation", text: recommendations[0].recommendation.headline, action: { drawerTitle: "MAIRO's recommendation", label: "Review recommendation", content: <OptimizationCard item={recommendations[0]} /> } });
  if (askSocial) attention.push({ key: "social", title: "Set up Social Manager", text: "Tell MAIRO what your posts should achieve and it plans your week.", action: { href: "/dashboard/social", label: "Set up" } });

  // --- 5. One insight ---------------------------------------------------------------
  const candidates: InsightCandidate[] = [
    ...learnings.map((l) => {
      let evidence: { label: string; value: string }[] = [];
      try {
        const e = JSON.parse(l.evidenceJson) as unknown;
        const list = Array.isArray(e) ? e : (e as { evidence?: unknown[] }).evidence ?? [];
        evidence = (list as { label?: string; value?: string }[]).filter((x) => x.label && x.value).slice(0, 4) as { label: string; value: string }[];
      } catch {
        evidence = [];
      }
      return { text: l.statement, why: `${l.statement} ${l.detail}`.trim(), evidence, href: "/dashboard/analytics", source: "learning" as const, strength: l.confidence === "HIGH" ? 3 : 2 };
    }),
    ...(intelligence?.insights ?? [])
      .filter((i) => i.severity === "OPPORTUNITY" || i.severity === "ATTENTION")
      .slice(0, 3)
      .map((i) => ({
        text: i.title,
        why: `${i.happened} ${i.whyItMatters}`.trim(),
        evidence: [...(i.previousValue ? [{ label: "Before", value: i.previousValue }] : []), ...(i.currentValue ? [{ label: "Now", value: i.currentValue }] : [])],
        href: i.mairoCampaignId ? `/dashboard/campaigns/${i.mairoCampaignId}` : "/dashboard/analytics",
        source: "intelligence" as const,
        strength: i.severity === "ATTENTION" ? 2.5 : 1.5,
      })),
  ];
  const insight = pickInsight(candidates);

  // --- 6. What's next ---------------------------------------------------------------
  const events: NextItem[] = [
    ...posts.filter((p) => p.scheduledFor).map((p) => ({
      day: localDay(p.scheduledFor!, tz),
      text: `${p.network === "FACEBOOK" ? "Facebook" : "Instagram"} ${p.mediaType === "REEL" ? "Reel" : p.mediaType === "STORY" ? "story" : p.mediaType === "CAROUSEL" ? "carousel" : "post"} publishes${p.status === "SUGGESTED" ? " after your approval" : ""}.`,
      href: "/dashboard/social/calendar",
    })),
    ...campaigns.filter((c) => c.startDate).map((c) => ({ day: localDay(c.startDate!, tz), text: `“${c.name}” starts.`, href: "/dashboard/campaigns" })),
    ...notes.filter((n) => n.endsAt).map((n) => ({ day: localDay(n.endsAt!, tz), text: `Your promotion ends — MAIRO adds a last-chance reminder.`, href: "/dashboard/mission" })),
    ...(activity.campaignsRunning > 0 ? [{ day: localDay(new Date(now.getTime() + DAY), tz), text: "MAIRO checks your results and looks for improvements." }] : []),
    ...(reportSettings?.weeklyEnabled !== false
      ? [(() => {
          const want = reportSettings?.deliveryDay ?? 1;
          const dow = new Date(`${today}T12:00:00Z`).getUTCDay();
          const ahead = ((want - dow + 7) % 7) || 7;
          return { day: localDay(new Date(Date.parse(`${today}T12:00:00Z`) + ahead * DAY), tz), text: `Your weekly report arrives (${WEEKDAYS[want]}).`, href: "/dashboard/reports" };
        })()]
      : []),
  ];
  const next = whatsNext({ today, events, campaignsRunning: activity.campaignsRunning, goalPhrase: mission ? goalPhrase(mission.primaryGoal) : null });

  // Mobile order is the reading order: goal, performance, doing, attention, insight, next.
  return (
    <div className="mx-auto max-w-[1180px]">
      <HomeHeader greeting={greeting} />
      <div className="space-y-4 sm:space-y-5">
        {goal}
        <PerformanceCard tiles={performanceTiles(family, m)} note={perfNote} />
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          <WorkingOnCard rows={rows} />
          <AttentionCard items={attention.slice(0, 3)} />
        </div>
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-2">
          <InsightCard insight={insight} />
          <NextCard items={next} />
        </div>
      </div>
    </div>
  );
}
