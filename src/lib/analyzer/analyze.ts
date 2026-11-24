import type { AdGoal } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { resultsFor, resultWord } from "@/lib/protection/rules";

// The Meta Ads Analyzer: what an experienced ads manager would tell a business
// owner after reading their account — what's working, what could be better,
// and what to do — from Meta's own figures for every campaign on the account
// (MAIRO's and the ones made before MAIRO), over several periods.
//
// Pure and deterministic. Every number is arithmetic on what Meta reported;
// no model writes a figure. A figure Meta didn't report stays null and is
// said to be missing. Comparisons are made against the account's own
// average, never against an invented industry benchmark, and each finding
// carries its evidence, a confidence level from how much data it rests on,
// and what could make it wrong (attribution, objective, low volume).

export type WindowKey = "d7" | "d30" | "prev30" | "d90" | "d180";
export const WINDOWS: { key: WindowKey; label: string; days: number }[] = [
  { key: "d7", label: "Last 7 days", days: 7 },
  { key: "d30", label: "Last 30 days", days: 30 },
  { key: "prev30", label: "The 30 days before", days: 30 },
  { key: "d90", label: "Last 90 days", days: 90 },
  { key: "d180", label: "Last 180 days", days: 180 },
];

export type AnalyzerCampaign = {
  id: string;
  name: string;
  goal: AdGoal;
  running: boolean;
  /** Built by MAIRO (managed) or already on the account. */
  managed: boolean;
  windows: Partial<Record<WindowKey, PlatformMetrics | null>>;
};

export type AnalyzerInput = {
  now: Date;
  campaigns: AnalyzerCampaign[];
  /** The business sells online, so purchases (and their value) are what count. */
  sellsOnline: boolean;
};

export type Confidence = "high" | "medium" | "low";
export type Finding = {
  key: string;
  title: string;
  detail: string;
  evidence: [string, string][];
  confidence: Confidence;
  limitation: string | null;
  campaignId?: string;
};
export type Action = "build" | "fix" | "creatives" | "budget" | "tracking" | "explain";
export type Recommendation = {
  key: string;
  title: string;
  why: string;
  expected: string;
  confidence: Confidence;
  action: Action;
  campaignId?: string;
};
export type WindowSummary = { key: WindowKey; label: string; spendCents: number | null; results: number | null; resultWord: string; costPerResultCents: number | null; revenueCents: number | null; roas: number | null };
export type CampaignLine = { id: string; name: string; goal: AdGoal; running: boolean; managed: boolean; spendCents: number | null; results: number | null; costPerResultCents: number | null; roas: number | null; ctr: number | null; frequency: number | null; verdict: "efficient" | "average" | "expensive" | "no-results" | "too-little-data" };

export type Analysis =
  | { state: "no-history"; headline: string }
  | {
      state: "ready";
      headline: string;
      basis: { campaigns: number; spendCents: number; window: WindowKey; managed: number; existing: number };
      windows: WindowSummary[];
      campaigns: CampaignLine[];
      doingWell: Finding[];
      improve: Finding[];
      recommendations: Recommendation[];
      limitations: string[];
    };

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents >= 100_000 ? 0 : 2, minimumFractionDigits: cents >= 100_000 ? 0 : 2 })}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** How sure a finding can be, from the results and money it rests on. */
export function confidenceOf(results: number, spendCents: number): Confidence {
  if (results >= 30 && spendCents >= 30_000) return "high";
  if (results >= 10 || spendCents >= 10_000) return "medium";
  return "low";
}

/** The family a goal is judged in: sales and leads are never compared with each other. */
function family(goal: AdGoal): "sales" | "leads" | "traffic" | "other" {
  return goal === "SALES" ? "sales" : goal === "LEADS" ? "leads" : goal === "TRAFFIC" ? "traffic" : "other";
}

function sum(list: (PlatformMetrics | null | undefined)[], k: keyof PlatformMetrics): number | null {
  let seen = false;
  let total = 0;
  for (const m of list) {
    const v = m?.[k];
    if (typeof v === "number") {
      seen = true;
      total += v;
    }
  }
  return seen ? total : null;
}

function windowSummary(c: AnalyzerCampaign[], key: WindowKey, label: string, fam: ReturnType<typeof family>): WindowSummary {
  const ms = c.filter((x) => family(x.goal) === fam).map((x) => x.windows[key] ?? null);
  const goal: AdGoal = fam === "sales" ? "SALES" : fam === "leads" ? "LEADS" : fam === "traffic" ? "TRAFFIC" : "AWARENESS";
  const spend = sum(ms, "spendCents");
  const results = ms.some((m) => m) ? ms.reduce((n, m) => n + (resultsFor(goal, m) ?? 0), 0) : null;
  const revenue = sum(ms, "revenueCents");
  return {
    key,
    label,
    spendCents: spend,
    results,
    resultWord: resultWord(goal),
    costPerResultCents: spend !== null && results ? Math.round(spend / results) : null,
    revenueCents: revenue && revenue > 0 ? revenue : null,
    roas: revenue && revenue > 0 && spend ? revenue / spend : null,
  };
}

export function analyzeAccount(input: AnalyzerInput): Analysis {
  const all = input.campaigns;
  const spent180 = all.reduce((n, c) => n + (c.windows.d180?.spendCents ?? 0), 0);
  if (all.length === 0 || spent180 === 0) {
    return { state: "no-history", headline: "There's no advertising history on this Meta account in the last 180 days, so there's nothing to analyze yet. MAIRO will build your first campaign from your plan instead." };
  }
  // Judge on 90 days where there's spend in it — long enough to be fair to
  // campaigns that ran a while ago, short enough to still be relevant.
  const spent90 = all.reduce((n, c) => n + (c.windows.d90?.spendCents ?? 0), 0);
  const W: WindowKey = spent90 > 0 ? "d90" : "d180";
  const wLabel = W === "d90" ? "the last 90 days" : "the last 180 days";

  // The main family is the one with the most money behind it.
  const famSpend = new Map<string, number>();
  for (const c of all) famSpend.set(family(c.goal), (famSpend.get(family(c.goal)) ?? 0) + (c.windows[W]?.spendCents ?? 0));
  const main = ([...famSpend.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "sales") as ReturnType<typeof family>;
  const windows = WINDOWS.map((w) => windowSummary(all, w.key, w.label, main));
  const acct = windows.find((x) => x.key === W)!;
  const word = acct.resultWord;

  // Each campaign over the judging window, against the account's own average for its family.
  const avgCpr = new Map<string, number | null>();
  for (const fam of new Set(all.map((c) => family(c.goal)))) {
    const s = windowSummary(all, W, "", fam as ReturnType<typeof family>);
    avgCpr.set(fam, s.costPerResultCents);
  }
  const lines: CampaignLine[] = all
    .map((c) => {
      const m = c.windows[W] ?? null;
      const r = resultsFor(c.goal, m);
      const spend = m?.spendCents ?? null;
      const cpr = spend !== null && r ? Math.round(spend / r) : null;
      const avg = avgCpr.get(family(c.goal)) ?? null;
      const freq = m?.impressions && m.reach ? m.impressions / m.reach : null;
      const verdict: CampaignLine["verdict"] =
        !spend || spend < 2_000 ? "too-little-data" : !r ? "no-results" : (r ?? 0) < 5 || avg === null ? "too-little-data" : cpr! <= avg * 0.8 ? "efficient" : cpr! >= avg * 1.5 ? "expensive" : "average";
      return { id: c.id, name: c.name, goal: c.goal, running: c.running, managed: c.managed, spendCents: spend, results: r, costPerResultCents: cpr, roas: m?.roas ?? (m?.revenueCents && spend ? m.revenueCents / spend : null), ctr: m?.ctr ?? (m?.clicks && m.impressions ? m.clicks / m.impressions : null), frequency: freq, verdict };
    })
    .filter((l) => (l.spendCents ?? 0) > 0)
    .sort((a, b) => (b.spendCents ?? 0) - (a.spendCents ?? 0));

  const doingWell: Finding[] = [];
  const improve: Finding[] = [];
  const recs: Recommendation[] = [];
  const limitations: string[] = [
    "Results are what Meta attributed to the ads (its default attribution window). Sales or calls that happened without Meta seeing them aren't counted.",
    "Campaigns are compared with your own account's average, not with other businesses.",
  ];

  // --- What's working: the efficient campaigns, with enough results to mean it.
  for (const l of lines.filter((x) => x.verdict === "efficient").slice(0, 3)) {
    const avg = avgCpr.get(family(l.goal))!;
    const w = resultWord(l.goal);
    doingWell.push({
      key: `efficient:${l.id}`,
      campaignId: l.id,
      title: `“${l.name}” gets ${w}s for less than your average`,
      detail: `${plural(l.results!, w)} at ${usd(l.costPerResultCents!)} each over ${wLabel}, against ${usd(avg)} across your account.${l.roas ? ` Return on ad spend ${l.roas.toFixed(2)}×.` : ""}`,
      evidence: [["Spent", usd(l.spendCents!)], [`${w[0].toUpperCase()}${w.slice(1)}s`, String(l.results)], [`Cost per ${w}`, usd(l.costPerResultCents!)], ["Account average", usd(avg)]],
      confidence: confidenceOf(l.results!, l.spendCents!),
      limitation: l.results! < 10 ? `Based on fewer than 10 ${w}s — it could be early luck.` : null,
    });
    // Preserve what works; grow it carefully only while it's running and not over-shown.
    if (l.running && (l.frequency ?? 0) < 2.5 && l.results! >= 10) {
      recs.push({
        key: `scale:${l.id}`,
        campaignId: l.id,
        title: `Keep “${l.name}” running, and grow its budget gradually`,
        why: `It's your most efficient campaign and people have seen it ${l.frequency ? `about ${l.frequency.toFixed(1)} times each` : "only a few times"}, so there's room to reach more of them.`,
        expected: "Raising a budget usually raises the cost per result a little; steps of up to 20% at a time keep that small. MAIRO would ask before each change.",
        confidence: confidenceOf(l.results!, l.spendCents!),
        action: "budget",
      });
    }
  }

  // --- Trend: the last 30 days against the 30 before, on enough results each side.
  const d30 = windows.find((x) => x.key === "d30")!;
  const p30 = windows.find((x) => x.key === "prev30")!;
  if (d30.costPerResultCents && p30.costPerResultCents && (d30.results ?? 0) >= 10 && (p30.results ?? 0) >= 10) {
    const change = d30.costPerResultCents / p30.costPerResultCents - 1;
    const ev: [string, string][] = [[`Last 30 days, per ${word}`, usd(d30.costPerResultCents)], [`30 days before, per ${word}`, usd(p30.costPerResultCents)]];
    if (change <= -0.15) doingWell.push({ key: "trend", title: `Your cost per ${word} fell ${pct(-change)} this month`, detail: `${usd(d30.costPerResultCents)} in the last 30 days, down from ${usd(p30.costPerResultCents)} the 30 days before.`, evidence: ev, confidence: confidenceOf(Math.min(d30.results!, p30.results!), d30.spendCents ?? 0), limitation: "Seasonality or a sale can move this on its own." });
    if (change >= 0.2) improve.push({ key: "trend", title: `Your cost per ${word} rose ${pct(change)} this month`, detail: `${usd(d30.costPerResultCents)} in the last 30 days, up from ${usd(p30.costPerResultCents)} the 30 days before.`, evidence: ev, confidence: confidenceOf(Math.min(d30.results!, p30.results!), d30.spendCents ?? 0), limitation: "Seasonality, competition or a recent change to the campaigns can all do this." });
  }

  // --- Possible wasted spend: real money and no results for the campaign's goal.
  for (const l of lines.filter((x) => x.verdict === "no-results")) {
    const avg = avgCpr.get(family(l.goal)) ?? null;
    const floor = Math.max(5_000, avg ? avg * 2 : 0);
    if ((l.spendCents ?? 0) < floor || family(l.goal) === "other" || family(l.goal) === "traffic") continue;
    const w = resultWord(l.goal);
    improve.push({
      key: `waste:${l.id}`,
      campaignId: l.id,
      title: `“${l.name}” spent ${usd(l.spendCents!)} without a ${w}`,
      detail: `No ${w}s reported over ${wLabel}${avg ? `, while your account averages ${usd(avg)} per ${w}` : ""}.`,
      evidence: [["Spent", usd(l.spendCents!)], [`${w[0].toUpperCase()}${w.slice(1)}s`, "0"], ...(avg ? ([["Account average", usd(avg)]] as [string, string][]) : [])],
      confidence: avg && l.spendCents! >= avg * 3 ? "high" : "medium",
      limitation: input.sellsOnline && l.goal === "SALES" ? "If purchase tracking wasn't working, sales may have happened without Meta counting them." : "If this campaign was meant for awareness, or its results are counted outside Meta, this may not be waste.",
    });
    recs.push({
      key: `fix:${l.id}`,
      campaignId: l.id,
      title: l.running ? `Pause “${l.name}”, or rebuild it` : `Don't restart “${l.name}” as it was`,
      why: `It spent ${usd(l.spendCents!)} without a ${w}.`,
      expected: `The money could go to what's working instead. MAIRO can build a replacement from what your efficient campaigns have in common — you approve it before anything spends.`,
      confidence: avg && l.spendCents! >= avg * 3 ? "high" : "medium",
      action: "fix",
    });
  }

  // --- Expensive campaigns: results, but at well over the account's average.
  for (const l of lines.filter((x) => x.verdict === "expensive").slice(0, 3)) {
    const avg = avgCpr.get(family(l.goal))!;
    const w = resultWord(l.goal);
    improve.push({
      key: `expensive:${l.id}`,
      campaignId: l.id,
      title: `“${l.name}” pays ${pct(l.costPerResultCents! / avg - 1)} more per ${w} than your average`,
      detail: `${usd(l.costPerResultCents!)} per ${w} over ${wLabel}, against ${usd(avg)} across your account.`,
      evidence: [["Spent", usd(l.spendCents!)], [`${w[0].toUpperCase()}${w.slice(1)}s`, String(l.results)], [`Cost per ${w}`, usd(l.costPerResultCents!)], ["Account average", usd(avg)]],
      confidence: confidenceOf(l.results!, l.spendCents!),
      limitation: "A campaign reaching new people often costs more per result than one reaching people who already know you — that can be worth it.",
    });
  }

  // --- Creative fatigue: shown too often, and fewer people clicking than a month ago.
  for (const c of all.filter((x) => x.running)) {
    const now = c.windows.d30 ?? null;
    const before = c.windows.prev30 ?? null;
    const freq = now?.impressions && now.reach ? now.impressions / now.reach : null;
    const ctrNow = now?.clicks && now.impressions ? now.clicks / now.impressions : null;
    const ctrBefore = before?.clicks && before.impressions ? before.clicks / before.impressions : null;
    if (!freq || freq < 3.5 || !ctrNow || !ctrBefore || (now?.impressions ?? 0) < 5_000) continue;
    const drop = 1 - ctrNow / ctrBefore;
    if (drop < 0.25) continue;
    improve.push({
      key: `fatigue:${c.id}`,
      campaignId: c.id,
      title: `“${c.name}”'s ads may be wearing out`,
      detail: `People saw them about ${freq.toFixed(1)} times each in the last 30 days, and ${pct(drop)} fewer of them clicked than the month before.`,
      evidence: [["Times seen per person (30 days)", freq.toFixed(1)], ["Click rate now", pct(ctrNow)], ["Click rate before", pct(ctrBefore)]],
      confidence: (now?.impressions ?? 0) >= 20_000 ? "high" : "medium",
      limitation: "A smaller audience or a seasonal dip can also lower the click rate.",
    });
    recs.push({ key: `creatives:${c.id}`, campaignId: c.id, title: `Refresh the ads in “${c.name}”`, why: "The same people are seeing the same ads, and fewer are clicking.", expected: "New versions usually restore the click rate; MAIRO makes them from your best-performing ad, and you approve each one.", confidence: "medium", action: "creatives" });
  }

  // --- Tracking quality: a shop's purchase campaigns that aren't counting purchases or their value.
  if (input.sellsOnline) {
    const sales = all.filter((c) => c.goal === "SALES").map((c) => c.windows[W] ?? null).filter((m): m is PlatformMetrics => Boolean(m && (m.spendCents ?? 0) > 0));
    const clicks = sales.reduce((n, m) => n + (m.clicks ?? 0), 0);
    const purchases = sales.reduce((n, m) => n + (m.purchases ?? 0), 0);
    const revenue = sales.reduce((n, m) => n + (m.revenueCents ?? 0), 0);
    if (sales.length && clicks >= 300 && purchases === 0) {
      improve.push({ key: "tracking:none", title: "Your sales campaigns aren't recording any purchases", detail: `${clicks.toLocaleString("en-US")} clicks over ${wLabel} and no purchases reported. That's more often missing tracking than no sales at all.`, evidence: [["Clicks", clicks.toLocaleString("en-US")], ["Purchases reported", "0"]], confidence: "medium", limitation: "If the shop genuinely had no online sales from these visitors, tracking isn't the problem." });
      recs.push({ key: "tracking", title: "Check purchase tracking before spending more on sales campaigns", why: "Without purchases reaching Meta, it can't find buyers and MAIRO can't measure return on ad spend.", expected: "Once Meta receives purchases, campaigns can optimize for them and results can be measured.", confidence: "medium", action: "tracking" });
    } else if (purchases >= 5 && revenue === 0) {
      improve.push({ key: "tracking:value", title: "Purchases reach Meta without their order value", detail: `${plural(purchases, "purchase")} reported over ${wLabel}, but no revenue — so return on ad spend can't be measured.`, evidence: [["Purchases", String(purchases)], ["Revenue reported", "none"]], confidence: "high", limitation: null });
      recs.push({ key: "tracking", title: "Add the order value and currency to your purchase event", why: "Meta can't tell a $10 order from a $500 one, and neither can your reports.", expected: "Revenue and return on ad spend become measurable, and Meta can favour bigger orders.", confidence: "high", action: "tracking" });
    }
  }

  // --- Always: what MAIRO would build, and the door to ask about any of it.
  recs.push({
    key: "build",
    title: "Let MAIRO build your next campaign from what's working",
    why: doingWell.length ? "It starts from your most efficient campaigns' goal and audience, with new creatives to test." : "It starts from your goal and budget, with three different creative ideas to test.",
    expected: "A campaign built in your account, switched off, for you to review and approve. Nothing spends until you do.",
    confidence: doingWell.length ? "medium" : "low",
    action: "build",
  });
  if (lines.length < 3 || (acct.results ?? 0) < 10) limitations.push(`There's only ${acct.results ? plural(acct.results, word) : `no ${word}`} on the account over ${wLabel}, so conclusions are early.`);

  const opportunities = improve.length + recs.filter((r) => r.action === "budget").length;
  const managed = all.filter((c) => c.managed && (c.windows[W]?.spendCents ?? 0) > 0).length;
  const headline = `I analyzed ${plural(lines.length, "campaign")} with ${usd(acct.spendCents ?? 0)} of spend over ${wLabel}${acct.results ? ` — ${plural(acct.results, word)} at ${usd(acct.costPerResultCents ?? 0)} each` : ""}. ${opportunities === 0 ? "Nothing stands out as wasted, and here's what I'd do next." : `I found ${plural(opportunities, "opportunity")} to make your budget work harder. Here's what I found and what I recommend.`}`.replace("1 opportunitys", "1 opportunity").replace(/(\d+) opportunitys/, "$1 opportunities");

  return {
    state: "ready",
    headline,
    basis: { campaigns: lines.length, spendCents: acct.spendCents ?? 0, window: W, managed, existing: lines.length - managed },
    windows,
    campaigns: lines,
    doingWell,
    improve,
    recommendations: recs.slice(0, 6),
    limitations,
  };
}
