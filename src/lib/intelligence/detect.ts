import type { AdPlatform, InsightSeverity, PixelStatus } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import type { LandingProbe } from "@/lib/campaigns/landing-probe";
import { clickRate, confidenceFrom, costPerResult, frequency, pastLearning, weekKey } from "@/lib/decisions/rules";
import type { CampaignSnapshot, DecisionDraft, DecisionInput, Evidence } from "@/lib/decisions/types";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";
import type { ActionType, BasedOn, Insight, RadarArea } from "./types";

// Everything MAIRO notices, as Insights.
//
// Two sources, one output. The MAIRO Decisions rules (src/lib/decisions/rules)
// already find the things MAIRO can change; each of their findings becomes an
// Insight linked to its decision. The detectors below add what those rules
// don't cover — mostly early warnings, where the right move is to look before
// anything changes.
//
// Pure, like the rules: figures in, findings out, asserted in
// scripts/check-intelligence.ts. The same restraint applies — nothing is
// judged during a campaign's learning days, every comparison is the account
// against itself, and a finding without the data to back it is not made.

export type IntelligenceContext = {
  /** Tracking pixels and whether their network has seen events. */
  pixels: { status: PixelStatus }[];
  /** Last 7 days split by where the ads showed ("facebook", "instagram"…). */
  publishers: { publisher: string; metrics: PlatformMetrics }[] | null;
  /** Each running website campaign's page, opened as a phone would, with how long it took. */
  pages: Record<string, { probe: LandingProbe | null; ms: number | null }>;
};

const PUBLISHER: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", audience_network: "Audience Network", messenger: "Messenger" };

function pct(n: number): string {
  return `${Math.round(Math.abs(n) * 100)}%`;
}

/** Per-day rate, so 3 days and 4 days compare fairly. */
function perDay(value: number | null | undefined, days: number): number | null {
  return value === null || value === undefined ? null : value / days;
}

function basedOnWeek(c: CampaignSnapshot): BasedOn {
  return {
    days: 7,
    impressions: c.week?.impressions ?? null,
    clicks: c.week?.clicks ?? null,
    results: resultsFor(c.objective, c.week),
    resultWord: resultWord(c.objective),
  };
}

// --- from the decision rules ---------------------------------------------------

const FROM_DECISION: Record<string, { actionType: ActionType | null; radar: RadarArea | null; early: boolean; severity: (d: DecisionDraft) => InsightSeverity }> = {
  "not-spending": { actionType: null, radar: "budget", early: true, severity: (d) => (d.urgent ? "URGENT" : "ATTENTION") },
  "pause-ad": { actionType: "pause_ad", radar: "creative", early: true, severity: () => "ATTENTION" },
  "creative-fatigue": { actionType: "generate_creative", radar: "creative", early: true, severity: () => "ATTENTION" },
  "landing-page": { actionType: "analyze_website", radar: "website", early: true, severity: (d) => (d.urgent ? "URGENT" : "ATTENTION") },
  "widen-audience": { actionType: "expand_audience", radar: "audience", early: true, severity: () => "ATTENTION" },
  "test-variation": { actionType: "generate_creative", radar: "creative", early: false, severity: () => "OPPORTUNITY" },
  "shift-budget": { actionType: "adjust_budget", radar: "budget", early: false, severity: () => "OPPORTUNITY" },
  "scale-winner": { actionType: "adjust_budget", radar: "budget", early: false, severity: () => "OPPORTUNITY" },
};

const CATEGORY_OF: Record<string, Insight["category"]> = {
  NEEDS_ATTENTION: "PERFORMANCE",
  GROWTH: "BUDGET",
  CREATIVE: "CREATIVE",
  BUDGET: "BUDGET",
  AUDIENCE: "AUDIENCE",
  RETARGETING: "AUDIENCE",
  WEBSITE: "WEBSITE",
  TESTING: "CREATIVE",
};

function fromDecision(d: DecisionDraft, input: DecisionInput): Insight {
  const map = FROM_DECISION[d.kind] ?? { actionType: null, radar: null, early: false, severity: () => "INFO" as const };
  const c = input.campaigns.find((x) => x.mairoCampaignId === d.mairoCampaignId) ?? null;
  const guide = d.changes.find((x) => x.type === "guide");
  const fatigue = d.kind === "creative-fatigue";
  return {
    dedupeKey: `d:${d.dedupeKey}`,
    type: d.kind,
    category: CATEGORY_OF[d.category] ?? "PERFORMANCE",
    severity: map.severity(d),
    confidence: d.confidence,
    mairoCampaignId: d.mairoCampaignId,
    campaignName: c?.name ?? null,
    platform: d.platform,
    metric: fatigue ? "CTR" : null,
    previousValue: fatigue ? `${d.evidence[1]?.value}%` : null,
    currentValue: fatigue ? `${d.evidence[0]?.value}%` : null,
    title: d.title,
    happened: d.noticed,
    happenedAdvanced: d.noticedAdvanced,
    whyItMatters: d.whyItMatters,
    recommendation: d.recommendation,
    reason: d.whyItMatters,
    ifApproved: d.impact,
    evidence: d.evidence,
    basedOn: c ? basedOnWeek(c) : { days: 7, impressions: null, clicks: null, results: null, resultWord: "result" },
    actionType: map.actionType,
    action: guide && guide.type === "guide" ? { label: guide.label, href: guide.href } : { label: "Review in Decisions", href: "/dashboard/decisions" },
    radarArea: map.radar,
    earlyWarning: map.early,
    decisionDedupeKey: d.dedupeKey,
  };
}

// --- early warnings the rules don't cover ----------------------------------------

type Detector = (c: CampaignSnapshot, input: DecisionInput, ctx: IntelligenceContext, drafts: DecisionDraft[]) => Insight[];

function base(c: CampaignSnapshot, now: Date, type: string): Pick<Insight, "mairoCampaignId" | "campaignName" | "platform" | "basedOn" | "decisionDedupeKey" | "dedupeKey" | "type"> {
  return {
    type,
    dedupeKey: `${type}:${c.mairoCampaignId}:${weekKey(now)}`,
    mairoCampaignId: c.mairoCampaignId,
    campaignName: c.name,
    platform: c.platform as AdPlatform,
    basedOn: basedOnWeek(c),
    decisionDedupeKey: null,
  };
}

function hasDraft(drafts: DecisionDraft[], c: CampaignSnapshot, kinds: string[]): DecisionDraft | undefined {
  return drafts.find((d) => d.mairoCampaignId === c.mairoCampaignId && kinds.includes(d.kind));
}

/** Cost per result up by a third or more against the days before. */
const cpaRising: Detector = (c, { now }, _ctx, drafts) => {
  if (!pastLearning(c, now)) return [];
  const word = resultWord(c.objective);
  const recentR = resultsFor(c.objective, c.recent);
  const priorR = resultsFor(c.objective, c.prior);
  if (recentR === null || priorR === null || priorR < 3 || (c.recent?.spendCents ?? 0) < 2000) return [];
  const before = costPerResult(c.objective, c.prior);
  const now3 = costPerResult(c.objective, c.recent);
  if (before === null || now3 === null) return [];
  const rise = now3 / before - 1;
  if (rise < 0.3) return [];

  // Where it's coming from: an ad taking a bigger share of the money than of the results.
  const weekSpend = c.week?.spendCents ?? 0;
  const weekResults = resultsFor(c.objective, c.week) ?? 0;
  const culprit =
    c.ads.length > 1 && weekSpend > 0 && weekResults > 0
      ? c.ads
          .map((a) => ({
            a,
            spendShare: (a.week?.spendCents ?? 0) / weekSpend,
            resultShare: (resultsFor(c.objective, a.week) ?? 0) / weekResults,
          }))
          .filter((x) => x.spendShare - x.resultShare >= 0.2)
          .sort((x, y) => y.spendShare - y.resultShare - (x.spendShare - x.resultShare))[0]
      : undefined;
  const pauseDraft = culprit ? drafts.find((d) => d.kind === "pause-ad" && d.changes.some((ch) => ch.type === "pause-ad" && ch.externalAdId === culprit.a.externalAdId)) : undefined;

  return [
    {
      ...base(c, now, "cpa-rising"),
      category: "PERFORMANCE",
      severity: rise >= 0.6 ? "ATTENTION" : "OPPORTUNITY",
      confidence: confidenceFrom(priorR + recentR, (c.week?.spendCents ?? 0), 7),
      metric: `Cost per ${word}`,
      previousValue: usd(before),
      currentValue: usd(now3),
      title: `Cost per ${word} is rising on "${c.name}"`,
      happened: `Each ${word} cost ${usd(now3)} over the last 3 days, up from ${usd(before)} the 4 days before — ${pct(rise)} more.`,
      happenedAdvanced: `CPA ${usd(now3)} (3d) vs ${usd(before)} (prior 4d), +${pct(rise)}. ${recentR} vs ${priorR} ${word}s.`,
      whyItMatters: `The same budget is buying fewer ${word}s. Caught early, it's usually one ad or audience rather than the whole campaign.`,
      recommendation: culprit
        ? `${culprit.a.label} is taking ${pct(culprit.spendShare)} of the budget but bringing ${pct(culprit.resultShare)} of the ${word}s. Reduce what it gets${pauseDraft ? " — MAIRO has a decision ready to switch it off" : ""}.`
        : "Watch it for another day or two before changing anything — a short rise can settle on its own.",
      reason: culprit
        ? `The biggest single change inside the campaign is ${culprit.a.label}: most of the extra cost is going through it.`
        : "No single ad explains it yet, so a change now would be a guess.",
      ifApproved: culprit ? `Less of your budget goes to ${culprit.a.label}, and more to the ads bringing ${word}s.` : "Nothing changes; MAIRO keeps watching it.",
      evidence: [
        { label: `Cost per ${word}, last 3 days`, value: usd(now3), advancedLabel: "CPA (3d)" },
        { label: `Cost per ${word}, the 4 days before`, value: usd(before), advancedLabel: "CPA (prior 4d)" },
        ...(culprit
          ? [{ label: `${culprit.a.label}: share of budget / share of ${word}s`, value: `${pct(culprit.spendShare)} / ${pct(culprit.resultShare)}` }]
          : []),
      ],
      actionType: culprit ? "pause_ad" : null,
      action: pauseDraft ? { label: "Review in Decisions", href: "/dashboard/decisions" } : { label: "Open campaign", href: `/dashboard/campaigns/${c.mairoCampaignId}` },
      radarArea: "budget",
      earlyWarning: true,
      decisionDedupeKey: pauseDraft?.dedupeKey ?? null,
    },
  ];
};

/** The same people seeing it more and clicking less — the campaign, not one ad. */
const audienceFatigue: Detector = (c, { now }, _ctx, drafts) => {
  if (!pastLearning(c, now) || hasDraft(drafts, c, ["widen-audience", "creative-fatigue"])) return [];
  const fRecent = frequency(c.recent);
  const fPrior = frequency(c.prior);
  const ctrRecent = clickRate(c.recent);
  const ctrPrior = clickRate(c.prior);
  if (fRecent === null || fPrior === null || ctrRecent === null || ctrPrior === null || ctrPrior === 0) return [];
  if ((c.recent?.impressions ?? 0) < 2000) return [];
  const drop = 1 - ctrRecent / ctrPrior;
  if (fRecent < 2.5 || fRecent < fPrior * 1.3 || drop < 0.2) return [];
  const widen = drafts.find((d) => d.kind === "widen-audience" && d.mairoCampaignId === c.mairoCampaignId);
  return [
    {
      ...base(c, now, "audience-fatigue"),
      category: "AUDIENCE",
      severity: "ATTENTION",
      confidence: confidenceFrom(resultsFor(c.objective, c.week) ?? 0, c.week?.spendCents ?? 0, 7),
      metric: "Frequency",
      previousValue: fPrior.toFixed(1),
      currentValue: fRecent.toFixed(1),
      title: `Audience fatigue on "${c.name}"`,
      happened: `The same people are seeing these ads more often — ${fRecent.toFixed(1)} times each over 3 days, up from ${fPrior.toFixed(1)} — and ${pct(drop)} fewer of them are clicking.`,
      happenedAdvanced: `Frequency ${fRecent.toFixed(1)} (3d) vs ${fPrior.toFixed(1)} (prior 4d); CTR ${(ctrRecent * 100).toFixed(2)}% vs ${(ctrPrior * 100).toFixed(2)}% (−${pct(drop)}).`,
      whyItMatters: "Once most of an audience has seen an ad several times, each extra showing costs the same and persuades fewer people.",
      recommendation: "Widen who the campaign can reach, and add a fresh version of the ad.",
      reason: "Both signs point the same way: more repeats to the same people, fewer clicks from them.",
      ifApproved: "The campaign can reach people who haven't seen it yet, and the new version gives the people who have something new.",
      evidence: [
        { label: "Times each person saw it, last 3 days", value: fRecent.toFixed(1), advancedLabel: "Frequency (3d)" },
        { label: "The 4 days before", value: fPrior.toFixed(1), advancedLabel: "Frequency (prior 4d)" },
        { label: "Change in clicks per 100 people", value: `−${pct(drop)}`, advancedLabel: "CTR change" },
      ],
      actionType: "expand_audience",
      action: widen ? { label: "Review in Decisions", href: "/dashboard/decisions" } : { label: "Open campaign", href: `/dashboard/campaigns/${c.mairoCampaignId}` },
      radarArea: "audience",
      earlyWarning: true,
      decisionDedupeKey: widen?.dedupeKey ?? null,
    },
  ];
};

/**
 * Clicks steady, results falling — the problem is after the click. When
 * results fall to almost nothing at once, it's more likely tracking than the
 * page, and it's reported as that instead.
 */
const afterTheClick: Detector = (c, { now }, _ctx, drafts) => {
  if (!pastLearning(c, now) || (c.objective !== "SALES" && c.objective !== "LEADS")) return [];
  if (hasDraft(drafts, c, ["landing-page", "not-spending"])) return [];
  const clicksR = perDay(c.recent?.clicks, 3);
  const clicksP = perDay(c.prior?.clicks, 4);
  const resR = perDay(resultsFor(c.objective, c.recent), 3);
  const resP = perDay(resultsFor(c.objective, c.prior), 4);
  const priorResults = resultsFor(c.objective, c.prior) ?? 0;
  if (clicksR === null || clicksP === null || resR === null || resP === null || clicksP === 0 || resP === 0 || priorResults < 5) return [];
  if (clicksR < clicksP * 0.7) return [];
  const convR = resR / Math.max(clicksR, 1e-9);
  const convP = resP / clicksP;
  const drop = 1 - convR / convP;
  const ctrR = clickRate(c.recent);
  const ctrP = clickRate(c.prior);
  const ctrSteady = ctrR !== null && ctrP !== null && ctrP > 0 && Math.abs(ctrR / ctrP - 1) < 0.2;
  const word = resultWord(c.objective);

  if (resR / resP <= 0.2) {
    return [
      {
        ...base(c, now, "tracking-drop"),
        category: "TRACKING",
        severity: "ATTENTION",
        confidence: priorResults >= 10 ? "HIGH" : "MEDIUM",
        metric: `${word[0].toUpperCase()}${word.slice(1)}s per day`,
        previousValue: resP.toFixed(1),
        currentValue: resR.toFixed(1),
        title: `Tracked ${word}s dropped suddenly on "${c.name}"`,
        happened: `People are still clicking about as often, but tracked ${word}s fell from ${resP.toFixed(1)} a day to ${resR.toFixed(1)}.`,
        happenedAdvanced: `Link clicks/day ${clicksR.toFixed(0)} vs ${clicksP.toFixed(0)}; ${word}s/day ${resR.toFixed(1)} vs ${resP.toFixed(1)} (−${pct(1 - resR / resP)}).`,
        whyItMatters: `A drop this sudden, with traffic steady, is more often a tracking problem than a real fall in ${word}s. If Meta can't see ${word}s, it can't find more people like the ones who ${c.objective === "SALES" ? "buy" : "get in touch"}.`,
        recommendation: "Check your pixel and purchase tracking before changing the campaign.",
        reason: "Clicks and click rate barely moved, so the ads are still working; what changed is what's being recorded after the click.",
        ifApproved: "Nothing in the campaign changes. MAIRO opens your tracking setup so you can see whether events are still arriving.",
        evidence: [
          { label: "Clicks per day, last 3 days", value: clicksR.toFixed(0), advancedLabel: "Link clicks/day (3d)" },
          { label: "Clicks per day, the 4 days before", value: clicksP.toFixed(0), advancedLabel: "Link clicks/day (prior 4d)" },
          { label: `${word[0].toUpperCase()}${word.slice(1)}s per day, last 3 days`, value: resR.toFixed(1) },
          { label: `${word[0].toUpperCase()}${word.slice(1)}s per day, the 4 days before`, value: resP.toFixed(1) },
        ],
        actionType: "fix_tracking",
        action: { label: "Check tracking", href: "/dashboard/tracking" },
        radarArea: null,
        earlyWarning: true,
      },
    ];
  }

  if (drop < 0.3 || !ctrSteady) return [];
  return [
    {
      ...base(c, now, "conversion-drop"),
      category: "WEBSITE",
      severity: "ATTENTION",
      confidence: confidenceFrom(priorResults, c.week?.spendCents ?? 0, 7),
      metric: "Website conversion rate",
      previousValue: `${(convP * 100).toFixed(1)}%`,
      currentValue: `${(convR * 100).toFixed(1)}%`,
      title: `Fewer visitors from "${c.name}" are ${c.objective === "SALES" ? "buying" : "getting in touch"}`,
      happened: `Your ads are still getting clicks, but fewer of those people ${c.objective === "SALES" ? "complete a purchase" : "send an enquiry"} — down ${pct(drop)}.`,
      happenedAdvanced: `CTR stable (${((ctrR ?? 0) * 100).toFixed(2)}% vs ${((ctrP ?? 0) * 100).toFixed(2)}%); conversion rate ${(convR * 100).toFixed(1)}% vs ${(convP * 100).toFixed(1)}% (−${pct(drop)}).`,
      whyItMatters: "The problem is probably happening after the click rather than inside the ad — on the page, the price, stock, or checkout.",
      recommendation: "Have MAIRO analyze the landing page, and check it on your own phone.",
      reason: "The ad side is steady, so changing the ad would be fixing the wrong thing.",
      ifApproved: "MAIRO reads your page and lists what's most likely stopping people, with a fix for each.",
      evidence: [
        { label: "Clicks per 100 people who saw the ad", value: "Stable", advancedLabel: "CTR" },
        { label: `Visitors who became a ${word}, last 3 days`, value: `${(convR * 100).toFixed(1)}%`, advancedLabel: "CVR (3d)" },
        { label: "The 4 days before", value: `${(convP * 100).toFixed(1)}%`, advancedLabel: "CVR (prior 4d)" },
      ],
      actionType: "analyze_website",
      action: { label: "Analyze website", href: "/dashboard/business" },
      radarArea: "website",
      earlyWarning: true,
    },
  ];
};

/** Close to, or past, the most the business said it would pay per result. */
const nearTargetCpa: Detector = (c, { now, guardrails }) => {
  const target = guardrails.maxCpaCents;
  if (!target || !pastLearning(c, now)) return [];
  const cpa = costPerResult(c.objective, c.week);
  const r = resultsFor(c.objective, c.week) ?? 0;
  if (cpa === null || r < 3 || cpa < target * 0.9) return [];
  const over = cpa > target;
  const word = resultWord(c.objective);
  return [
    {
      ...base(c, now, "near-target-cpa"),
      category: "BUDGET",
      severity: cpa >= target * 1.2 ? "URGENT" : "ATTENTION",
      confidence: confidenceFrom(r, c.week?.spendCents ?? 0, 7),
      metric: `Cost per ${word}`,
      previousValue: usd(target),
      currentValue: usd(cpa),
      title: over ? `"${c.name}" is over your cost-per-${word} target` : `"${c.name}" is close to your cost-per-${word} target`,
      happened: `This week each ${word} cost ${usd(cpa)}. Your target is at most ${usd(target)}.`,
      happenedAdvanced: `CPA ${usd(cpa)} (7d) vs max CPA ${usd(target)} (${Math.round((cpa / target) * 100)}% of target).`,
      whyItMatters: over ? `Every ${word} this campaign brings now costs more than you said one is worth.` : "One more expensive day would put it over.",
      recommendation: over ? "Hold the budget, and look at which ad is driving the cost before spending more." : "Watch this campaign closely before increasing its budget.",
      reason: "It's your own limit, set in Automation — MAIRO compares against it rather than an industry average.",
      ifApproved: "Nothing changes automatically. MAIRO won't raise this campaign's budget while it's over target.",
      evidence: [
        { label: `Cost per ${word}, this week`, value: usd(cpa), advancedLabel: "CPA (7d)" },
        { label: "Your target", value: usd(target), advancedLabel: "Max CPA" },
      ],
      actionType: null,
      action: { label: "Open campaign", href: `/dashboard/campaigns/${c.mairoCampaignId}` },
      radarArea: "budget",
      earlyWarning: true,
    },
  ];
};

/** Running, but spending well under its budget. */
const underDelivering: Detector = (c, { now }, _ctx, drafts) => {
  if (!pastLearning(c, now) || c.dailyBudgetCents <= 0 || hasDraft(drafts, c, ["not-spending"])) return [];
  const spent = c.week?.spendCents ?? 0;
  const planned = c.dailyBudgetCents * 7;
  const share = spent / planned;
  if (share >= 0.5) return [];
  return [
    {
      ...base(c, now, "under-delivering"),
      category: "BUDGET",
      severity: "INFO",
      confidence: "MEDIUM",
      metric: "Spend vs budget",
      previousValue: usd(planned),
      currentValue: usd(spent),
      title: `"${c.name}" is spending less than its budget`,
      happened: `It spent ${usd(spent)} this week against a budget of ${usd(planned)} — ${pct(share)} of it.`,
      happenedAdvanced: `Spend ${usd(spent)} (7d) vs ${usd(c.dailyBudgetCents)}/day budget (${pct(share)} delivery).`,
      whyItMatters: "Meta spends less when it can't find enough of the people you asked for — usually an audience that's narrow or a result that's rare.",
      recommendation: "Widening the audience or letting Meta choose placements usually lets it spend.",
      reason: "Low spend isn't a saving here: the campaign is reaching fewer people than you planned for.",
      ifApproved: "Nothing changes automatically; open the campaign to widen who it reaches.",
      evidence: [
        { label: "Spent this week", value: usd(spent), advancedLabel: "Spend (7d)" },
        { label: "Budget for the week", value: usd(planned), advancedLabel: "Budget × 7" },
      ],
      actionType: "expand_audience",
      action: { label: "Open campaign", href: `/dashboard/campaigns/${c.mairoCampaignId}` },
      radarArea: "audience",
      earlyWarning: true,
    },
  ];
};

/** Plenty of people reached the website without buying — worth showing ads to again. */
const retargeting: Detector = (c, { now }, ctx) => {
  if (!pastLearning(c, now) || c.destinationType !== "WEBSITE" || (c.objective !== "SALES" && c.objective !== "LEADS")) return [];
  const clicks = c.week?.clicks ?? 0;
  const r = resultsFor(c.objective, c.week) ?? 0;
  if (clicks < 300) return [];
  const pixelWorks = ctx.pixels.some((p) => p.status === "ACTIVE");
  const word = resultWord(c.objective);
  return [
    {
      ...base(c, now, "retargeting"),
      category: "AUDIENCE",
      severity: "OPPORTUNITY",
      confidence: clicks >= 1000 ? "HIGH" : "MEDIUM",
      metric: "Clicks to your website",
      previousValue: null,
      currentValue: String(clicks),
      title: "Retargeting opportunity",
      happened: `"${c.name}" sent ${clicks.toLocaleString("en-US")} clicks to your website this week, and ${r} became a ${word}.`,
      happenedAdvanced: `${clicks.toLocaleString("en-US")} link clicks (7d), ${r} ${word}s. Clicks aren't unique visitors; the pixel audience gives the real count.`,
      whyItMatters: "People who have already visited are far more likely to come back and buy than people who've never heard of you.",
      recommendation: pixelWorks
        ? "Create a website-visitors audience in Meta and run a small retargeting campaign to it."
        : "Get your Meta pixel recording visits first — retargeting audiences are built from it.",
      reason: "The visitors already exist; retargeting spends a little to bring back people who showed interest.",
      ifApproved: pixelWorks ? "Meta opens on your audiences, where the visitors audience is made in a few clicks." : "MAIRO opens your tracking setup.",
      evidence: [
        { label: "Clicks to your website, this week", value: clicks.toLocaleString("en-US"), advancedLabel: "Link clicks (7d)" },
        { label: `${word[0].toUpperCase()}${word.slice(1)}s from them`, value: String(r) },
        { label: "Pixel recording visits", value: pixelWorks ? "Yes" : "No" },
      ],
      actionType: "create_retargeting",
      action: pixelWorks
        ? { label: "Create the audience in Meta", href: "https://www.facebook.com/adsmanager/audiences" }
        : { label: "Set up tracking", href: "/dashboard/tracking" },
      radarArea: "retargeting",
      earlyWarning: false,
    },
  ];
};

const PER_CAMPAIGN: Detector[] = [cpaRising, audienceFatigue, afterTheClick, nearTargetCpa, underDelivering, retargeting];

// --- account-wide -----------------------------------------------------------------

/** No pixel the network has seen events from, while sales or leads campaigns run. */
function trackingSetup(input: DecisionInput, ctx: IntelligenceContext): Insight[] {
  const needs = input.campaigns.filter((c) => c.status === "ACTIVE" && c.destinationType === "WEBSITE" && (c.objective === "SALES" || c.objective === "LEADS"));
  if (needs.length === 0 || ctx.pixels.some((p) => p.status === "ACTIVE")) return [];
  const none = ctx.pixels.length === 0;
  return [
    {
      dedupeKey: `tracking-setup:${weekKey(input.now)}`,
      type: "tracking-setup",
      category: "TRACKING",
      severity: "ATTENTION",
      confidence: "HIGH",
      mairoCampaignId: null,
      campaignName: null,
      platform: "META",
      metric: "Pixel events",
      previousValue: null,
      currentValue: none ? "No pixel" : "No events",
      title: none ? "Sales aren't being tracked" : "Your pixel isn't recording anything",
      happened: none
        ? `${needs.length} campaign${needs.length === 1 ? "" : "s"} send people to your website, but there's no Meta pixel set up to record what they do there.`
        : "Your Meta pixel exists, but Meta hasn't seen any events from it recently.",
      happenedAdvanced: none ? "No TrackingPixel for this account." : "Pixel status: no events in the last 48h.",
      whyItMatters: "Without tracking, Meta can't tell which clicks became customers — so it can't find more of them, and results here stay blank.",
      recommendation: "Finish tracking setup — MAIRO walks you through it.",
      reason: "Every other number on this page depends on it.",
      ifApproved: "MAIRO opens tracking setup.",
      evidence: [{ label: "Campaigns sending people to your website", value: String(needs.length) }],
      basedOn: { days: 2, impressions: null, clicks: null, results: null, resultWord: "event" },
      actionType: "fix_tracking",
      action: { label: "Check tracking", href: "/dashboard/tracking" },
      radarArea: null,
      earlyWarning: true,
      decisionDedupeKey: null,
    },
  ];
}

/** Facebook and Instagram getting results at clearly different costs. */
function platformSplit(input: DecisionInput, ctx: IntelligenceContext): Insight[] {
  const rows = (ctx.publishers ?? []).filter((p) => ["facebook", "instagram"].includes(p.publisher));
  if (rows.length < 2) return [];
  const withCpa = rows
    .map((p) => ({ p, results: p.metrics.purchases ?? p.metrics.conversions ?? 0, spend: p.metrics.spendCents ?? 0 }))
    .filter((x) => x.results >= 5 && x.spend > 0)
    .map((x) => ({ ...x, cpa: Math.round(x.spend / x.results) }));
  if (withCpa.length < 2) return [];
  const [cheap, dear] = [...withCpa].sort((a, b) => a.cpa - b.cpa);
  const gap = 1 - cheap.cpa / dear.cpa;
  if (gap < 0.3) return [];
  const a = PUBLISHER[cheap.p.publisher] ?? cheap.p.publisher;
  const b = PUBLISHER[dear.p.publisher] ?? dear.p.publisher;
  const total = cheap.results + dear.results;
  return [
    {
      dedupeKey: `platform-split:${cheap.p.publisher}:${weekKey(input.now)}`,
      type: "platform-split",
      category: "PLATFORM",
      severity: "OPPORTUNITY",
      confidence: confidenceFrom(total, cheap.spend + dear.spend, 7),
      mairoCampaignId: null,
      campaignName: null,
      platform: "META",
      metric: "Cost per result",
      previousValue: usd(dear.cpa),
      currentValue: usd(cheap.cpa),
      title: `${a} is getting customers for less than ${b}`,
      happened: `This week ${a} brought results at ${usd(cheap.cpa)} each, ${b} at ${usd(dear.cpa)} — ${pct(gap)} less on ${a}.`,
      happenedAdvanced: `${a}: ${usd(cheap.cpa)} CPA (${cheap.results} results, ${usd(cheap.spend)}); ${b}: ${usd(dear.cpa)} CPA (${dear.results}, ${usd(dear.spend)}), 7d.`,
      whyItMatters: `Meta splits spend between its apps on its own. When one is clearly cheaper, leaning toward it gets more from the same budget.`,
      recommendation: `Consider favouring ${a} placements for your testing budget — keep ${b} running so it can recover.`,
      reason: "Both have enough results this week to compare, and the gap is large.",
      ifApproved: "Open the campaign's placements to lean toward the cheaper app.",
      evidence: [
        { label: `${a}, cost per result`, value: usd(cheap.cpa), advancedLabel: `${a} CPA (7d)` },
        { label: `${b}, cost per result`, value: usd(dear.cpa), advancedLabel: `${b} CPA (7d)` },
      ],
      basedOn: { days: 7, impressions: null, clicks: null, results: total, resultWord: "result" },
      actionType: "shift_platform_budget",
      action: { label: "Open campaigns", href: "/dashboard/campaigns" },
      radarArea: "platform",
      earlyWarning: false,
      decisionDedupeKey: null,
    },
  ];
}

/** A page that couldn't be opened, or isn't built for phones — whether or not results have dropped yet. */
function pageProblems(input: DecisionInput, ctx: IntelligenceContext, drafts: DecisionDraft[]): Insight[] {
  const out: Insight[] = [];
  for (const c of input.campaigns) {
    const page = ctx.pages[c.mairoCampaignId];
    if (!page?.probe || hasDraft(drafts, c, ["landing-page"])) continue;
    const p = page.probe;
    if (p.ok && p.mobileReady) continue;
    out.push({
      ...base(c, input.now, "page-problem"),
      category: "WEBSITE",
      severity: p.ok ? "ATTENTION" : "URGENT",
      confidence: "HIGH",
      metric: "Landing page",
      previousValue: null,
      currentValue: p.ok ? "Not mobile-ready" : "Unreachable",
      title: p.ok ? `"${c.name}" sends people to a page that isn't built for phones` : `"${c.name}" sends people to a page that won't open`,
      happened: p.ok ? "MAIRO opened the page as a phone would and it has no mobile layout — it likely shows zoomed out." : `MAIRO tried to open the page and couldn't: ${p.message}`,
      happenedAdvanced: p.ok ? `No viewport meta tag on ${p.finalUrl}.` : `Probe failed (${p.reason}${p.status ? ` ${p.status}` : ""}).`,
      whyItMatters: "Most people who click an ad on Facebook or Instagram are on a phone. Every click that lands on a broken page is paid for and wasted.",
      recommendation: p.ok ? "Fix the page's mobile layout, or point the campaign at a page that has one." : "Check the link — pause the campaign if the page stays down.",
      reason: "It's the page, not the ad — no change to the campaign would fix it.",
      ifApproved: "MAIRO opens the Business Analyzer on this page.",
      evidence: [...(c.destinationUrl ? [{ label: "Page", value: c.destinationUrl }] : [])],
      actionType: "analyze_website",
      action: { label: "Analyze website", href: "/dashboard/business" },
      radarArea: "website",
      earlyWarning: true,
    });
  }
  return out;
}

// --- all together -------------------------------------------------------------------

const SEVERITY_RANK: Record<InsightSeverity, number> = { URGENT: 4, ATTENTION: 3, OPPORTUNITY: 2, INFO: 1 };
const CONFIDENCE_RANK = { HIGH: 3, MEDIUM: 2, EARLY: 1 } as const;

export function rankInsights(a: Insight, b: Insight): number {
  return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence];
}

export function detectInsights(input: DecisionInput, drafts: DecisionDraft[], ctx: IntelligenceContext): Insight[] {
  const all = [
    ...drafts.map((d) => fromDecision(d, input)),
    ...input.campaigns.flatMap((c) => PER_CAMPAIGN.flatMap((detect) => detect(c, input, ctx, drafts))),
    ...trackingSetup(input, ctx),
    ...platformSplit(input, ctx),
    ...pageProblems(input, ctx, drafts),
  ];
  // A rising cost with its cause already named (the page, or tracking) is one
  // problem, not two — unless a single ad explains the cost on its own.
  const explained = new Set(all.filter((i) => i.type === "conversion-drop" || i.type === "tracking-drop").map((i) => i.mairoCampaignId));
  const seen = new Set<string>();
  return all
    .filter((i) => !(i.type === "cpa-rising" && explained.has(i.mairoCampaignId) && i.actionType !== "pause_ad"))
    .filter((i) => (seen.has(i.dedupeKey) ? false : (seen.add(i.dedupeKey), true)))
    .sort(rankInsights);
}

export { basedOnLine } from "./format";

export type { Evidence };
