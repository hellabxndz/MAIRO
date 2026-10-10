import type { AgentRole, CoachConfidence } from "@/generated/prisma/enums";
import type { PlatformMetrics } from "@/lib/ad-platforms/types";
import { resultsFor, resultWord, usd } from "@/lib/protection/rules";
import { MIN_CAMPAIGN_DAILY_CENTS } from "@/lib/decisions/rules";
import type { DecisionDraft } from "@/lib/decisions/types";
import { lostReasonLabel } from "@/lib/leads/details";
import { STAGE } from "@/lib/leads/outcomes";
import { funnelFor, isJudged, leadsIn, MATURE_DAYS, median, MIN, per, responseHours, stageRate, stepChanges, whereItDrops } from "./funnel";
import type { CoachCampaign, CoachInput, CoachLead, CoachResult, Explanation, Finding, Funnel, Gap, Measure, PlanStep } from "./types";

export type { CoachResult };

// The Performance Coach's investigation. Each rule looks at one part of the
// journey, and only says something when the records are enough to: below the
// samples in funnel.ts it stays quiet, because a conclusion drawn from three
// clicks is worse than none.
//
// Every finding keeps apart what MAIRO observed (with the numbers), what might
// explain it — marked "evidence" only when a record points to it, otherwise
// "possibility" — and what MAIRO can't see. No rule decides the cause of low
// sales is the advertising: when the drop is after the lead, it says so.
// Recommendations say what may help, never by how much. Pure; pinned by
// scripts/check-coach.ts.

const DAY = 86_400_000;
const pctText = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const share = (x: number) => `${Math.round(x * 100)}%`;
const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const hours = (h: number) => (h >= 48 ? `${Math.round(h / 24)} days` : h >= 1.5 ? `${Math.round(h)} hours` : `${Math.max(1, Math.round(h * 60))} minutes`);
const change = (cur: number, prev: number) => (prev > 0 ? (cur - prev) / prev : null);
const ctr = (m: PlatformMetrics | null) => (m?.clicks && m?.impressions ? m.clicks / m.impressions : null);
const cpm = (m: PlatformMetrics | null) => (m?.spendCents && m?.impressions ? (m.spendCents / m.impressions) * 1000 : null);
const freq = (m: PlatformMetrics | null) => (m?.impressions && m?.reach ? m.impressions / m.reach : null);

/** Words for how strong the evidence is, from the smallest sample behind it. */
export function confidenceFrom(smallestSample: number, minimum: number): CoachConfidence {
  if (smallestSample >= Math.max(20, minimum * 2.5)) return "STRONG";
  if (smallestSample >= minimum) return "SOME";
  return "EARLY";
}

const LIMIT_META = "Meta's figures for the last day or two can still change.";
const LIMIT_CAUSE = "This shows what MAIRO measured. It can't prove why it happened.";

/** Steps keep the same id from one review to the next, so progress the business recorded survives. */
function step(s: Omit<PlanStep, "id" | "status">): PlanStep {
  return { id: s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48), status: "todo", ...s };
}
const MONITOR = (what: string, days = 7): PlanStep =>
  step({ title: `Watch ${what} for ${days} days`, detail: "MAIRO keeps checking every day and tells you what changed.", kind: "monitor", priority: 9, risk: "LOW", approval: "Nothing to approve.", benefit: "Shows whether things are moving the right way before anything else changes.", verify: `${what} compared with today's figure.` });

type Draft = Omit<Finding, "priority" | "change" | "measure" | "missing" | "alternatives" | "mairoCampaignId" | "campaignName"> & Partial<Pick<Finding, "priority" | "change" | "measure" | "missing" | "alternatives" | "mairoCampaignId" | "campaignName">>;
function finding(d: Draft): Finding {
  return { priority: 50, change: null, measure: null, missing: [], alternatives: [], mairoCampaignId: null, campaignName: null, ...d };
}

const campaignOf = (c: CoachCampaign | null) => (c ? { mairoCampaignId: c.mairoCampaignId, campaignName: c.name } : {});

// --- 1. Tracking: are the results reaching Meta at all? -------------------------

function trackingGap(input: CoachInput, cur: Funnel): Finding[] {
  const out: Finding[] = [];
  const hosted = input.campaigns.filter((c) => c.objective === "LEADS" && c.hostedForm && c.status === "ACTIVE");
  if (!hosted.length) return out;
  const metaCounted = hosted.reduce((a, c) => a + (resultsFor("LEADS", c.current) ?? 0), 0);
  const hostedSpend = hosted.reduce((a, c) => a + (c.current?.spendCents ?? 0), 0);
  // At least a day old, so Meta's reporting has had time to catch up.
  const formLeads = leadsIn(input, "current").filter((l) => l.source === "MAIRO_FORM" && l.status !== "SPAM" && input.now.getTime() - l.createdAt.getTime() >= DAY).length;
  if (formLeads >= 5 && hostedSpend >= MIN.spendCents && metaCounted === 0) {
    const noPixel = input.tracking.pixel === "none";
    out.push(
      finding({
        key: "tracking:form-leads-not-counted",
        category: "TRACKING",
        severity: "ATTENTION",
        title: "Meta isn't counting the leads your form receives",
        plain: "People are filling in your form, but Meta doesn't know. Without that, Meta can't learn who to show your ads to, and its reports undercount your results.",
        noticed: `Your form received ${n(formLeads, "lead")} in the last two weeks; Meta reported 0 leads for the campaigns that send people there.`,
        explanations: noPixel
          ? [{ text: "There's no Meta pixel on your ad account, so MAIRO has nowhere to report these leads.", basis: "evidence" }]
          : [
              { text: "MAIRO sends each new form lead to your Meta pixel; Meta may not have matched them to the ads yet.", basis: "possibility" },
              { text: "The pixel may not be set up to receive them — the tracking page shows its status.", basis: "possibility" },
            ],
        recommendation: noPixel ? "Set up your Meta pixel so every form lead is reported to Meta." : "Check the tracking page, and ask MAIRO's team to run the live Meta check.",
        evidence: [
          { label: "Leads on your form (2 weeks)", value: String(formLeads) },
          { label: "Leads Meta reported", value: "0" },
          { label: "Meta pixel", value: input.tracking.pixel === "none" ? "Not set up" : input.tracking.pixel === "firing" ? "Firing" : "Not seen lately" },
        ],
        confidence: "STRONG",
        limitations: `${LIMIT_META} MAIRO counted the leads itself, so the gap is real; why Meta missed them is what the steps check.`,
        steps: [
          step({ title: noPixel ? "Set up the Meta pixel" : "Check your tracking", detail: "MAIRO walks you through it — no code to paste.", kind: "tracking", priority: 1, risk: "LOW", approval: "Your OK on the tracking page.", benefit: "Meta can count your form leads and aim your ads at people more likely to fill it in.", verify: "Meta's lead count starts matching the leads on your form.", href: "/dashboard/tracking" }),
          MONITOR("Meta's lead count against your form's"),
        ],
        agents: ["ANALYST", "ARCHITECT"],
        priority: 90,
      }),
    );
  }
  if (cur.spendCents && cur.spendCents >= MIN.spendCents && input.tracking.pixel === "stopped" && input.campaigns.some((c) => c.objective === "SALES" && c.status === "ACTIVE")) {
    out.push(
      finding({
        key: "tracking:pixel-stopped",
        category: "TRACKING",
        severity: "ATTENTION",
        title: "Your sales tracking has gone quiet",
        plain: "Your website stopped telling Meta about sales. Until it's fixed, nobody — Meta or MAIRO — can see which ads lead to purchases.",
        noticed: `Your pixel last sent anything on ${input.tracking.pixelLastFiredAt?.toDateString() ?? "an unknown date"}, while your sales campaigns kept spending.`,
        explanations: [
          { text: "A website change often removes the tracking code.", basis: "possibility" },
          { text: "A cookie or consent tool may be blocking it.", basis: "possibility" },
        ],
        recommendation: "Check the tracking page and reinstall the pixel if it's missing.",
        evidence: [{ label: "Pixel last seen", value: input.tracking.pixelLastFiredAt?.toDateString() ?? "Never" }, { label: "Spent in the last 2 weeks", value: usd(cur.spendCents) }],
        confidence: "STRONG",
        limitations: LIMIT_CAUSE,
        steps: [step({ title: "Check your tracking", detail: "See what Meta last received and reinstall if needed.", kind: "tracking", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "Sales become measurable again.", verify: "The pixel shows as firing.", href: "/dashboard/tracking" })],
        agents: ["ANALYST"],
        priority: 85,
      }),
    );
  }
  return out;
}

// --- 2. Conversion: are clicks turning into leads or sales? ---------------------

function clicksNotConverting(input: CoachInput): Finding[] {
  const out: Finding[] = [];
  for (const c of input.campaigns) {
    if (c.status !== "ACTIVE" || (c.objective !== "LEADS" && c.objective !== "SALES")) continue;
    const word = resultWord(c.objective);
    const attributed = c.hostedForm && input.leads.some((l) => l.mairoCampaignId === c.mairoCampaignId);
    const resultsNow = attributed ? leadsIn(input, "current", c.mairoCampaignId).filter((l) => l.status !== "SPAM").length : resultsFor(c.objective, c.current);
    const resultsBefore = attributed ? leadsIn(input, "previous", c.mairoCampaignId).filter((l) => l.status !== "SPAM").length : resultsFor(c.objective, c.previous);
    const clicks = c.current?.clicks ?? 0;
    const prevClicks = c.previous?.clicks ?? 0;
    if (clicks < MIN.clicks || resultsNow === null) continue;
    const rate = resultsNow / clicks;
    const prevRate = prevClicks >= MIN.clicks && resultsBefore !== null && resultsBefore >= 5 ? resultsBefore / prevClicks : null;
    const none = resultsNow === 0;
    const fell = prevRate !== null && rate <= prevRate * 0.6;
    if (!none && !fell) continue;
    const measurementDoubt = !attributed && input.tracking.pixel !== "firing";
    const explanations: Explanation[] = [];
    if (measurementDoubt) explanations.push({ text: `MAIRO reads ${word}s from Meta, and your pixel isn't ${input.tracking.pixel === "none" ? "set up" : "sending events lately"} — some ${word}s may be happening without being counted.`, basis: "evidence" });
    explanations.push(
      { text: c.objective === "LEADS" ? "The form or page may be hard to finish on a phone." : "The page or checkout may be hard to finish on a phone.", basis: "possibility" },
      { text: "The page may not match what the ad promised, so people leave.", basis: "possibility" },
      { text: "The ad may be drawing clicks from people who aren't ready to act.", basis: "possibility" },
    );
    out.push(
      finding({
        key: `conversion:clicks:${c.mairoCampaignId}`,
        category: "CONVERSION",
        severity: "ATTENTION",
        ...campaignOf(c),
        title: none ? `Clicks on "${c.name}" aren't turning into ${word}s` : `Fewer clicks on "${c.name}" are turning into ${word}s`,
        plain: none
          ? `People are clicking this ad, but none has gone on to ${c.objective === "LEADS" ? "send an enquiry" : "buy"} yet. Your AI team is looking at what happens after the click.`
          : `People still click this ad, but fewer of them go on to ${c.objective === "LEADS" ? "send an enquiry" : "buy"} than before.`,
        noticed: none
          ? `${n(clicks, "click")} in the last two weeks and no ${word}s${attributed ? " on your form" : " reported"}.`
          : `${share(rate)} of clicks became ${word}s in the last two weeks, against ${share(prevRate!)} the two weeks before.`,
        explanations,
        recommendation: measurementDoubt ? "Check your tracking first — the ad may be working better than the numbers show." : `Open the ad's ${c.objective === "LEADS" ? "form" : "page"} on your phone and go through it as a customer would.`,
        alternatives: ["Compare what the ad says with what the page shows, and make them match.", "Ask your Creative Agent for a version of the ad that sets clearer expectations."],
        evidence: [
          { label: "Clicks (2 weeks)", value: String(clicks) },
          { label: `${word[0].toUpperCase()}${word.slice(1)}s (2 weeks)`, value: String(resultsNow) },
          ...(prevRate !== null ? [{ label: "Clicks that converted, before → now", value: `${share(prevRate)} → ${share(rate)}` }] : []),
        ],
        confidence: confidenceFrom(clicks, MIN.clicks),
        limitations: `${LIMIT_META} ${LIMIT_CAUSE}`,
        missing: [c.objective === "LEADS" ? "How many people started your form but didn't finish it — Meta and MAIRO only see completed forms." : "Where people leave your checkout — that needs your store's own analytics."],
        steps: [
          ...(measurementDoubt ? [step({ title: "Check your tracking", detail: "Make sure Meta is told about every result.", kind: "tracking", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "The numbers you see become complete.", verify: "Results appear when you test the page yourself.", href: "/dashboard/tracking" })] : []),
          step({ title: `Try the ${c.objective === "LEADS" ? "form" : "page"} on your phone`, detail: "Tap the ad's link and finish it as a customer would. Note anything slow, confusing or broken.", kind: "review", priority: 2, risk: "LOW", approval: "Nothing to approve.", benefit: "May uncover a problem no report can show.", verify: "You complete it without trouble.", href: c.hostedForm ? "/dashboard/leads" : `/dashboard/campaigns/${c.mairoCampaignId}` }),
          step({ title: "Prepare a clearer version of the ad", detail: "Your Creative Agent writes a version that says exactly what happens after the click. Nothing runs until you approve it.", kind: "creative", priority: 3, risk: "LOW", approval: "Your approval before it runs. Your budget doesn't change.", benefit: "May bring clicks from people more ready to act.", verify: "The share of clicks that convert, over the following week.", href: "/dashboard/creatives" }),
          MONITOR("the share of clicks that convert"),
        ],
        agents: ["ANALYST", "OPTIMIZER", "CREATIVE"],
        measure: none ? null : { metric: "clickToLead", value: rate, betterWhen: "higher", campaignId: c.mairoCampaignId },
        priority: 80,
      }),
    );
  }
  return out;
}

// --- 3. Lead quality --------------------------------------------------------------

const REASON_HINTS: Record<string, { explain: (k: number, of: number) => string; recommend: string; step: Omit<PlanStep, "id" | "status" | "priority">; agent: AgentRole }> = {
  "outside-area": {
    explain: (k, of) => `${k} of the ${of} leads you marked not a fit were outside your service area.`,
    recommend: "Check the campaign's location settings so the ads reach only the area you serve.",
    step: { title: "Check where the ads are shown", detail: "Compare the campaign's location with the area you actually serve.", kind: "review", risk: "LOW", approval: "Any change to who sees the ads needs your approval first.", benefit: "May mean fewer leads you can't serve.", verify: "Fewer leads marked outside your area.", href: "/dashboard/campaigns" },
    agent: "AUDIENCE",
  },
  "wrong-service": {
    explain: (k, of) => `${k} of the ${of} leads you marked not a fit wanted something you don't offer.`,
    recommend: "Make the ads say exactly what you do — and what you don't.",
    step: { title: "Prepare ad wording that names your service plainly", detail: "Your Creative Agent writes a version that sets clear expectations.", kind: "creative", risk: "LOW", approval: "Your approval before it runs.", benefit: "May mean fewer enquiries for things you don't do.", verify: "Fewer leads marked as wanting something else.", href: "/dashboard/creatives" },
    agent: "CREATIVE",
  },
  price: {
    explain: (k, of) => `${k} of the ${of} leads you marked not a fit stopped over price.`,
    recommend: "Consider showing a starting price, so people who can't afford it don't enquire.",
    step: { title: "Decide whether to show a starting price", detail: "Your Strategy Agent can rework the offer around it.", kind: "review", risk: "LOW", approval: "Nothing changes on Meta without your approval.", benefit: "May mean fewer enquiries that end on price.", verify: "Fewer leads lost over price.", href: "/dashboard/mission" },
    agent: "STRATEGIST",
  },
};

function leadQuality(input: CoachInput): Finding[] {
  const out: Finding[] = [];
  // The two weeks, or four when two aren't enough to say anything.
  let judged = leadsIn(input, "current").filter(isJudged);
  let span = "the last two weeks";
  if (judged.length < MIN.judged) {
    judged = [...judged, ...leadsIn(input, "previous").filter(isJudged)];
    span = "the last four weeks";
  }
  if (judged.length < MIN.judged) return out;
  const good = judged.filter((l) => STAGE[l.status] >= STAGE.QUALIFIED).length;
  const spam = judged.filter((l) => l.status === "SPAM").length;
  const lost = judged.filter((l) => l.status === "LOST");
  const goodShare = good / judged.length;

  // A decline, when both periods have enough marked.
  const now = stageRate(input, "current", "lead-qualified");
  const before = stageRate(input, "previous", "lead-qualified");
  const declined = now && before && before.rate - now.rate >= 0.15;
  if (goodShare >= 0.35 && !declined) return out;

  const explanations: Explanation[] = [];
  const alternatives: string[] = [];
  const steps: PlanStep[] = [];
  const agents = new Set<AgentRole>(["ANALYST", "STRATEGIST"]);
  const reasons = new Map<string, number>();
  for (const l of lost) if (l.lostReason) reasons.set(l.lostReason, (reasons.get(l.lostReason) ?? 0) + 1);
  const ranked = [...reasons.entries()].filter(([k, v]) => v >= 2 && REASON_HINTS[k]).sort((a, b) => b[1] - a[1]);
  let priority = 2;
  for (const [k, v] of ranked) {
    const h = REASON_HINTS[k];
    explanations.push({ text: h.explain(v, lost.length), basis: "evidence" });
    alternatives.push(h.recommend);
    steps.push(step({ ...h.step, priority: priority++ }));
    agents.add(h.agent);
  }
  if (spam >= 3 && spam / judged.length >= 0.3) {
    explanations.push({ text: `${spam} of the ${judged.length} leads you marked were spam.`, basis: "evidence" });
    alternatives.push("Add one question to your form that a real customer answers easily, to slow down junk.");
    steps.push(step({ title: "Add a question that filters out junk", detail: "One extra question — like the job's address — puts off most spam.", kind: "setting", priority: priority++, risk: "LOW", approval: "It's your form; nothing on Meta changes.", benefit: "May cut spam, though a longer form can also mean fewer real enquiries.", verify: "Fewer leads marked spam.", href: "/dashboard/leads" }));
  }
  if (!explanations.length) {
    explanations.push(
      { text: "The ads may be reaching people outside the customers you want.", basis: "possibility" },
      { text: "The ad's wording may be attracting people who want something different.", basis: "possibility" },
    );
  }
  const recommendation = alternatives.shift() ?? "Look through the leads you marked not a fit and note what they had in common, before changing any targeting.";
  if (!steps.length) steps.push(step({ title: "Review the leads that weren't a fit", detail: "Mark why each wasn't a fit — MAIRO then knows which change to suggest.", kind: "review", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "Tells MAIRO whether it's the area, the service, the price or the audience.", verify: "Reasons recorded for most lost leads.", href: "/dashboard/leads" }));
  steps.push(step({ title: "Hold off on more budget", detail: "Your Growth Advisor won't suggest more spend while most leads aren't good ones.", kind: "monitor", priority: 8, risk: "LOW", approval: "Nothing to approve.", benefit: "Keeps money from buying more of the same leads.", verify: "The share of good leads recovers.", href: "/dashboard/decisions" }));
  agents.add("GROWTH");
  steps.push(MONITOR("the share of good leads"));

  out.push(
    finding({
      key: declined ? "quality:declined" : "quality:low",
      category: "LEAD_QUALITY",
      severity: "ATTENTION",
      title: declined ? "Your leads have been less often the right ones lately" : "Most leads aren't turning out to be good ones",
      plain: declined
        ? "You've been marking fewer of your new leads as good ones than before. Your AI team is looking at what changed before suggesting anything."
        : "Your ads are bringing enquiries, but most of the ones you've marked weren't right for your business. That's worth fixing before spending more.",
      noticed: declined
        ? `${share(now!.rate)} of the leads you marked in the last two weeks were good ones, against ${share(before!.rate)} the two weeks before.`
        : `Of the ${judged.length} leads you marked in ${span}, ${good} ${good === 1 ? "was a good one" : "were good ones"} (${share(goodShare)}).${lost.length ? ` ${lost.length} weren't a fit.` : ""}${spam ? ` ${spam} were spam.` : ""}`,
      explanations,
      recommendation,
      alternatives,
      evidence: [
        { label: `Leads you marked (${span.replace("the last ", "")})`, value: String(judged.length) },
        { label: "Good leads", value: `${good} (${share(goodShare)})` },
        ...(lost.length ? [{ label: "Not a fit", value: String(lost.length) }] : []),
        ...(spam ? [{ label: "Spam", value: String(spam) }] : []),
        ...ranked.map(([k, v]) => ({ label: lostReasonLabel(k) ?? k, value: String(v) })),
      ],
      confidence: confidenceFrom(judged.length, MIN.judged),
      limitations: `${LIMIT_CAUSE} It counts only the leads you've marked${judged.length ? "" : ""}; unmarked leads aren't assumed good or bad.`,
      missing: lost.some((l) => !l.lostReason) ? ["Why some leads weren't a fit — mark a reason on each and MAIRO can tell which change to suggest."] : [],
      steps,
      agents: [...agents],
      measure: { metric: "qualifiedShare", value: declined ? now!.rate : goodShare, betterWhen: "higher", campaignId: null },
      priority: 75,
    }),
  );
  return out;
}

// --- 4. Follow-up -----------------------------------------------------------------

/** Whether the business records contacts at all — only then is speed judged. */
const tracksContact = (ls: CoachLead[]) => ls.filter((l) => l.firstContactedAt).length >= MIN.contacted;
/** Whether the business marks what happens to leads at all. */
const marksLeads = (ls: CoachLead[]) => ls.filter((l) => l.status !== "NEW").length >= 3;

function followUp(input: CoachInput): Finding[] {
  const out: Finding[] = [];
  const all = input.leads;
  const cur = leadsIn(input, "current");
  const prev = leadsIn(input, "previous");

  // Leads nobody has touched after a day — only for a business that marks its leads.
  if (marksLeads(all) || tracksContact(all)) {
    const waiting = cur.filter((l) => l.status === "NEW" && !l.firstContactedAt && input.now.getTime() - l.createdAt.getTime() >= DAY);
    if (waiting.length >= 2) {
      const oldest = Math.max(...waiting.map((l) => (input.now.getTime() - l.createdAt.getTime()) / 3_600_000));
      out.push(
        finding({
          key: "followup:waiting",
          category: "FOLLOW_UP",
          severity: "ATTENTION",
          title: `${n(waiting.length, "lead")} ${waiting.length === 1 ? "hasn't" : "haven't"} been contacted after a day`,
          plain: `${n(waiting.length, "person", "people")} asked about your business more than a day ago and ${waiting.length === 1 ? "hasn't" : "haven't"} been marked as contacted. Getting back to them is the quickest win available.`,
          noticed: `${waiting.length} leads from the last two weeks are still marked new, with no contact logged; the oldest came in ${hours(oldest)} ago.`,
          explanations: [{ text: "They may have been contacted without it being recorded — if so, mark them on the Leads page.", basis: "possibility" }],
          recommendation: "Contact them today, and mark each one as you do.",
          alternatives: ["Set a next follow-up date on each, so MAIRO reminds you."],
          evidence: [{ label: "Waiting over a day", value: String(waiting.length) }, { label: "Longest wait", value: hours(oldest) }],
          confidence: "STRONG",
          limitations: "Based only on what's marked on the Leads page.",
          steps: [step({ title: "Contact the waiting leads", detail: "They're flagged on the Leads page. Mark each as contacted when you do.", kind: "contact", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "People who asked recently are more likely to still want help.", verify: "No leads waiting more than a day.", href: "/dashboard/leads" })],
          agents: ["ANALYST"],
          measure: { metric: "waitingForContact", value: waiting.length, betterWhen: "lower", campaignId: null },
          priority: 88,
        }),
      );
    }
  }

  if (!tracksContact(all)) return out;
  const curH = cur.map(responseHours).filter((h): h is number => h !== null);
  const prevH = prev.map(responseHours).filter((h): h is number => h !== null);
  if (curH.length < MIN.contacted) return out;
  const m = median(curH)!;
  const pm = prevH.length >= MIN.contacted ? median(prevH)! : null;
  const slower = pm !== null && m >= pm * 1.5 && m - pm >= 4;
  const slow = pm === null && m >= 24;
  if (!slower && !slow) return out;
  out.push(
    finding({
      key: "followup:slower",
      category: "FOLLOW_UP",
      severity: slower ? "ATTENTION" : "WATCH",
      title: slower ? "New leads are being contacted more slowly" : "It usually takes over a day to reach a new lead",
      plain: slower
        ? "It's taking longer to get back to people than it did before. Someone asking for a quote often asks more than one business, so the wait may cost you jobs."
        : "New leads typically wait more than a day for a first contact. Someone asking for a quote often asks more than one business.",
      noticed: slower ? `Typical time to first contact: ${hours(m)} in the last two weeks, against ${hours(pm!)} before.` : `Typical time to first contact in the last two weeks: ${hours(m)}.`,
      explanations: [
        { text: "A busier stretch, or leads arriving outside working hours.", basis: "possibility" },
        { text: "No reminder when a new lead arrives.", basis: "possibility" },
      ],
      recommendation: "Aim to contact each new lead the same day — the Leads page flags anyone waiting.",
      alternatives: ["Turn on text alerts for new leads in your notification settings, if you haven't."],
      evidence: [
        { label: "Typical wait, last 2 weeks", value: hours(m) },
        ...(pm !== null ? [{ label: "Typical wait, 2 weeks before", value: hours(pm) }] : []),
        { label: "Contacts logged", value: String(curH.length) },
      ],
      confidence: confidenceFrom(Math.min(curH.length, pm !== null ? prevH.length : curH.length), MIN.contacted),
      limitations: "Measured only from contacts you logged on the Leads page; a call you didn't log isn't counted.",
      steps: [
        step({ title: "Reach new leads the same day", detail: "Check the Leads page each morning and afternoon.", kind: "contact", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "May turn more enquiries into appointments.", verify: "The typical wait drops.", href: "/dashboard/leads" }),
        step({ title: "Get alerted when a lead arrives", detail: "Choose how MAIRO tells you.", kind: "setting", priority: 2, risk: "LOW", approval: "Nothing to approve.", benefit: "Fewer leads waiting unnoticed.", verify: "The typical wait drops.", href: "/dashboard/notifications" }),
        MONITOR("the typical time to first contact", 14),
      ],
      agents: ["ANALYST", "STRATEGIST"],
      measure: { metric: "medianResponseHours", value: m, betterWhen: "lower", campaignId: null },
      priority: 70,
    }),
  );
  return out;
}

// --- 5. Sales: bookings and estimates -----------------------------------------------

function sales(input: CoachInput, slowerFollowUp: boolean): Finding[] {
  const out: Finding[] = [];
  const usesBooking = input.leads.some((l) => STAGE[l.status] >= STAGE.BOOKED);
  if (usesBooking) {
    const now = stageRate(input, "current", "qualified-appointment");
    const before = stageRate(input, "previous", "qualified-appointment");
    if (now && before && before.rate - now.rate >= 0.2) {
      const explanations: Explanation[] = [];
      if (slowerFollowUp) explanations.push({ text: "Leads were also contacted more slowly in the same period.", basis: "evidence" });
      const lostPrice = leadsIn(input, "current").filter((l) => l.lostReason === "price" || l.lostReason === "not-ready").length;
      if (lostPrice >= 2) explanations.push({ text: `${lostPrice} recent leads were lost over price or not being ready.`, basis: "evidence" });
      explanations.push({ text: "Booking may be harder than it needs to be — few times offered, or a slow reply.", basis: "possibility" });
      out.push(
        finding({
          key: "sales:booking-rate",
          category: "SALES",
          severity: "ATTENTION",
          title: "Fewer good leads are booking an appointment",
          plain: "You're getting good leads, but fewer of them are booking than before. That happens after the ad, so your AI team recommends looking at follow-up before changing the ads or the budget.",
          noticed: `${share(now.rate)} of good leads booked in the last two weeks, against ${share(before.rate)} the two weeks before (leads at least a week old).`,
          explanations,
          recommendation: "Look at the good leads that didn't book, and offer a couple of specific times when you reply.",
          alternatives: ["Follow up a second time with leads that went quiet after the first contact."],
          evidence: [
            { label: "Good leads that booked, before → now", value: `${share(before.rate)} → ${share(now.rate)}` },
            { label: "Good leads compared", value: `${before.sample} and ${now.sample}` },
          ],
          confidence: confidenceFrom(Math.min(now.sample, before.sample), MIN.qualified),
          limitations: `Counts leads at least ${MATURE_DAYS.appointment} days old, so newer ones have time to book. ${LIMIT_CAUSE}`,
          steps: [
            step({ title: "Review the good leads that didn't book", detail: "Look for a pattern: slow reply, price, timing.", kind: "review", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "Shows what's stopping bookings.", verify: "Reasons noted on most of them.", href: "/dashboard/leads" }),
            step({ title: "Hold off on more ad spend", detail: "Your Growth Advisor won't suggest more budget until bookings recover.", kind: "monitor", priority: 2, risk: "LOW", approval: "Nothing to approve.", benefit: "Avoids paying for more leads that don't book.", verify: "The booking rate recovers.", href: "/dashboard/decisions" }),
            MONITOR("the share of good leads that book", 14),
          ],
          agents: ["ANALYST", "STRATEGIST", "GROWTH"],
          measure: { metric: "appointmentShare", value: now.rate, betterWhen: "higher", campaignId: null },
          priority: 72,
        }),
      );
    }
  }
  const stalled = input.leads.filter((l) => l.status === "ESTIMATE_SENT" && input.now.getTime() - (l.statusChangedAt ?? l.createdAt).getTime() >= 14 * DAY);
  if (stalled.length >= 3) {
    const value = stalled.reduce((a, l) => a + (l.estimatedValueCents ?? 0), 0);
    out.push(
      finding({
        key: "sales:estimates-stalled",
        category: "SALES",
        severity: "ATTENTION",
        title: `${stalled.length} estimates have had no answer for two weeks or more`,
        plain: `You've sent ${n(stalled.length, "estimate")} that ${stalled.length === 1 ? "hasn't" : "haven't"} been answered in two weeks. A friendly follow-up is often all it takes to hear back.`,
        noticed: `${stalled.length} leads have been at "${input.labels.ESTIMATE_SENT}" for 14 days or more${value ? `, worth about ${usd(value)} by your own estimates` : ""}.`,
        explanations: [{ text: "Some may have been decided without being marked — mark them won or lost if so.", basis: "possibility" }],
        recommendation: "Follow up on each open estimate this week.",
        evidence: [{ label: "Open for 14+ days", value: String(stalled.length) }, ...(value ? [{ label: "Your estimates' value", value: usd(value) }] : [])],
        confidence: "STRONG",
        limitations: "Based on what's marked on the Leads page. Values are your own estimates, not revenue.",
        steps: [step({ title: "Follow up on open estimates", detail: "They're on the Leads page.", kind: "contact", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "May bring answers on work already quoted.", verify: "Fewer estimates open for two weeks.", href: "/dashboard/leads" })],
        agents: ["ANALYST", "STRATEGIST"],
        measure: { metric: "stalledEstimates", value: stalled.length, betterWhen: "lower", campaignId: null },
        priority: 74,
      }),
    );
  }
  return out;
}

// --- 6. Budget efficiency ---------------------------------------------------------

function costTrend(input: CoachInput, cur: Funnel, prev: Funnel): Finding[] {
  const out: Finding[] = [];
  if (!cur.spendCents || !prev.spendCents || cur.spendCents < MIN.spendCents || prev.spendCents < MIN.spendCents) return out;
  const quals = (w: "current" | "previous") => leadsIn(input, w).filter((l) => STAGE[l.status] >= STAGE.QUALIFIED && input.now.getTime() - l.createdAt.getTime() >= MATURE_DAYS.qualified * DAY).length;
  const qNow = quals("current");
  const qBefore = quals("previous");
  const byQualified = qNow >= MIN.qualified && qBefore >= MIN.qualified;
  const leadsNow = cur.leadSource === "recorded" ? cur.leads : cur.metaLeads ?? 0;
  const leadsBefore = prev.leadSource === "recorded" ? prev.leads : prev.metaLeads ?? 0;
  const byLeads = !byQualified && leadsNow >= 10 && leadsBefore >= 10;
  if (!byQualified && !byLeads) return out;
  const costNow = per(cur.spendCents, byQualified ? qNow : leadsNow)!;
  const costBefore = per(prev.spendCents, byQualified ? qBefore : leadsBefore)!;
  const ch = change(costNow, costBefore)!;
  const what = byQualified ? "good lead" : "lead";

  if (ch <= -0.2) {
    out.push(
      finding({
        key: byQualified ? "cost:qualified-improving" : "cost:lead-improving",
        category: "OPPORTUNITY",
        severity: "OPPORTUNITY",
        title: `Each ${what} is costing less than before`,
        plain: `Your ads are getting you ${what}s more cheaply than two weeks ago. Your Growth Advisor is watching whether it holds before suggesting more budget.`,
        noticed: `About ${usd(costNow)} per ${what} in the last two weeks, against ${usd(costBefore)} before.`,
        explanations: [{ text: "Recent changes, a better-performing ad, or a quieter time for competitors.", basis: "possibility" }],
        recommendation: "Keep things as they are for now. If it holds for another week, MAIRO may suggest more budget — with the numbers, and only with your approval.",
        evidence: [{ label: `Cost per ${what}, before → now`, value: `${usd(costBefore)} → ${usd(costNow)}` }, { label: `${what[0].toUpperCase()}${what.slice(1)}s compared`, value: `${byQualified ? qBefore : leadsBefore} and ${byQualified ? qNow : leadsNow}` }],
        confidence: confidenceFrom(Math.min(byQualified ? qNow : leadsNow, byQualified ? qBefore : leadsBefore), byQualified ? MIN.qualified : 10),
        limitations: `${LIMIT_META} ${LIMIT_CAUSE}${byQualified ? "" : " Based on all leads, not only good ones — mark your leads so MAIRO can judge by good leads."}`,
        steps: [MONITOR(`the cost per ${what}`)],
        agents: ["ANALYST", "GROWTH"],
        measure: { metric: byQualified ? "costPerQualified" : "costPerLead", value: costNow, betterWhen: "lower", campaignId: null },
        priority: 40,
      }),
    );
    return out;
  }
  if (ch < 0.25) return out;

  // What moved along the way, each only when its own samples allow.
  const contributions: { text: string; size: number; agent: AgentRole; rec: string; step: Omit<PlanStep, "id" | "status" | "priority"> }[] = [];
  const allCur = input.campaigns.map((c) => c.current);
  const allPrev = input.campaigns.map((c) => c.previous);
  const agg = (ms: (PlatformMetrics | null)[]) => ({
    impressions: ms.reduce((a, m) => a + (m?.impressions ?? 0), 0),
    clicks: ms.reduce((a, m) => a + (m?.clicks ?? 0), 0),
    spend: ms.reduce((a, m) => a + (m?.spendCents ?? 0), 0),
  });
  const a = agg(allCur);
  const b = agg(allPrev);
  if (a.impressions >= MIN.impressions && b.impressions >= MIN.impressions) {
    const cpmCh = change(a.spend / a.impressions, b.spend / b.impressions)!;
    if (cpmCh >= 0.15) contributions.push({ text: `Showing your ads cost ${pctText(cpmCh)} more per thousand views.`, size: cpmCh, agent: "AUDIENCE", rec: "Ask your Audience Agent to check whether the audience is getting saturated.", step: { title: "Check the audience", detail: "Your Audience Agent looks at reach and how often people see the ads.", kind: "review", risk: "LOW", approval: "Any change to who sees the ads needs your approval.", benefit: "May bring the cost of reaching people down.", verify: "Cost per thousand views settles.", href: "/dashboard/team?agent=AUDIENCE#activity" } });
    const ctrCh = change(a.clicks / a.impressions, b.clicks / b.impressions)!;
    if (ctrCh <= -0.15) contributions.push({ text: `People clicked the ads ${pctText(ctrCh)} less often.`, size: -ctrCh, agent: "CREATIVE", rec: "Test a fresh ad alongside the current one, without raising your budget.", step: { title: "Test a fresh ad", detail: "Your Creative Agent prepares a new version to run alongside the current one.", kind: "creative", risk: "LOW", approval: "Your approval before it runs. Your total budget stays the same.", benefit: "May win back clicks if the current ad has gone stale.", verify: "The new ad's clicks against the old one's, same week.", href: "/dashboard/creatives" } });
  }
  if (a.clicks >= MIN.clicks && b.clicks >= MIN.clicks && leadsNow && leadsBefore) {
    const convCh = change(leadsNow / a.clicks, leadsBefore / b.clicks)!;
    if (convCh <= -0.15) contributions.push({ text: `Fewer clicks turned into leads (${pctText(convCh)} fewer).`, size: -convCh, agent: "OPTIMIZER", rec: "Check the form or page people land on.", step: { title: "Try the form or page yourself", detail: "Go through it on your phone as a customer would.", kind: "review", risk: "LOW", approval: "Nothing to approve.", benefit: "May uncover a problem after the click.", verify: "The share of clicks that convert recovers.", href: "/dashboard/leads" } });
  }
  if (byQualified) {
    const shNow = stageRate(input, "current", "lead-qualified");
    const shBefore = stageRate(input, "previous", "lead-qualified");
    if (shNow && shBefore && shBefore.rate - shNow.rate >= 0.1) contributions.push({ text: `A smaller share of leads were good ones (${share(shBefore.rate)} → ${share(shNow.rate)}).`, size: (shBefore.rate - shNow.rate) / shBefore.rate, agent: "STRATEGIST", rec: "Review the leads that weren't a fit before changing targeting.", step: { title: "Review the leads that weren't a fit", detail: "Mark why — area, service, price — so MAIRO can suggest the right change.", kind: "review", risk: "LOW", approval: "Nothing to approve.", benefit: "Points to the change most likely to help.", verify: "Reasons recorded.", href: "/dashboard/leads" } });
  }
  contributions.sort((x, y) => y.size - x.size);
  const explanations: Explanation[] = contributions.map((c) => ({ text: c.text, basis: "evidence" }));
  if (!explanations.length) explanations.push({ text: "No single step moved enough to say which one is responsible yet.", basis: "possibility" });
  const steps = contributions.map((c, i) => step({ ...c.step, priority: i + 1 }));
  steps.push(step({ title: "Hold off on more budget", detail: "Your Growth Advisor won't suggest more spend while costs are rising.", kind: "monitor", priority: 8, risk: "LOW", approval: "Nothing to approve.", benefit: "Keeps money from buying leads at the higher cost.", verify: `The cost per ${what} comes back down.`, href: "/dashboard/decisions" }));
  steps.push(MONITOR(`the cost per ${what}`));
  const agents = new Set<AgentRole>(["ANALYST", "OPTIMIZER", "GROWTH", ...contributions.map((c) => c.agent)]);
  out.push(
    finding({
      key: byQualified ? "cost:qualified-rising" : "cost:lead-rising",
      category: "BUDGET",
      severity: "ATTENTION",
      title: `Each ${what} is costing more than before`,
      plain: `Your advertising is getting more expensive at bringing in ${what}s. Your AI team looked at each step to see where it changed${contributions.length ? "" : ", and nothing stands out yet"}.`,
      noticed: `About ${usd(costNow)} per ${what} in the last two weeks, against ${usd(costBefore)} before (${pctText(ch)} more).`,
      explanations,
      recommendation: contributions[0]?.rec ?? "Keep the budget as it is and watch another week before changing anything.",
      alternatives: contributions.slice(1).map((c) => c.rec),
      evidence: [
        { label: `Cost per ${what}, before → now`, value: `${usd(costBefore)} → ${usd(costNow)}` },
        { label: "Spent, before → now", value: `${usd(prev.spendCents)} → ${usd(cur.spendCents)}` },
        { label: `${what[0].toUpperCase()}${what.slice(1)}s, before → now`, value: `${byQualified ? qBefore : leadsBefore} → ${byQualified ? qNow : leadsNow}` },
      ],
      confidence: confidenceFrom(Math.min(byQualified ? qNow : leadsNow, byQualified ? qBefore : leadsBefore), byQualified ? MIN.qualified : 10),
      limitations: `${LIMIT_META} ${LIMIT_CAUSE}`,
      missing: byQualified ? [] : ["Which leads were good ones — mark your leads and MAIRO judges cost per good lead, which matters more than cost per form."],
      steps,
      agents: [...agents],
      measure: { metric: byQualified ? "costPerQualified" : "costPerLead", value: costNow, betterWhen: "lower", campaignId: null },
      priority: 78,
    }),
  );
  return out;
}

/** A lead campaign whose leads haven't been good ones, after real spend. */
function noGoodLeads(input: CoachInput): Finding[] {
  const out: Finding[] = [];
  for (const c of input.campaigns) {
    if (c.objective !== "LEADS" || c.status !== "ACTIVE") continue;
    const judged = [...leadsIn(input, "current", c.mairoCampaignId), ...leadsIn(input, "previous", c.mairoCampaignId)].filter(isJudged);
    const spend = (c.current?.spendCents ?? 0) + (c.previous?.spendCents ?? 0);
    if (judged.length < 6 || spend < 15_000) continue;
    if (judged.some((l) => STAGE[l.status] >= STAGE.QUALIFIED)) continue;
    out.push(
      finding({
        key: `quality:none:${c.mairoCampaignId}`,
        category: "LEAD_QUALITY",
        severity: "ATTENTION",
        ...campaignOf(c),
        title: `None of the leads from "${c.name}" have been good ones`,
        plain: `This campaign has brought leads, but you haven't marked any of them as a good one. Your AI team recommends looking at them before spending more on it.`,
        noticed: `${judged.length} leads from "${c.name}" marked in the last four weeks, none good; ${usd(spend)} spent.`,
        explanations: [
          { text: "The campaign may be reaching people outside the customers you want.", basis: "possibility" },
          { text: "Its ad may promise something different from what you offer.", basis: "possibility" },
        ],
        recommendation: "Review its leads, and consider pausing it until you know why.",
        alternatives: ["Ask your Creative Agent for a version that states your service and area plainly."],
        evidence: [{ label: "Its leads you marked", value: String(judged.length) }, { label: "Good ones", value: "0" }, { label: "Spent (4 weeks)", value: usd(spend) }],
        confidence: confidenceFrom(judged.length, 6),
        limitations: `Only leads known to come from this campaign. ${LIMIT_CAUSE}`,
        steps: [
          step({ title: "Review this campaign's leads", detail: "Mark why each wasn't a fit.", kind: "review", priority: 1, risk: "LOW", approval: "Nothing to approve.", benefit: "Shows what to change.", verify: "Reasons recorded.", href: "/dashboard/leads" }),
          step({ title: "Pause it while you decide", detail: "You can pause it from the campaign page; MAIRO never pauses it without asking unless you've switched on Spend Protection's pause.", kind: "review", priority: 2, risk: "MEDIUM", approval: "Your decision on the campaign page.", benefit: "Stops spend on leads that haven't been good ones.", verify: "No spend while paused.", href: `/dashboard/campaigns/${c.mairoCampaignId}` }),
        ],
        agents: ["ANALYST", "OPTIMIZER", "GUARDIAN"],
        measure: { metric: "qualifiedShare", value: 0, betterWhen: "higher", campaignId: c.mairoCampaignId },
        priority: 82,
      }),
    );
  }
  return out;
}

/**
 * Move budget toward the campaign whose good leads cost less — total budget
 * unchanged, within the business's limits, never on its own: it goes through
 * MAIRO Decisions' approval like every other change on Meta.
 */
function reallocateByQuality(input: CoachInput): Finding[] {
  const g = input.guardrails;
  const eligible = input.campaigns
    .filter((c) => c.objective === "LEADS" && c.status === "ACTIVE" && c.dailyBudgetCents > 0)
    .map((c) => {
      const good = leadsIn(input, "current", c.mairoCampaignId).filter((l) => STAGE[l.status] >= STAGE.QUALIFIED && input.now.getTime() - l.createdAt.getTime() >= MATURE_DAYS.qualified * DAY).length;
      const spend = c.current?.spendCents ?? 0;
      return { c, good, spend, cost: per(spend, good) };
    })
    .filter((x) => x.good >= MIN.qualified && x.spend >= 10_000 && x.cost !== null);
  if (eligible.length < 2) return [];
  const best = eligible.reduce((a, b) => (a.cost! <= b.cost! ? a : b));
  const worst = eligible.reduce((a, b) => (a.cost! >= b.cost! ? a : b));
  if (best === worst || best.cost! > worst.cost! * 0.6) return [];
  // Something like this was tried lately and results got worse: don't repeat it.
  const recent = input.history.worsened.find((w) => (w.kind === "coach-shift-qualified" || w.kind === "shift-budget") && w.mairoCampaignId === best.c.mairoCampaignId && input.now.getTime() - w.at.getTime() < 90 * DAY);
  if (recent) return [];
  const limitPct = Math.min(g.maxBudgetShiftPercent, g.maxDailyDecreasePercent, 20) / 100;
  let move = Math.min(worst.c.dailyBudgetCents * limitPct, best.c.dailyBudgetCents * (g.maxDailyIncreasePercent / 100));
  move = Math.round(Math.min(move, worst.c.dailyBudgetCents - MIN_CAMPAIGN_DAILY_CENTS) / 100) * 100;
  if (move < 100) return [];

  const draft: DecisionDraft = {
    kind: "coach-shift-qualified",
    category: "BUDGET",
    urgent: false,
    mairoCampaignId: best.c.mairoCampaignId,
    platform: best.c.platform,
    title: `Good leads cost less on "${best.c.name}" than on "${worst.c.name}"`,
    noticed: `Each good lead cost about ${usd(best.cost!)} on "${best.c.name}" and ${usd(worst.cost!)} on "${worst.c.name}" in the last two weeks — by the leads you marked.`,
    noticedAdvanced: `Cost per qualified lead (14d, leads ≥${MATURE_DAYS.qualified}d old): ${usd(best.cost!)} (${best.good}) vs ${usd(worst.cost!)} (${worst.good}).`,
    whyItMatters: "Both campaigns are after leads. Judged by the leads you marked good, money on the first goes further.",
    recommendation: `Move ${usd(move)} a day from "${worst.c.name}" to "${best.c.name}". Your total daily budget stays the same.`,
    impact: "More of your budget goes where good leads have cost less. Costs can change as a campaign spends more, and MAIRO compares the results afterwards.",
    risk: "MEDIUM",
    confidence: best.good + worst.good >= 20 ? "HIGH" : "MEDIUM",
    evidence: [
      { label: `Cost per good lead, "${best.c.name}"`, value: usd(best.cost!) },
      { label: `Cost per good lead, "${worst.c.name}"`, value: usd(worst.cost!) },
      { label: "Good leads (2 weeks)", value: `${best.good} and ${worst.good}` },
    ],
    changes: [
      { type: "set-budget", platform: worst.c.platform, mairoCampaignId: worst.c.mairoCampaignId, platformCampaignId: worst.c.platformCampaignId, externalCampaignId: worst.c.externalCampaignId, campaignName: worst.c.name, fromCents: worst.c.dailyBudgetCents, toCents: worst.c.dailyBudgetCents - move },
      { type: "set-budget", platform: best.c.platform, mairoCampaignId: best.c.mairoCampaignId, platformCampaignId: best.c.platformCampaignId, externalCampaignId: best.c.externalCampaignId, campaignName: best.c.name, fromCents: best.c.dailyBudgetCents, toCents: best.c.dailyBudgetCents + move },
    ],
    dedupeKey: `coach-shift:${worst.c.platformCampaignId}>${best.c.platformCampaignId}:${input.current.until.toISOString().slice(0, 10)}`,
    priority: 62,
  };
  return [
    finding({
      key: `budget:quality-shift:${worst.c.mairoCampaignId}>${best.c.mairoCampaignId}`,
      category: "BUDGET",
      severity: "OPPORTUNITY",
      mairoCampaignId: best.c.mairoCampaignId,
      campaignName: best.c.name,
      title: draft.title,
      plain: `Judged by the leads you marked good, "${best.c.name}" gets them for less. Your AI team prepared a budget move that keeps your total the same — it waits for your approval.`,
      noticed: draft.noticed,
      explanations: [{ text: "The cheaper campaign's audience or ad may simply suit your customers better.", basis: "possibility" }],
      recommendation: draft.recommendation,
      alternatives: ["Leave budgets as they are and look at what the cheaper campaign does differently."],
      evidence: draft.evidence.map((e) => ({ label: e.label, value: e.value })),
      confidence: confidenceFrom(Math.min(best.good, worst.good), MIN.qualified),
      limitations: `Uses only leads known to come from each campaign, at least ${MATURE_DAYS.qualified} days old. ${LIMIT_CAUSE}`,
      steps: [
        step({ title: "Approve the budget move", detail: draft.recommendation, kind: "meta-change", priority: 1, risk: "MEDIUM", approval: "Your approval. Budget Guardian has checked it against your limits; total daily spend doesn't change.", benefit: "May bring more good leads for the same money — not guaranteed.", verify: "Cost per good lead across both campaigns, two weeks after.", href: "/dashboard/decisions" }),
        MONITOR("the cost per good lead on both campaigns", 14),
      ],
      agents: ["ANALYST", "OPTIMIZER", "GUARDIAN", "ARCHITECT", "GROWTH"],
      change: draft,
      measure: { metric: "costPerQualified", value: per((best.spend + worst.spend), best.good + worst.good) ?? 0, betterWhen: "lower", campaignId: null },
      priority: 60,
    }),
  ];
}

// --- 7. Creative and audience -----------------------------------------------------

function creativeAndAudience(input: CoachInput): Finding[] {
  const out: Finding[] = [];
  for (const c of input.campaigns) {
    if (c.status !== "ACTIVE") continue;
    const ok = (c.current?.impressions ?? 0) >= MIN.impressions && (c.previous?.impressions ?? 0) >= MIN.impressions;
    if (!ok) continue;
    const ctrNow = ctr(c.current);
    const ctrBefore = ctr(c.previous);
    const f = freq(c.current);
    const ctrCh = ctrNow !== null && ctrBefore ? change(ctrNow, ctrBefore) : null;
    const ads = c.ads.filter((a) => (a.metrics?.impressions ?? 0) >= 1000 && ctr(a.metrics) !== null);
    const bestAd = ads.length >= 2 ? ads.reduce((a, b) => (ctr(a.metrics)! >= ctr(b.metrics)! ? a : b)) : null;
    const worstAd = ads.length >= 2 ? ads.reduce((a, b) => (ctr(a.metrics)! <= ctr(b.metrics)! ? a : b)) : null;
    const adGap = bestAd && worstAd && bestAd !== worstAd && ctr(worstAd.metrics)! > 0 ? ctr(bestAd.metrics)! / ctr(worstAd.metrics)! : null;

    if (ctrCh !== null && ctrCh <= -0.25) {
      const explanations: Explanation[] = [];
      if (f !== null && f >= 3) explanations.push({ text: `On average, each person has seen these ads ${f.toFixed(1)} times — a sign people may be tiring of them.`, basis: "evidence" });
      if (adGap && adGap >= 1.6) explanations.push({ text: `${bestAd!.label} is clicked ${adGap.toFixed(1)} times as often as ${worstAd!.label}.`, basis: "evidence" });
      explanations.push({ text: "A competitor's offer or the season may be pulling attention away.", basis: "possibility" });
      out.push(
        finding({
          key: `creative:ctr:${c.mairoCampaignId}`,
          category: "CREATIVE",
          severity: "ATTENTION",
          ...campaignOf(c),
          title: `People are clicking "${c.name}" less often`,
          plain: "Fewer of the people who see this ad are clicking it than two weeks ago. Your Creative Agent can prepare a fresh version to test — nothing runs without your approval.",
          noticed: `${(ctrNow! * 100).toFixed(2)}% of views became clicks in the last two weeks, against ${(ctrBefore! * 100).toFixed(2)}% before.`,
          explanations,
          recommendation: adGap && adGap >= 1.6 ? `Put more weight on ${bestAd!.label}, and test a fresh ad in place of ${worstAd!.label}.` : "Test a fresh ad alongside the current one, without raising your budget.",
          alternatives: ["Refresh the picture and keep the words — then you'll know which mattered."],
          evidence: [
            { label: "Clicks per 100 views, before → now", value: `${(ctrBefore! * 100).toFixed(2)} → ${(ctrNow! * 100).toFixed(2)}` },
            ...(f !== null ? [{ label: "Times each person saw it (avg.)", value: f.toFixed(1) }] : []),
            ...(adGap ? [{ label: `${bestAd!.label} vs ${worstAd!.label}`, value: `${adGap.toFixed(1)}× the clicks per view` }] : []),
          ],
          confidence: confidenceFrom(Math.min(c.current!.clicks ?? 0, c.previous!.clicks ?? 0), 50),
          limitations: `${LIMIT_META} ${LIMIT_CAUSE}`,
          steps: [
            step({ title: "Test a fresh ad", detail: "Your Creative Agent prepares it; it runs alongside the current one so the two can be compared fairly in the same weeks.", kind: "creative", priority: 1, risk: "LOW", approval: "Your approval before it runs. Your total budget stays the same.", benefit: "May win back clicks.", verify: "The new ad's clicks per view against the current ad's, same period.", href: "/dashboard/creatives" }),
            MONITOR("clicks per view"),
          ],
          agents: ["ANALYST", "CREATIVE", "OPTIMIZER"],
          measure: { metric: "ctr", value: ctrNow!, betterWhen: "higher", campaignId: c.mairoCampaignId },
          priority: 65,
        }),
      );
      continue;
    }
    const cpmNow = cpm(c.current);
    const cpmBefore = cpm(c.previous);
    const cpmCh = cpmNow !== null && cpmBefore ? change(cpmNow, cpmBefore) : null;
    if (f !== null && f >= 3.5 && cpmCh !== null && cpmCh >= 0.25) {
      out.push(
        finding({
          key: `audience:saturation:${c.mairoCampaignId}`,
          category: "AUDIENCE",
          severity: "WATCH",
          ...campaignOf(c),
          title: `"${c.name}" keeps reaching the same people, at a rising cost`,
          plain: "The same people are seeing this ad again and again, and reaching them is getting more expensive. Your Audience Agent suggests widening who can see it, with your approval.",
          noticed: `Each person saw the ads ${f.toFixed(1)} times on average; showing them cost ${pctText(cpmCh)} more per thousand views than before.`,
          explanations: [
            { text: `The audience may be too small for the budget — the average of ${f.toFixed(1)} views per person points that way.`, basis: "evidence" },
            { text: "More advertisers competing for the same people this time of year.", basis: "possibility" },
          ],
          recommendation: "Let Meta reach a wider audience, or test a fresh ad.",
          alternatives: ["Lower the budget slightly to match the audience's size."],
          evidence: [
            { label: "Views per person", value: f.toFixed(1) },
            { label: "Cost per 1,000 views, before → now", value: `${usd(Math.round(cpmBefore!))} → ${usd(Math.round(cpmNow!))}` },
          ],
          confidence: confidenceFrom(Math.min(c.current!.impressions ?? 0, c.previous!.impressions ?? 0) / 300, 10),
          limitations: `Meta doesn't break this down by placement or by person for MAIRO. ${LIMIT_CAUSE}`,
          missing: ["How results differ by placement (Feed, Stories, Reels) — MAIRO doesn't read that breakdown yet."],
          steps: [
            step({ title: "Widen the audience", detail: "Your Audience Agent prepares the change; it waits for your approval on the Recommendations page.", kind: "meta-change", priority: 1, risk: "MEDIUM", approval: "Your approval before anything changes on Meta.", benefit: "May bring the cost of reaching people down.", verify: "Views per person and cost per thousand views, a week after.", href: "/dashboard/decisions" }),
            MONITOR("the cost per thousand views"),
          ],
          agents: ["ANALYST", "AUDIENCE"],
          measure: { metric: "cpm", value: cpmNow!, betterWhen: "lower", campaignId: c.mairoCampaignId },
          priority: 50,
        }),
      );
    }
  }
  return out;
}

// --- What MAIRO can't see yet -------------------------------------------------------

function gaps(input: CoachInput, cur: Funnel): Gap[] {
  const out: Gap[] = [];
  const recent = [...leadsIn(input, "current"), ...leadsIn(input, "previous")];
  const leadBusiness = input.campaigns.some((c) => c.objective === "LEADS") || recent.length > 0;
  const salesBusiness = input.campaigns.some((c) => c.objective === "SALES");
  if (input.tracking.pixel === "none") out.push({ key: "no-pixel", title: "Set up your Meta pixel", why: "Without it, Meta can't count results from your website, and MAIRO can't tell which ads work.", href: "/dashboard/tracking" });
  else if (input.tracking.pixel === "stopped") out.push({ key: "pixel-stopped", title: "Your pixel has gone quiet", why: "Nothing has reached Meta from your website lately.", href: "/dashboard/tracking" });
  if (leadBusiness && recent.length >= 3 && recent.filter((l) => l.status !== "NEW").length / recent.length < 0.3)
    out.push({ key: "mark-leads", title: "Mark what happens to your leads", why: "Only you know which leads were good, booked or became customers. Until most are marked, MAIRO can only judge your ads by form fills.", href: "/dashboard/leads" });
  if (leadBusiness && recent.length >= 5 && !recent.some((l) => l.firstContactedAt))
    out.push({ key: "log-contacts", title: "Log when you contact a lead", why: "Then MAIRO can tell you if follow-up is getting slower — one of the most common reasons leads go cold.", href: "/dashboard/leads" });
  if (recent.some((l) => l.status === "WON") && !recent.some((l) => (l.valueCents ?? 0) > 0))
    out.push({ key: "sale-values", title: "Add what each customer was worth", why: "Then MAIRO can show what your ads really brought in, not just how many customers.", href: "/dashboard/leads" });
  const leadCampaigns = input.campaigns.filter((c) => c.objective === "LEADS");
  if (leadCampaigns.length > 1 && recent.length >= 5 && recent.filter((l) => l.mairoCampaignId).length / recent.length < 0.5)
    out.push({ key: "attribution", title: "Most leads aren't linked to a campaign", why: "Leads from ads MAIRO built from now on carry their campaign. Older ones, and leads from elsewhere, can't be split by campaign.", href: "/dashboard/leads" });
  if (salesBusiness && !input.tracking.storeConnected && cur.metaPurchases !== null)
    out.push({ key: "store", title: "Connect your store", why: "Meta's sales count is Meta's estimate. Your store's own orders are the verified figure.", href: "/dashboard/tracking" });
  return out;
}

/** The whole investigation. */
export function diagnose(input: CoachInput): CoachResult {
  const current = funnelFor(input, "current");
  const previous = funnelFor(input, "previous");
  const follow = followUp(input);
  const findings = [
    ...trackingGap(input, current),
    ...clicksNotConverting(input),
    ...leadQuality(input),
    ...noGoodLeads(input),
    ...follow,
    ...sales(input, follow.some((f) => f.key === "followup:slower" && f.severity === "ATTENTION")),
    ...costTrend(input, current, previous),
    ...reallocateByQuality(input),
    ...creativeAndAudience(input),
  ]
    .filter((f) => !input.history.dismissedKeys.includes(f.key))
    .sort((a, b) => b.priority - a.priority);

  const summaryBits: string[] = [];
  if (current.leads > 0) {
    const parts = [current.qualified ? `${current.qualified} good` : null, current.appointments ? `${current.appointments} booked` : null, current.customers ? n(current.customers, "customer") : null].filter(Boolean);
    summaryBits.push(
      current.judged === 0
        ? `Your ads brought ${n(current.leads, "lead")} in the last two weeks. None is marked yet, so MAIRO can't tell which became good leads or customers.`
        : `Followed ${n(current.leads, "lead")} from the last two weeks${parts.length ? `: ${parts.join(", ")}` : ""}${current.unmarked ? ` (${current.unmarked} not marked yet)` : ""}.`,
    );
  } else if (current.metaLeads) {
    summaryBits.push(`Meta reported ${n(current.metaLeads, "lead")} in the last two weeks; none is stored in MAIRO, so what became of them isn't known.`);
  } else if (current.spendCents) {
    summaryBits.push(`Read ${usd(current.spendCents)} of spend over the last two weeks.`);
  }
  const funnelLine = summaryBits.length ? summaryBits.join(" ") : null;
  const attention = findings.filter((f) => f.severity === "ATTENTION");
  summaryBits.push(attention.length ? `Found ${n(attention.length, "thing")} worth your attention, starting with: ${attention[0].title.toLowerCase()}.` : findings.length ? `Nothing urgent; ${n(findings.length, "thing")} to keep an eye on.` : "Nothing that needs changing right now.");

  return {
    current,
    previous,
    steps: stepChanges(input),
    whereItDrops: whereItDrops(input),
    findings,
    gaps: gaps(input, current),
    funnelLine,
    summary: summaryBits.join(" "),
  };
}

/** A metric's value now, for checking whether an approved plan helped. */
export function measureNow(input: CoachInput, m: Measure): { value: number; enough: boolean } | null {
  const cur = funnelFor(input, "current", m.campaignId);
  const camp = m.campaignId ? input.campaigns.find((c) => c.mairoCampaignId === m.campaignId) ?? null : null;
  switch (m.metric) {
    case "waitingForContact":
      return { value: cur.waitingForContact, enough: true };
    case "stalledEstimates":
      return { value: input.leads.filter((l) => l.status === "ESTIMATE_SENT" && input.now.getTime() - (l.statusChangedAt ?? l.createdAt).getTime() >= 14 * DAY).length, enough: true };
    case "medianResponseHours":
      return cur.medianResponseHours === null ? null : { value: cur.medianResponseHours, enough: cur.responseSample >= MIN.contacted };
    case "qualifiedShare": {
      const r = stageRate(input, "current", "lead-qualified", m.campaignId);
      return r ? { value: r.rate, enough: true } : null;
    }
    case "appointmentShare": {
      const r = stageRate(input, "current", "qualified-appointment", m.campaignId);
      return r ? { value: r.rate, enough: true } : null;
    }
    case "costPerQualified":
      return cur.costPerQualifiedCents === null ? null : { value: cur.costPerQualifiedCents, enough: cur.qualified >= MIN.qualified };
    case "costPerLead":
      return cur.costPerLeadCents === null ? null : { value: cur.costPerLeadCents, enough: (cur.leadSource === "recorded" ? cur.leads : cur.metaLeads ?? 0) >= 10 };
    case "clickToLead": {
      const r = stageRate(input, "current", "click-lead", m.campaignId);
      return r ? { value: r.rate, enough: true } : null;
    }
    case "ctr": {
      const v = ctr(camp?.current ?? null);
      return v === null ? null : { value: v, enough: (camp?.current?.impressions ?? 0) >= MIN.impressions };
    }
    case "cpm": {
      const v = cpm(camp?.current ?? null);
      return v === null ? null : { value: v, enough: (camp?.current?.impressions ?? 0) >= MIN.impressions };
    }
  }
}
