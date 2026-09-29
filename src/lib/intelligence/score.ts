import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { BrainAnalysis } from "@/lib/business/brain";
import { aggregateMetrics } from "./metrics";
import { clickRate, frequency, pastLearning } from "@/lib/decisions/rules";
import type { DecisionInput } from "@/lib/decisions/types";
import { usd } from "@/lib/protection/rules";
import { rankInsights, type IntelligenceContext } from "./detect";
import type { HealthArea, HealthAreaKey, HealthReason, HealthReport, Insight, OpportunityLevel, RadarArea, RadarReport } from "./types";

// Business Health and the Opportunity Radar, from the same Insights.
//
// A score starts at 100 and loses points only for something Mairo can name —
// each deduction is a line under the score saying what it was. An area with
// nothing to judge it on has no score at all ("Not enough data yet"), never a
// comfortable-looking default.

const LABEL: Record<HealthAreaKey, string> = {
  advertising: "Advertising Health",
  creative: "Creative Health",
  website: "Website Health",
  audience: "Audience Health",
  budget: "Budget Health",
};

class Scorer {
  score = 100;
  reasons: HealthReason[] = [];
  lose(points: number, text: string) {
    this.score -= points;
    this.reasons.push({ text, good: false });
  }
  note(text: string) {
    this.reasons.push({ text, good: true });
  }
  result(): number {
    return Math.max(5, Math.min(100, Math.round(this.score)));
  }
}

function recommend(insights: Insight[]): HealthArea["recommendation"] {
  const top = [...insights].sort(rankInsights)[0];
  if (!top) return null;
  return {
    text: top.recommendation,
    actionLabel: top.decisionDedupeKey ? "Fix with Mairo" : (top.action?.label ?? "Take a look"),
    href: top.decisionDedupeKey ? "/dashboard/decisions" : (top.action?.href ?? "/dashboard/decisions"),
    insightKey: top.dedupeKey,
  };
}

function capped(insights: Insight[], each: number, cap: number, s: Scorer) {
  let lost = 0;
  for (const i of insights) {
    const pts = Math.min(each, cap - lost);
    if (pts <= 0) {
      s.reasons.push({ text: i.title, good: false });
      continue;
    }
    s.lose(pts, i.title);
    lost += pts;
  }
}

const by = (insights: Insight[], ...types: string[]) => insights.filter((i) => types.includes(i.type));

function trend(now: number | null, before: number | null): number | null {
  return now === null || before === null || before === 0 ? null : now / before - 1;
}

export function scoreHealth(
  input: DecisionInput,
  insights: Insight[],
  ctx: IntelligenceContext,
  analysis: BrainAnalysis | null,
): HealthReport {
  const judged = input.campaigns.filter((c) => pastLearning(c, input.now));
  const week = aggregateMetrics(judged.map((c) => c.week));
  const recent = aggregateMetrics(judged.map((c) => c.recent));
  const prior = aggregateMetrics(judged.map((c) => c.prior));
  const areas: HealthArea[] = [
    advertising(judged.length > 0, insights, input, ctx, week, recent, prior),
    creative(judged, insights, recent, prior),
    website(input, insights, ctx, analysis),
    audience(judged.length > 0, insights, week),
    budget(judged.length > 0, insights, input),
  ];
  const scored = areas.filter((a) => a.score !== null);
  const score = scored.length >= 2 ? Math.round(scored.reduce((n, a) => n + a.score!, 0) / scored.length) : null;
  return { score, status: score === null ? null : score >= 80 ? "healthy" : score >= 60 ? "attention" : "risk", areas };
}

function empty(key: HealthAreaKey, needs: string): HealthArea {
  return { key, label: LABEL[key], score: null, reasons: [], recommendation: null, needs };
}

function advertising(
  judged: boolean,
  insights: Insight[],
  input: DecisionInput,
  ctx: IntelligenceContext,
  week: PlatformMetrics,
  recent: PlatformMetrics,
  prior: PlatformMetrics,
): HealthArea {
  if (!judged) return empty("advertising", "A campaign needs a few days and a little spend before its results mean anything.");
  const s = new Scorer();
  for (const i of by(insights, "not-spending")) s.lose(20, i.title);
  for (const i of by(insights, "cpa-rising")) s.lose(i.severity === "ATTENTION" ? 18 : 10, `${i.title} (${i.previousValue} → ${i.currentValue})`);
  for (const i of by(insights, "near-target-cpa")) s.lose(i.severity === "URGENT" ? 25 : 10, i.title);
  for (const i of by(insights, "tracking-setup", "tracking-drop")) s.lose(20, i.title);

  const minRoas = input.guardrails.minRoas;
  if (minRoas && week.roas !== null && week.roas < minRoas) s.lose(15, `Return on ad spend ${week.roas.toFixed(1)}x is below your ${minRoas}x minimum`);
  else if (week.roas !== null && week.roas >= 1) s.note(`Return on ad spend this week: ${week.roas.toFixed(1)}x`);

  const ctrMove = trend(clickRate(recent), clickRate(prior));
  if (ctrMove !== null && ctrMove <= -0.2) s.lose(10, `Click rate fell ${Math.round(-ctrMove * 100)}% against the days before`);
  else if (ctrMove !== null && ctrMove >= 0.1) s.note(`Click rate up ${Math.round(ctrMove * 100)}% against the days before`);

  const cpaNow = recent.costPerPurchaseCents;
  const cpaBefore = prior.costPerPurchaseCents;
  const cpaMove = trend(cpaNow, cpaBefore);
  if (cpaMove !== null && cpaMove <= -0.1 && cpaNow !== null) s.note(`Cost per purchase down ${Math.round(-cpaMove * 100)}% to ${usd(cpaNow)}`);

  if (ctx.pixels.some((p) => p.status === "ACTIVE")) s.note("Sales tracking is recording events");
  return {
    key: "advertising",
    label: LABEL.advertising,
    score: s.result(),
    reasons: s.reasons,
    recommendation: recommend(insights.filter((i) => i.category === "PERFORMANCE" || i.category === "TRACKING")),
    needs: null,
  };
}

function creative(judged: DecisionInput["campaigns"], insights: Insight[], recent: PlatformMetrics, prior: PlatformMetrics): HealthArea {
  const ads = judged.flatMap((c) => c.ads).filter((a) => (a.week?.impressions ?? 0) >= 1000);
  if (ads.length === 0) return empty("creative", "Mairo needs a thousand or so impressions on an ad before judging how it's holding up.");
  const s = new Scorer();
  capped(by(insights, "creative-fatigue"), 15, 30, s);
  capped(by(insights, "pause-ad"), 10, 20, s);
  const single = by(insights, "test-variation");
  if (single.length > 0) capped(single, 8, 16, s);
  else
    for (const c of judged.filter((c) => c.ads.length === 1).slice(0, 2)) s.lose(8, `Only one version of the ad in "${c.name}" — nothing to compare it with`);
  const ctrMove = trend(clickRate(recent), clickRate(prior));
  if (ctrMove !== null && ctrMove <= -0.2) s.lose(10, `Click rate across your ads fell ${Math.round(-ctrMove * 100)}%`);
  s.note(`${ads.length} ad${ads.length === 1 ? "" : "s"} running across ${judged.length} campaign${judged.length === 1 ? "" : "s"}`);
  return { key: "creative", label: LABEL.creative, score: s.result(), reasons: s.reasons, recommendation: recommend(insights.filter((i) => i.category === "CREATIVE")), needs: null };
}

function website(input: DecisionInput, insights: Insight[], ctx: IntelligenceContext, analysis: BrainAnalysis | null): HealthArea {
  const pages = Object.entries(ctx.pages).filter(([, p]) => p.probe);
  const issues = analysis?.conversionIssues ?? [];
  const siteFindings = insights.filter((i) => i.category === "WEBSITE");
  if (pages.length === 0 && !analysis && siteFindings.length === 0) return empty("website", "Run the Business Analyzer on your website, or send a campaign to it, and Mairo can check it.");
  const s = new Scorer();
  for (const [id, p] of pages) {
    const name = input.campaigns.find((c) => c.mairoCampaignId === id)?.name ?? "a campaign";
    const probe = p.probe!;
    if (!probe.ok) s.lose(40, `The page for "${name}" wouldn't open: ${probe.message}`);
    else {
      if (!probe.mobileReady) s.lose(20, `The page for "${name}" isn't built for phones`);
      else s.note(`The page for "${name}" opens and is built for phones`);
      if (p.ms !== null && p.ms > 3000) s.lose(10, `The page for "${name}" took ${(p.ms / 1000).toFixed(1)}s to respond`);
      else if (p.ms !== null && p.ms < 1500) s.note(`The page responds quickly (${(p.ms / 1000).toFixed(1)}s)`);
    }
  }
  let lost = 0;
  for (const issue of issues) {
    const pts = issue.severity === "high" ? 12 : issue.severity === "medium" ? 6 : 2;
    if (lost + pts > 30) s.reasons.push({ text: issue.issue, good: false });
    else {
      s.lose(pts, issue.issue);
      lost += pts;
    }
  }
  for (const i of by(insights, "landing-page", "conversion-drop")) s.lose(15, i.title);
  const rec =
    recommend(insights.filter((i) => i.category === "WEBSITE")) ??
    (issues[0] ? { text: issues[0].fix, actionLabel: "See the full analysis", href: "/dashboard/business", insightKey: null } : null) ??
    (!analysis ? { text: "Let Mairo read your website for what might stop people buying.", actionLabel: "Analyze website", href: "/dashboard/business", insightKey: null } : null);
  return { key: "website", label: LABEL.website, score: s.result(), reasons: s.reasons, recommendation: rec, needs: null };
}

function audience(judged: boolean, insights: Insight[], week: PlatformMetrics): HealthArea {
  const f = frequency(week);
  if (!judged || f === null) return empty("audience", "Mairo needs a week of reach figures to judge how your audience is holding up.");
  const s = new Scorer();
  if (f > 4) s.lose(20, `People saw your ads ${f.toFixed(1)} times each this week — that's a lot of repeats`);
  else if (f > 3) s.lose(10, `People saw your ads ${f.toFixed(1)} times each this week`);
  else s.note(`People saw your ads ${f.toFixed(1)} times each this week — room to keep going`);
  capped(by(insights, "audience-fatigue", "widen-audience"), 15, 30, s);
  for (const i of by(insights, "under-delivering")) s.lose(8, i.title);
  return { key: "audience", label: LABEL.audience, score: s.result(), reasons: s.reasons, recommendation: recommend(insights.filter((i) => i.category === "AUDIENCE")), needs: null };
}

function budget(judged: boolean, insights: Insight[], input: DecisionInput): HealthArea {
  if (!judged) return empty("budget", "Budgets are judged once a campaign has spent enough to compare.");
  const s = new Scorer();
  for (const i of by(insights, "not-spending")) s.lose(15, i.title);
  for (const i of by(insights, "near-target-cpa")) s.lose(i.severity === "URGENT" ? 25 : 12, i.title);
  for (const i of by(insights, "shift-budget")) s.lose(12, `${i.title} — a weaker campaign is getting more than its share`);
  for (const i of by(insights, "scale-winner")) s.lose(8, `${i.title} — a strong campaign could use more`);
  for (const i of by(insights, "under-delivering")) s.lose(10, i.title);
  for (const i of by(insights, "platform-split")) s.lose(5, i.title);
  const daily = input.campaigns.filter((c) => c.status === "ACTIVE").reduce((n, c) => n + c.dailyBudgetCents, 0);
  if (daily > 0) s.note(`${usd(daily)}/day across running campaigns`);
  return { key: "budget", label: LABEL.budget, score: s.result(), reasons: s.reasons, recommendation: recommend(insights.filter((i) => i.category === "BUDGET" || i.category === "PLATFORM")), needs: null };
}

// --- Opportunity Radar -------------------------------------------------------------

const RADAR_LABEL: Record<RadarArea, string> = {
  creative: "Creative",
  budget: "Budget",
  audience: "Audience",
  website: "Website",
  retargeting: "Retargeting",
  platform: "Platform",
};

export function radar(insights: Insight[], judged: boolean): RadarReport {
  const areas = (Object.keys(RADAR_LABEL) as RadarArea[]).map((area) => {
    const found = insights.filter((i) => i.radarArea === area);
    const strong = found.some((i) => (i.severity === "URGENT" || i.severity === "ATTENTION" || i.severity === "OPPORTUNITY") && i.confidence !== "EARLY");
    const level: OpportunityLevel | null = !judged ? null : found.length === 0 ? "LOW" : strong ? "HIGH" : "MEDIUM";
    return { area, label: RADAR_LABEL[area], level, count: found.length };
  });
  const top = insights.filter((i) => i.radarArea).sort(rankInsights);
  // Best first, then the best from a different area, then the rest.
  const first = top[0];
  const second = top.find((i) => first && i.radarArea !== first.radarArea);
  const ordered = [first, second, ...top.filter((i) => i !== first && i !== second)].filter((i): i is Insight => Boolean(i));
  return { areas, top: ordered.map((i) => i.dedupeKey) };
}
