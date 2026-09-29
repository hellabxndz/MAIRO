import type { AdGoal, CampaignAdKind, DecisionConfidence } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { resultsFor } from "@/lib/protection/rules";

// The Weekly Report's judgement, as pure functions over the week's figures.
//
// No database and no network: src/lib/reports/weekly.ts gathers the week from
// the ad networks and Mairo's own records, and everything that decides what
// the report says — the win, what needs attention, what Mairo learned, the
// plan — happens here, where scripts/check-weekly-report.ts can assert it.
//
// The rules are the same as everywhere else in Mairo: compare the account
// with itself, say nothing rather than something weak, and never promise a
// result. A conclusion without enough data behind it is shown as an early
// signal and never saved to Learning Memory.

// --- shapes -----------------------------------------------------------------------

export type Figures = {
  spendCents: number | null;
  revenueCents: number | null;
  purchases: number | null;
  /** Purchases, leads or clicks, whichever the campaigns aim for. */
  results: number | null;
  resultWord: string;
  costPerResultCents: number | null;
  roas: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
  /** Estimated, and null until a margin is known. */
  profitCents: number | null;
};

export type AdWeek = {
  key: string;
  label: string;
  campaignId: string;
  campaignName: string;
  objective: AdGoal;
  kind: CampaignAdKind | null;
  /** When Mairo added it, if Mairo did. ISO. */
  createdAt: string | null;
  current: PlatformMetrics | null;
  previous: PlatformMetrics | null;
};

export type CreativeRef = { label: string; campaignName: string; note: string };

export type Win = {
  label: string;
  campaignName: string;
  revenueCents: number | null;
  costPerResultCents: number;
  roas: number | null;
  results: number;
  why: string[];
  learned: string;
  confidence: DecisionConfidence;
};

export type Learning = {
  key: string;
  category: string;
  statement: string;
  detail: string;
  confidence: DecisionConfidence;
  evidence: { label: string; value: string }[];
  /** Strong enough for Learning Memory. Early signals are shown, never saved. */
  saved: boolean;
};

export type AttentionItem = {
  insightId: string;
  title: string;
  happened: string;
  happenedAdvanced: string;
  metric: string | null;
  before: string | null;
  now: string | null;
  interpretation: string;
  recommendation: string;
  decisionId: string | null;
  action: { label: string; href: string } | null;
  campaignId: string | null;
  severity: string;
};

export type ChangeBy = "you" | "ai-assist" | "autopilot" | "spend-protection";

export type ChangeItem = {
  at: string;
  title: string;
  summary: string;
  reason: string;
  before: string | null;
  after: string | null;
  by: ChangeBy;
};

export type PlatformRow = { name: string; spendCents: number; revenueCents: number | null; results: number; costPerResultCents: number | null; roas: number | null };

export type PlanItem = {
  title: string;
  action: string;
  reason: string;
  priority: "High" | "Medium" | "Low";
  confidence: DecisionConfidence;
  purpose: string;
  decisionId: string | null;
  href: string;
  actionLabel: string;
};

export type HealthSnapshot = { score: number | null; status: string | null; areas: { key: string; label: string; score: number | null }[] };

export type WeeklyReportData = {
  version: 1;
  period: { since: string; until: string; label: string };
  businessName: string;
  resultWord: string;
  glance: { current: Figures; previous: Figures | null; profitKnown: boolean };
  summary: { simple: string; advanced: string; ai: boolean };
  win: Win | null;
  winNote: string | null;
  attention: AttentionItem[];
  changes: ChangeItem[];
  learnings: Learning[];
  platforms: { rows: PlatformRow[]; note: string } | null;
  creatives: { top: CreativeRef | null; emerging: CreativeRef | null; losing: CreativeRef | null; bestFormat: string | null; bestPlacement: string | null; note: string | null };
  budget: { plannedCents: number | null; spentCents: number | null; remainingCents: number | null; utilization: number | null; byPlacement: { name: string; spendCents: number }[]; testingCents: number | null; note: string };
  health: { now: HealthSnapshot | null; before: HealthSnapshot | null; why: string[] };
  plan: PlanItem[];
  campaignsActive: number;
  /** Something the report couldn't read, said plainly. */
  dataNote: string | null;
};

// --- small helpers ----------------------------------------------------------------

export function usd(cents: number | null, whole = false): string {
  if (cents === null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: whole || Math.abs(cents) >= 100_000 ? 0 : 2 });
}

function pct(n: number): string {
  return `${Math.round(Math.abs(n) * 100)}%`;
}

export function change(now: number | null, before: number | null | undefined): number | null {
  if (now === null || before === null || before === undefined || before === 0) return null;
  return now / before - 1;
}

function results(ad: AdWeek, which: "current" | "previous"): number {
  return resultsFor(ad.objective, ad[which]) ?? 0;
}

function cpa(spend: number | null | undefined, res: number): number | null {
  return spend && res > 0 ? Math.round(spend / res) : null;
}

function ctr(m: PlatformMetrics | null): number | null {
  return m?.impressions && m.clicks !== null ? m.clicks / m.impressions : null;
}

export function confidenceOf(res: number, spendCents: number): DecisionConfidence {
  if (res >= 20 && spendCents >= 10_000) return "HIGH";
  if (res >= 8 || spendCents >= 5_000) return "MEDIUM";
  return "EARLY";
}

// --- the week's win --------------------------------------------------------------

/** The ad that did most with least: at least three results and a cost per result below the account's. */
export function pickWin(ads: AdWeek[], account: Figures): { win: Win | null; note: string | null } {
  const word = account.resultWord;
  const candidates = ads
    .map((a) => ({ a, res: results(a, "current"), spend: a.current?.spendCents ?? 0 }))
    .filter((x) => x.res >= 3 && x.spend > 0)
    .map((x) => ({ ...x, cpa: Math.round(x.spend / x.res) }));
  if (candidates.length === 0) {
    return { win: null, note: `Mairo does not have enough ${word} data yet to determine your strongest creative.` };
  }
  const best = [...candidates].sort((x, y) => x.cpa - y.cpa)[0];
  const accountCpa = account.costPerResultCents;
  if (candidates.length > 1 && accountCpa !== null && best.cpa >= accountCpa) {
    return { win: null, note: "No single ad clearly out-performed the rest this week." };
  }

  const why: string[] = [];
  const adCtr = ctr(best.a.current);
  if (adCtr !== null && account.ctr !== null && adCtr >= account.ctr * 1.1) why.push(`Better click rate: ${(adCtr * 100).toFixed(2)}% against ${(account.ctr * 100).toFixed(2)}% across your ads`);
  if (accountCpa !== null && best.cpa < accountCpa * 0.95) why.push(`Lower cost per ${word}: ${usd(best.cpa)} against ${usd(accountCpa)} on average`);
  const clicks = best.a.current?.clicks ?? 0;
  const accountConv = account.clicks && account.results !== null ? account.results / account.clicks : null;
  if (clicks > 0 && accountConv !== null && best.res / clicks >= accountConv * 1.1) {
    why.push(`More people ${word === "purchase" ? "bought" : "converted"} after clicking: ${((best.res / clicks) * 100).toFixed(1)}% against ${(accountConv * 100).toFixed(1)}%`);
  }
  if (best.a.kind === "VIDEO") why.push("A video ad");
  const confidence = confidenceOf(best.res, best.spend);
  const format = best.a.kind === "VIDEO" ? "video ad" : best.a.kind === "IMAGE" ? "image ad" : "ad";
  const saving = accountCpa ? 1 - best.cpa / accountCpa : null;
  return {
    win: {
      label: best.a.label,
      campaignName: best.a.campaignName,
      revenueCents: best.a.current?.revenueCents ?? null,
      costPerResultCents: best.cpa,
      roas: best.a.current?.revenueCents && best.spend ? best.a.current.revenueCents / best.spend : null,
      results: best.res,
      why: why.length ? why : [`The most ${word}s for the money this week`],
      learned:
        saving !== null && saving > 0.05
          ? `The ${format} ${best.a.label} in "${best.a.campaignName}" brought ${word}s for ${pct(saving)} less than your average — its approach is worth reusing in new versions.`
          : `${best.a.label} in "${best.a.campaignName}" was your most efficient ${format} this week.`,
      confidence,
    },
    note: null,
  };
}

// --- what Mairo learned -----------------------------------------------------------

function compare(
  key: string,
  category: string,
  a: { name: string; spend: number; res: number },
  b: { name: string; spend: number; res: number },
  word: string,
  statement: (better: string, worse: string) => string,
): Learning | null {
  if (a.res < 3 || b.res < 3) return null;
  const ca = Math.round(a.spend / a.res);
  const cb = Math.round(b.spend / b.res);
  const [better, worse, cBetter, cWorse] = ca <= cb ? [a, b, ca, cb] : [b, a, cb, ca];
  const gap = 1 - cBetter / cWorse;
  if (gap < 0.25) return null;
  const both = Math.min(a.res, b.res);
  const confidence: DecisionConfidence = both >= 10 && a.res + b.res >= 30 ? "HIGH" : both >= 5 ? "MEDIUM" : "EARLY";
  return {
    key: `${key}:${better.name.toLowerCase()}`,
    category,
    statement: statement(better.name, worse.name),
    detail: `${better.name}: ${usd(cBetter)} per ${word} from ${better.res}. ${worse.name}: ${usd(cWorse)} per ${word} from ${worse.res}. ${pct(gap)} lower cost.`,
    confidence,
    evidence: [
      { label: `${better.name} cost per ${word}`, value: usd(cBetter) },
      { label: `${worse.name} cost per ${word}`, value: usd(cWorse) },
    ],
    saved: confidence !== "EARLY",
  };
}

export function learnings(ads: AdWeek[], platforms: PlatformRow[], win: Win | null, word: string): Learning[] {
  const out: Learning[] = [];
  const byKind = (kind: CampaignAdKind) =>
    ads.filter((a) => a.kind === kind).reduce((n, a) => ({ spend: n.spend + (a.current?.spendCents ?? 0), res: n.res + results(a, "current") }), { spend: 0, res: 0 });
  const video = byKind("VIDEO");
  const image = byKind("IMAGE");
  const format = compare("format", "creative", { name: "Video ads", ...video }, { name: "Image ads", ...image }, word, (b, w) => `${b} are getting ${word}s for less than ${w.toLowerCase()} on this account.`);
  if (format) out.push(format);

  const fb = platforms.find((p) => p.name === "Facebook");
  const ig = platforms.find((p) => p.name === "Instagram");
  if (fb && ig) {
    const place = compare("placement", "platform", { name: "Instagram", spend: ig.spendCents, res: ig.results }, { name: "Facebook", spend: fb.spendCents, res: fb.results }, word, (b, w) => `${b} is bringing ${word}s at a lower cost than ${w} for this business.`);
    if (place) out.push(place);
  }

  if (win && win.confidence !== "EARLY") {
    out.push({
      key: `winner:${win.campaignName}:${win.label}`.toLowerCase(),
      category: "creative",
      statement: win.learned,
      detail: `${win.results} ${word}s at ${usd(win.costPerResultCents)} each.`,
      confidence: win.confidence,
      evidence: [
        { label: `Cost per ${word}`, value: usd(win.costPerResultCents) },
        { label: `${word[0].toUpperCase()}${word.slice(1)}s`, value: String(win.results) },
      ],
      saved: true,
    });
  }
  return out;
}

// --- creatives ---------------------------------------------------------------------

export function creativeSummary(ads: AdWeek[], win: Win | null, learned: Learning[], since: string): WeeklyReportData["creatives"] {
  const withRes = ads.map((a) => ({ a, res: results(a, "current"), c: cpa(a.current?.spendCents, results(a, "current")) }));
  const top = win ? { label: win.label, campaignName: win.campaignName, note: `${usd(win.costPerResultCents)} per result` } : null;

  const avg = (() => {
    const spend = withRes.reduce((n, x) => n + (x.a.current?.spendCents ?? 0), 0);
    const res = withRes.reduce((n, x) => n + x.res, 0);
    return cpa(spend, res);
  })();
  const recent = new Date(new Date(`${since}T00:00:00Z`).getTime() - 7 * 86_400_000);
  const emerging = withRes
    .filter((x) => x.a.createdAt && new Date(x.a.createdAt) >= recent && x.res >= 1 && x.c !== null && (avg === null || x.c <= avg * 1.1))
    .filter((x) => !win || x.a.label !== win.label || x.a.campaignName !== win.campaignName)
    .sort((x, y) => (x.c ?? 0) - (y.c ?? 0))[0];

  const losing = ads
    .map((a) => ({ a, now: ctr(a.current), before: ctr(a.previous) }))
    .filter((x) => x.now !== null && x.before !== null && x.before > 0 && (x.a.current?.impressions ?? 0) >= 1000 && (x.a.previous?.impressions ?? 0) >= 1000)
    .map((x) => ({ ...x, drop: 1 - x.now! / x.before! }))
    .filter((x) => x.drop >= 0.2)
    .sort((x, y) => y.drop - x.drop)[0];

  const format = learned.find((l) => l.key.startsWith("format:"));
  const placement = learned.find((l) => l.key.startsWith("placement:"));
  return {
    top,
    emerging: emerging ? { label: emerging.a.label, campaignName: emerging.a.campaignName, note: `New this week, ${usd(emerging.c)} per result` } : null,
    losing: losing
      ? { label: losing.a.label, campaignName: losing.a.campaignName, note: `Click rate ${((losing.before ?? 0) * 100).toFixed(2)}% → ${((losing.now ?? 0) * 100).toFixed(2)}%` }
      : null,
    bestFormat: format ? format.statement.split(" are ")[0] : null,
    bestPlacement: placement ? placement.statement.split(" is ")[0] : null,
    note: ads.length === 0 ? "No ad-level figures were available this week." : null,
  };
}

// --- platforms ----------------------------------------------------------------------

export function platformNote(rows: PlatformRow[], word: string): string {
  const withCpa = rows.filter((r) => r.costPerResultCents !== null && r.results >= 3);
  if (withCpa.length < 2) return rows.length ? `Not enough ${word}s on each app to compare them fairly yet.` : "";
  const [cheap, dear] = [...withCpa].sort((a, b) => a.costPerResultCents! - b.costPerResultCents!);
  const gap = 1 - cheap.costPerResultCents! / dear.costPerResultCents!;
  if (gap < 0.15) return `${cheap.name} and ${dear.name} performed about the same this week.`;
  if (cheap.results >= dear.results) return `${cheap.name} was more efficient this week and also brought more ${word}s.`;
  return `${cheap.name} was more efficient this week, while ${dear.name} still brought more total ${word}s — both are doing a job.`;
}

// --- budget --------------------------------------------------------------------------

export function budgetNote(planned: number | null, spent: number | null, budgetChanges: number, testingShare: number | null): string {
  const parts: string[] = [];
  if (planned && spent !== null) {
    const u = spent / planned;
    parts.push(
      u < 0.7
        ? `Meta spent ${pct(u)} of the week's budget — usually a sign the audience is narrow or results are rare.`
        : u > 1.05
          ? `Spend ran ${pct(u - 1)} over the daily budgets on some days, which Meta allows; weekly totals even out.`
          : `Spend tracked the budget closely (${pct(u)}).`,
    );
  }
  if (budgetChanges > 0) parts.push(`Mairo made ${budgetChanges} budget change${budgetChanges === 1 ? "" : "s"}, moving money toward what was working.`);
  if (testingShare !== null && testingShare > 0) parts.push(`${pct(testingShare)} of spend went to campaigns testing more than one version of an ad.`);
  return parts.join(" ") || "No budget changes this week.";
}

// --- next week ------------------------------------------------------------------------

const PURPOSE: Record<string, string> = {
  PERFORMANCE: "Bring your cost per result back down",
  CREATIVE: "Keep your ads fresh and working",
  AUDIENCE: "Reach more of the right people",
  BUDGET: "Put your budget where it works best",
  WEBSITE: "Turn more clicks into customers",
  TRACKING: "Make sure every sale is measured",
  PLATFORM: "Spend where results cost less",
};

export type PlanInsight = {
  title: string;
  happened: string;
  recommendation: string;
  severity: string;
  confidence: DecisionConfidence;
  category: string;
  decisionId: string | null;
  action: { label: string; href: string } | null;
};

export function nextWeekPlan(insights: PlanInsight[]): PlanItem[] {
  const rank = { URGENT: 0, ATTENTION: 1, OPPORTUNITY: 2, INFO: 3 } as Record<string, number>;
  return insights
    .filter((i) => i.severity !== "INFO")
    .sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3))
    .slice(0, 5)
    .map((i) => ({
      title: i.title,
      action: i.recommendation,
      reason: i.happened,
      priority: i.severity === "URGENT" || i.severity === "ATTENTION" ? "High" : i.confidence === "HIGH" ? "Medium" : "Low",
      confidence: i.confidence,
      purpose: PURPOSE[i.category] ?? "Improve how your advertising performs",
      decisionId: i.decisionId,
      href: i.decisionId ? "/dashboard/decisions" : (i.action?.href ?? "/dashboard/decisions"),
      actionLabel: i.decisionId ? "Review decision" : (i.action?.label ?? "Take a look"),
    }));
}

// --- health change ----------------------------------------------------------------------

export function healthWhy(now: HealthSnapshot | null, before: HealthSnapshot | null): string[] {
  if (!now || !before) return [];
  const out: string[] = [];
  for (const a of now.areas) {
    const b = before.areas.find((x) => x.key === a.key);
    if (!b || a.score === null || b.score === null) continue;
    const d = a.score - b.score;
    if (d >= 3) out.push(`${a.label} improved by ${d}`);
    else if (d <= -3) out.push(`${a.label} fell by ${-d}`);
  }
  return out;
}

// --- the summary, without AI ----------------------------------------------------------------

/**
 * The summary in plain words from the figures alone. Used when the AI isn't
 * available, and as the facts the AI is given — it can reword these, never
 * add to them.
 */
export function plainSummary(d: Pick<WeeklyReportData, "glance" | "win" | "attention" | "changes" | "resultWord">, advanced: boolean): string {
  const c = d.glance.current;
  const p = d.glance.previous;
  const word = d.resultWord;
  if (!c.spendCents) return "Nothing was spent on ads this week, so there's nothing to report yet.";
  const rev = change(c.revenueCents, p?.revenueCents);
  const cost = change(c.costPerResultCents, p?.costPerResultCents);
  const s: string[] = [];
  const better = (rev ?? 0) > 0.05 || (cost ?? 0) < -0.05;
  const worse = (rev ?? 0) < -0.05 || (cost ?? 0) > 0.05;
  s.push(!p ? "This is your first week with a full report." : better && !worse ? "This was a stronger week for your campaigns." : worse && !better ? "This was a tougher week for your campaigns." : "This was a mixed week for your campaigns.");
  const bits: string[] = [];
  if (rev !== null) bits.push(`revenue ${rev >= 0 ? "rose" : "fell"} ${pct(rev)}`);
  if (cost !== null) bits.push(`cost per ${word} ${cost <= 0 ? "fell" : "rose"} ${pct(cost)}`);
  if (bits.length) s.push(`${bits.join(" while ")[0].toUpperCase()}${bits.join(" while ").slice(1)}${advanced && c.revenueCents !== null ? ` (${usd(c.revenueCents, true)} in tracked sales on ${usd(c.spendCents, true)} spent, ${c.roas?.toFixed(1) ?? "—"}x ROAS)` : ""}.`);
  else s.push(`You spent ${usd(c.spendCents, true)}${c.results !== null ? ` and got ${c.results} ${word}${c.results === 1 ? "" : "s"}` : ""}.`);
  if (d.win) s.push(`${d.win.label} in "${d.win.campaignName}" was your strongest ad${advanced ? ` at ${usd(d.win.costPerResultCents)} per ${word}` : ""}.`);
  if (d.attention[0]) s.push(`Mairo also spotted something worth a look: ${d.attention[0].title.charAt(0).toLowerCase()}${d.attention[0].title.slice(1)}.`);
  if (d.changes.length) s.push(`Mairo made ${d.changes.length} change${d.changes.length === 1 ? "" : "s"} during the week.`);
  return s.slice(0, 5).join(" ");
}
