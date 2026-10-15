import { db } from "@/lib/db";
import { loadOverview, change, type Overview, type RangeDays } from "@/lib/dashboard/overview";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { activeMission } from "@/lib/mission/store";
import { missionGoal, type MetricFamily } from "@/lib/mission/goals";
import { loadTeam, type TeamView } from "@/lib/team/store";
import { agentForDecision } from "@/lib/team/agents";
import { toView, type DecisionView } from "@/lib/decisions/store";
import { budgetImpact } from "@/lib/decisions/approval";
import { otherApprovals } from "@/lib/approvals/queue";
import { readinessFor } from "@/lib/readiness";
import { fetchMetaBillingStatus } from "@/lib/meta/billing";
import { firstCampaignState } from "@/lib/strategy/first-campaign";
import { suggestedAdsGate } from "@/lib/suggested-ads/store";
import { fromAds } from "@/lib/leads/outcomes";
import { RISK_LABEL } from "@/components/decisions/labels";
import { firstNameFrom } from "@/components/mairo/simple-dashboard";
import type { ConsoleHeaderData } from "@/components/console/header";
import type { MetricData } from "@/components/console/metrics";
import type { ActionItemData, ActionKind } from "@/components/console/action-center";
import type { CampaignCounts, CampaignSummaryRow } from "@/components/console/campaigns";
import type { CreativeTileData } from "@/components/console/creatives";
import type { ResultsInsight } from "@/components/console/results";
import type { TeamMemberData } from "@/components/console/team";
import type { PillTone } from "@/components/console/kit";

// Everything the Overview's console shows, read from this business's own
// records and its connected Meta account — and nothing else. A figure that
// wasn't reported is an empty state with its reason, never a zero; a
// campaign is "Live" only when Meta has it running; a creative says whether
// it's a picture or still a concept.

export type ConsoleData = {
  header: ConsoleHeaderData;
  metrics: MetricData[];
  period: string;
  actions: { items: ActionItemData[]; total: number; decisions: Record<string, DecisionView> };
  campaigns: { counts: CampaignCounts; rows: CampaignSummaryRow[] };
  creatives: { items: CreativeTileData[]; note: string | null; empty: string };
  results: { points: Overview["daily"]; empty: string | null; insights: ResultsInsight[]; count: { key: "purchases" | "leads"; label: string } | null };
  team: { members: TeamMemberData[]; intro: string };
  overview: Overview;
  teamView: TeamView;
};

const usd = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? null
    : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Math.abs(cents) >= 100_000 ? 0 : 2, minimumFractionDigits: Math.abs(cents) >= 100_000 ? 0 : 2 });
const whole = (n: number | null | undefined) => (n === null || n === undefined ? null : Math.round(n).toLocaleString("en-US"));

/** The result a goal counts, and what to call it. */
export function resultFor(family: MetricFamily, m: PlatformMetrics): { label: string; costLabel: string; value: number | null } {
  switch (family) {
    case "leads":
      return { label: "Leads", costLabel: "Cost per lead", value: m.leads ?? null };
    case "bookings":
      return { label: "Bookings", costLabel: "Cost per booking", value: m.bookings ?? null };
    case "calls":
      return { label: "Calls & messages", costLabel: "Cost per contact", value: m.contacts ?? null };
    case "traffic":
      return { label: "Website visits", costLabel: "Cost per visit", value: m.landingPageViews ?? null };
    case "awareness":
    case "visits":
      return { label: "People reached", costLabel: "Cost per 1,000 reached", value: m.reach ?? null };
    case "social":
      return { label: "Engagement", costLabel: "Cost per engagement", value: m.engagement ?? null };
    case "sales":
    default:
      return { label: "Purchases", costLabel: "Cost per purchase", value: m.purchases ?? null };
  }
}

function delta(now: number | null, before: number | null | undefined, goodWhen: "up" | "down" | "none"): MetricData["change"] {
  const c = change(now, before);
  if (c === null || !Number.isFinite(c)) return null;
  const pct = Math.round(c * 100);
  if (pct === 0) return { text: "No change", good: null };
  const up = pct > 0;
  return { text: `${up ? "▲" : "▼"} ${Math.abs(pct)}% vs previous`, good: goodWhen === "none" ? null : goodWhen === "up" ? up : !up };
}

/** The four headline figures, each from a connected source or an honest empty state. */
export function consoleMetrics(input: {
  family: MetricFamily;
  current: PlatformMetrics;
  previous: PlatformMetrics | null;
  campaigns: number;
  metaProblem: boolean;
  markedValueCents: number | null;
}): MetricData[] {
  const { current: m, previous: p, family } = input;
  const noCampaign = input.campaigns === 0;
  const why = noCampaign
    ? "Starts with your first campaign."
    : input.metaProblem
      ? "Meta couldn't be read just now — missing, not zero."
      : "Nothing reported for this period yet.";
  const firstFix = noCampaign ? { href: "/dashboard/launch", label: "Set up your first campaign" } : null;
  const spent = m.spendCents;
  const r = resultFor(family, m);
  const rp = p ? resultFor(family, p) : null;
  const per = (spend: number | null, n: number | null | undefined) => (spend !== null && n ? Math.round(spend / n) : null);
  const perNow = family === "awareness" || family === "visits" ? (m.reach ? Math.round(((spent ?? 0) / m.reach) * 1000) : null) : per(spent, r.value);
  const perBefore = !p || !rp ? null : family === "awareness" || family === "visits" ? (p.reach ? Math.round(((p.spendCents ?? 0) / p.reach) * 1000) : null) : per(p.spendCents, rp.value);

  const metaValue = m.revenueCents;
  const value: MetricData =
    metaValue !== null && metaValue > 0
      ? { key: "value", label: "Revenue", value: usd(metaValue), source: "Meta reports", change: delta(metaValue, p?.revenueCents, "up"), empty: null }
      : input.markedValueCents
        ? { key: "value", label: "Tracked value", value: usd(input.markedValueCents), source: "From leads you marked", change: null, empty: null }
        : {
            key: "value",
            label: "Revenue or tracked value",
            value: null,
            source: null,
            change: null,
            empty: noCampaign ? why : "Not tracked yet: no sale values from Meta or from leads you've marked.",
            fix: noCampaign ? firstFix : { href: "/dashboard/tracking", label: "Set up tracking" },
          };

  return [
    spent !== null && !noCampaign
      ? { key: "spend", label: "Money spent", value: usd(spent), source: "Meta reports", change: delta(spent, p?.spendCents, "none"), empty: null }
      : { key: "spend", label: "Money spent", value: null, source: null, change: null, empty: why, fix: firstFix },
    value,
    r.value !== null && !noCampaign
      ? { key: "results", label: r.label, value: whole(r.value), source: "Meta reports", change: delta(r.value, rp?.value, "up"), empty: null }
      : { key: "results", label: r.label, value: null, source: null, change: null, empty: noCampaign ? why : `No ${r.label.toLowerCase()} reported for this period.`, fix: noCampaign ? firstFix : null },
    perNow !== null && !noCampaign
      ? { key: "cost", label: r.costLabel, value: usd(perNow), source: "Meta reports", change: delta(perNow, perBefore, "down"), empty: null }
      : { key: "cost", label: r.costLabel, value: null, source: null, change: null, empty: noCampaign ? why : `Shown once there are ${r.label.toLowerCase()} to divide by.`, fix: null },
  ];
}

const KIND_BY_CATEGORY: Record<string, ActionKind> = {
  CREATIVE: "creative",
  AUDIENCE: "audience",
  BUDGET: "budget",
  WEBSITE: "website",
  RETARGETING: "audience",
  TESTING: "creative",
  GROWTH: "budget",
  NEEDS_ATTENTION: "other",
};

/** A recommendation as the Action Center shows it. */
export function actionFromDecision(d: DecisionView): ActionItemData {
  const b = budgetImpact(d.changes);
  const guideOnly = d.changes.every((c) => c.type === "guide");
  const kind = d.kind.includes("tracking") || d.kind.includes("pixel") ? "tracking" : (KIND_BY_CATEGORY[d.category] ?? "other");
  return {
    key: `d:${d.id}`,
    agent: agentForDecision(d.kind, d.category),
    kind,
    title: d.title,
    why: `${d.noticed} ${d.whyItMatters}`.trim(),
    impact: { text: b.text, up: b.direction === "up" },
    risk: RISK_LABEL[d.risk],
    href: `/dashboard/decisions#d-${d.id}`,
    cta: guideOnly ? "See what to do" : "Review & approve",
    urgent: d.urgent,
  };
}

const STATE_TONE: Record<string, PillTone> = { WORKING: "violet", MONITORING: "live", WAITING: "warn", COMPLETED: "blue", ATTENTION: "warn", IDLE: "muted", CONNECT: "warn", ERROR: "alert" };

export async function loadConsole(organizationId: string, userName: string, days: RangeDays, opts: { adBreakdown?: boolean } = {}): Promise<ConsoleData> {
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const [org, meta, mission, overview, liveRows, team, pending, others, firstCampaign, gate, markedValue, angles] = await Promise.all([
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true, timezone: true } }),
    db.metaAdAccount.findUnique({ where: { organizationId }, select: { metaAdAccountId: true, pageName: true, status: true } }),
    activeMission(organizationId),
    loadOverview(organizationId, days, { adBreakdown: opts.adBreakdown }),
    db.mairoCampaign.findMany({ where: { organizationId, status: { not: "ARCHIVED" } }, select: { id: true, status: true, totalDailyBudgetCents: true, platformCampaigns: { select: { status: true, externalCampaignId: true } } } }),
    loadTeam(organizationId, { now }),
    db.mairoDecision.findMany({ where: { organizationId, status: "PENDING" }, orderBy: [{ urgent: "desc" }, { createdAt: "desc" }], take: 6 }),
    otherApprovals(organizationId, now).catch(() => []),
    firstCampaignState(organizationId),
    suggestedAdsGate(organizationId).catch(() => null),
    db.lead.aggregate({ where: { organizationId, ...fromAds, createdAt: { gte: since }, valueCents: { not: null } }, _sum: { valueCents: true } }),
    db.adAngle.findMany({ where: { organizationId, angleKind: { not: null }, status: { notIn: ["ARCHIVED", "REJECTED"] } }, orderBy: [{ rank: "asc" }, { createdAt: "asc" }], take: 4, select: { id: true, title: true, recommended: true, status: true, revisions: { orderBy: { version: "desc" }, take: 1, select: { hook: true, cta: true, source: true } } } }),
  ]);
  const metaConnected = Boolean(meta);
  const billing = metaConnected ? await fetchMetaBillingStatus(organizationId).catch(() => null) : null;
  const readiness = await readinessFor(organizationId, { billing });
  const tz = org?.timezone || "America/New_York";
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  const greeting = `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}${userName ? `, ${firstNameFrom(userName, "")}` : ""}.`;
  // The goal chosen on the Overview; until there is one, the goal given at setup; only then sales.
  const setupGoal = mission ? null : ((await db.onboardingIntake.findUnique({ where: { organizationId }, select: { primaryGoal: true } }))?.primaryGoal ?? null);
  const FROM_SETUP: Partial<Record<string, MetricFamily>> = { LEADS: "leads", SALES: "sales", TRAFFIC: "traffic", AWARENESS: "awareness" };
  const family: MetricFamily = mission ? missionGoal(mission.primaryGoal).metrics : (setupGoal && FROM_SETUP[setupGoal]) || "sales";

  // ---- Header
  const working = team.statuses.find((s) => s.state === "WORKING");
  const trouble = team.statuses.find((s) => s.state === "ERROR" || s.state === "ATTENTION");
  const fmtTime = (d: Date) => d.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
  const ai: ConsoleHeaderData["ai"] = working
    ? { label: "Working now", tone: "violet", running: true, detail: working.current, href: "/dashboard/team" }
    : trouble
      ? { label: "Needs attention", tone: "warn", running: false, detail: trouble.line, href: "/dashboard/team" }
      : team.nextReview
        ? { label: "Monitoring", tone: "live", running: false, detail: `Next check ${fmtTime(team.nextReview)}`, href: "/dashboard/team" }
        : !metaConnected
          ? { label: "Waiting for Meta", tone: "muted", running: false, detail: "Connect your ad account to start", href: "/dashboard/meta" }
          : { label: "Ready", tone: "blue", running: false, detail: team.statuses.find((s) => s.lastDone)?.lastDone?.summary ?? null, href: "/dashboard/team" };
  const header: ConsoleHeaderData = {
    greeting,
    subline: mission ? `Working toward: ${missionGoal(mission.primaryGoal).label}.` : "Your advertising, and the AI team working on it.",
    business: org?.name ?? "Your business",
    adAccount: meta
      ? { label: meta.pageName ? `${meta.pageName} · ${meta.metaAdAccountId}` : meta.metaAdAccountId, state: meta.status === "CONNECTED" ? "connected" : "attention", href: "/dashboard/integrations" }
      : { label: "Meta ad account", state: "none", href: "/dashboard/meta" },
    ai,
  };

  // ---- Metrics
  const metrics = consoleMetrics({
    family,
    current: overview.current,
    previous: overview.previous,
    campaigns: overview.campaigns.length,
    metaProblem: overview.problems.length > 0,
    markedValueCents: markedValue._sum.valueCents ?? null,
  });

  // ---- Action Center: what's in the way first, then approvals, then new creative directions.
  const items: ActionItemData[] = [];
  const billingProblem = billing && billing.state !== "funded" && billing.state !== "unknown" ? billing : null;
  if (readiness.next && !readiness.ready && readiness.next.owner === "you") {
    items.push({ key: "readiness", agent: "ARCHITECT", kind: "setup", title: readiness.next.label, why: readiness.next.detail, impact: null, risk: null, href: readiness.next.id === "funding" && billingProblem?.actionUrl ? billingProblem.actionUrl : readiness.next.href, cta: "Fix this", urgent: false });
  } else if (billingProblem) {
    items.push({ key: "billing", agent: "GUARDIAN", kind: "setup", title: billingProblem.state === "no_payment_method" ? "Meta has no way to charge for your ads yet" : "Meta can't run your ads right now", why: billingProblem.message ?? "Open your Meta billing settings to fix it.", impact: null, risk: null, href: billingProblem.actionUrl ?? "/dashboard/meta", cta: billingProblem.actionLabel ?? "Fix in Meta", urgent: true });
  }
  if (firstCampaign && !firstCampaign.launched) {
    items.push({ key: "first", agent: "ARCHITECT", kind: "setup", title: "Finish setting up your first campaign", why: "A few steps are left before it can run. Nothing is spent until you approve the launch.", impact: null, risk: null, href: "/dashboard/launch", cta: "Continue", urgent: false });
  }
  for (const o of others.filter((x) => x.kind === "launch")) {
    items.push({ key: `o:${o.key}`, agent: o.agent, kind: "launch", title: o.title, why: o.text, impact: { text: o.budget, up: true }, risk: null, href: "/dashboard/decisions", cta: "Review the launch" });
  }
  const views = pending.map(toView);
  for (const v of views) items.push(actionFromDecision(v));
  for (const o of others.filter((x) => x.kind !== "launch")) {
    items.push({ key: `o:${o.key}`, agent: o.agent, kind: o.kind === "post" ? "creative" : "other", title: o.title, why: o.text, impact: o.budget ? { text: o.budget, up: false } : null, risk: null, href: o.href, cta: "Review" });
  }
  const approvedCreatives = gate?.ready ? await db.creativeApproval.count({ where: { organizationId, revokedAt: null } }) : 1;
  if (gate?.ready && approvedCreatives === 0) {
    items.push({ key: "suggested", agent: "CREATIVE", kind: "creative", title: "Review your suggested ad directions", why: "Three ways to start, written from what you confirmed about your business — one marked as the best first test.", impact: null, risk: null, href: "/dashboard/creatives/suggested", cta: "Review directions" });
  }
  const total = views.length + others.length + items.filter((i) => !i.key.startsWith("d:") && !i.key.startsWith("o:")).length;

  // ---- Campaigns: "Live" only when Meta has the campaign running.
  const live = new Map(liveRows.map((c) => [c.id, c]));
  const stateOf = (id: string, status: string) => {
    const row = live.get(id);
    const onMeta = row?.platformCampaigns.some((p) => p.status === "ACTIVE" && p.externalCampaignId);
    if (status === "ACTIVE" && onMeta) return "live" as const;
    if (status === "PAUSED") return "paused" as const;
    if (status === "PENDING_REVIEW" || (status === "ACTIVE" && !onMeta)) return "review" as const;
    return "draft" as const;
  };
  const counts: CampaignCounts = { live: 0, paused: 0, review: 0, draft: 0 };
  for (const c of overview.campaigns) counts[stateOf(c.id, c.status)] += 1;
  const STATUS: Record<keyof CampaignCounts, { label: string; tone: PillTone }> = {
    live: { label: "Live", tone: "live" },
    review: { label: "Waiting", tone: "warn" },
    paused: { label: "Paused", tone: "muted" },
    draft: { label: "Draft", tone: "violet" },
  };
  const GOAL: Record<string, string> = { LEADS: "Leads", SALES: "Sales", AWARENESS: "Awareness", TRAFFIC: "Website visits", APP_PROMOTION: "App installs", ENGAGEMENT: "Engagement" };
  const rows: CampaignSummaryRow[] = overview.campaigns.slice(0, 4).map((c) => {
    const r = resultFor(family, c.metrics);
    const budget = live.get(c.id)?.totalDailyBudgetCents;
    return {
      id: c.id,
      name: c.name,
      status: STATUS[stateOf(c.id, c.status)],
      goal: GOAL[c.objective] ?? c.objective,
      budget: budget ? `${usd(budget)} a day` : null,
      result: c.hasData && c.metrics.spendCents ? `${usd(c.metrics.spendCents)} spent${r.value ? ` · ${whole(r.value)} ${r.label.toLowerCase()}` : ""}` : null,
      thumbnailUrl: c.thumbnailUrl,
      href: `/dashboard/campaigns/${c.id}`,
    };
  });

  // ---- Creatives: live ads' pictures first, then the suggested directions.
  const angleIds = angles.map((a) => a.id);
  const assets = angleIds.length
    ? await db.creativeStudioAsset.findMany({ where: { organizationId, angleId: { in: angleIds }, archivedAt: null }, orderBy: { createdAt: "desc" }, select: { angleId: true, versions: { where: { status: "COMPLETE" }, orderBy: { version: "desc" }, take: 1, select: { imageUrl: true } } } })
    : [];
  const pictureFor = new Map<string, string>();
  for (const a of assets) if (a.angleId && a.versions[0]?.imageUrl && !pictureFor.has(a.angleId)) pictureFor.set(a.angleId, a.versions[0].imageUrl);
  const creativeItems: CreativeTileData[] = [
    ...overview.campaigns
      .filter((c) => c.thumbnailUrl && stateOf(c.id, c.status) === "live")
      .slice(0, 2)
      .map((c) => ({ key: `c:${c.id}`, headline: c.name, caption: "Running on Meta", kind: "live" as const, imageUrl: c.thumbnailUrl, label: c.name, href: `/dashboard/campaigns/${c.id}` })),
    ...angles.map((a) => ({
      key: `a:${a.id}`,
      headline: a.revisions[0]?.hook ?? a.title,
      caption: a.recommended ? "Suggested · best first test" : "Suggested direction",
      // Approved; a finished picture waiting for the owner's review; the owner's own edit; or MAIRO's suggestion, untouched.
      kind: (a.status === "APPROVED" ? "approved" : pictureFor.has(a.id) ? "review" : a.revisions[0]?.source === "owner" ? "draft" : "suggested") as CreativeTileData["kind"],
      imageUrl: pictureFor.get(a.id) ?? null,
      label: a.title,
      href: "/dashboard/creatives/suggested",
    })),
  ].slice(0, 4);

  // ---- Results
  const empty = overview.campaigns.length === 0
    ? "Your chart starts with your first campaign."
    : overview.daily === null
      ? "Meta couldn't give a day-by-day split just now. Refresh to try again."
      : overview.daily.every((d) => !d.delivered)
        ? `Nothing delivered in the last ${days} days yet.`
        : null;
  const insights: ResultsInsight[] = [];
  if (!empty && overview.current.spendCents) {
    const counted = counts.live + counts.paused;
    insights.push({ key: "spend", text: `${usd(overview.current.spendCents)} spent across ${counted || overview.campaigns.length} campaign${(counted || overview.campaigns.length) === 1 ? "" : "s"} in the last ${days} days, as Meta reports it.` });
    const best = [...overview.campaigns].filter((c) => (resultFor(family, c.metrics).value ?? 0) > 0).sort((a, b) => (resultFor(family, b.metrics).value ?? 0) - (resultFor(family, a.metrics).value ?? 0))[0];
    if (best) insights.push({ key: "best", text: `Most ${resultFor(family, best.metrics).label.toLowerCase()} came from “${best.name}”.`, href: `/dashboard/campaigns/${best.id}` });
  }
  if (overview.pendingCount > 0) insights.push({ key: "pending", text: `${overview.pendingCount} recommendation${overview.pendingCount === 1 ? "" : "s"} from your AI team ${overview.pendingCount === 1 ? "is" : "are"} waiting for you.`, href: "/dashboard/decisions" });

  // ---- Team
  const members: TeamMemberData[] = team.statuses.map((s) => ({ role: s.role, state: s.label, tone: STATE_TONE[s.state] ?? "muted", line: s.current ?? s.line, href: `/dashboard/team?agent=${s.role}#activity` }));

  return {
    header,
    metrics,
    period: `Last ${days} days`,
    actions: { items: items.slice(0, 6), total, decisions: Object.fromEntries(views.map((v) => [`d:${v.id}`, v])) },
    campaigns: { counts, rows },
    creatives: {
      items: creativeItems,
      note: creativeItems.some((c) => c.kind === "concept") ? "A concept has its words and direction but no picture yet — make one in Creative Studio when you're ready." : null,
      empty: gate?.ready
        ? "Your three suggested ad directions are ready to review in Creative Studio — open them and MAIRO writes them from what you confirmed."
        : "No creatives yet. Once your business profile is confirmed, MAIRO suggests three ad directions here.",
    },
    results: { points: overview.daily, empty, insights, count: family === "sales" ? null : family === "leads" || family === "bookings" || family === "calls" ? { key: "leads", label: "Leads" } : null },
    team: { members, intro: team.welcome },
    overview,
    teamView: team,
  };
}
