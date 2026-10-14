import { businessTypeFrom } from "@/lib/onboarding/business-types";
import { FACT_LABEL, buildPreview, emptyFacts, kindOf, type FactKey, type Preview, type PreviewFacts, type PreviewGoal } from "@/lib/preview/build";
import { conceptFromDirection, type PlanConcept, type PlanSource } from "@/lib/preview/plan-concepts";
import { budgetPlan, firstMonth, GOAL_OPTIONS, type BudgetInput, type BudgetPlan, type PlanWeek } from "@/lib/preview/strategy";
import type { SavedPlan } from "@/lib/preview/saved-plan";

// The free AI ad plan as the visitor reads it, sections A to F, built from
// a saved plan (what they gave, what the website reading saw and what MAIRO
// wrote). Everything except the written parts is deterministic, so the live
// report, a shared link and a downloaded copy say exactly the same thing.
//
// Three kinds of statement, kept apart and labelled on the page: facts (the
// visitor's own words, or their website's), MAIRO's suggestions (what it
// recommends — never a fact about the business), and what MAIRO's reading of
// the website actually saw (the only technical claims). No forecasts.
//
// Pure: the report component, the shared page and scripts/check-report.ts.

const FACT_ORDER: FactKey[] = ["name", "offering", "customer", "location", "offer", "proof", "problem"];

export type FactLine = { key: FactKey; label: string; value: string; from: "website" | "you" };

export type PlanReport = {
  goal: PreviewGoal;
  goalLabel: string;
  name: string;
  business: {
    offering: string;
    /** The facts, each with where it came from. */
    facts: FactLine[];
    /** What makes it appealing: MAIRO's reading of the facts. */
    appeal: string[];
    /** Who's likely to buy: the visitor's words when given, else MAIRO's suggestion — and which. */
    customers: { text: string; from: "website" | "you" | "suggestion" };
    opportunities: { title: string; detail: string }[];
    /** What MAIRO assumed because something wasn't said. */
    assumptions: string[];
    kindLabel: string;
  };
  strategy: {
    objective: string;
    optimiseFor: string;
    campaign: string;
    placements: string[];
    placementsWhy: string;
    audience: string;
    destination: string;
    messaging: string[];
    structure: string[];
    why: { title: string; text: string }[];
    learning: string;
  };
  budget: BudgetPlan;
  concepts: { list: PlanConcept[]; first: number; firstWhy: string; source: PlanSource; filled: number; dropped: string[] };
  website: {
    read: boolean;
    url: string | null;
    pagesRead: number;
    platform: string | null;
    /** What the reading saw where it matters for ads, each a plain observation. */
    seen: { label: string; value: string; ok: boolean | null }[];
    findings: SavedPlan["findings"];
  };
  month: PlanWeek[];
};

/** The PreviewFacts a saved plan stands for, sources included. */
export function factsOf(p: SavedPlan): PreviewFacts {
  const f: PreviewFacts = { ...emptyFacts(p.inputs.website), goal: p.inputs.goal, monthlyBudget: p.inputs.monthly, businessType: businessTypeFrom(p.facts.businessType)?.id ?? "", typeFrom: p.facts.businessType ? "you" : null, pixelSeen: p.facts.pixelSeen, destinations: p.facts.destinations, sources: {} };
  for (const k of FACT_ORDER) {
    f[k] = p.facts[k] ?? "";
    if (f[k]) f.sources[k] = p.facts.fromWebsite.includes(k) ? { from: "website", url: p.inputs.website, quote: null } : { from: "you" };
  }
  if (!f.offering) {
    f.offering = p.inputs.sells;
    f.sources.offering = { from: "you" };
  }
  return f;
}

export function budgetInputOf(p: SavedPlan, preview: Preview): BudgetInput {
  return { monthly: p.inputs.monthly, goal: p.inputs.goal, kind: preview.kind, hasWebsite: Boolean(p.inputs.website), pixelSeen: p.facts.pixelSeen, usesLeadForm: p.inputs.goal === "leads" && !p.facts.destinations?.form };
}

/** Where the ads appear, for this goal — a recommendation, said with its reason. */
export function placementsFor(goal: PreviewGoal, hasWebsite: boolean): { list: string[]; why: string } {
  switch (goal) {
    case "sales":
      return { list: ["Facebook and Instagram Feeds", "Instagram and Facebook Reels", "Stories"], why: "Advantage+ placements let Meta move the budget to wherever buyers respond. Feeds give a product room to be seen; Reels and Stories reach people scrolling full-screen." };
    case "leads":
      return { list: ["Facebook and Instagram Feeds", "Stories"], why: hasWebsite ? "Feeds and Stories are where people stop long enough to read what you do and get in touch. Advantage+ placements can add Reels once the ads have results." : "A lead form opens straight from Feeds and Stories, so people ask for a quote without leaving the app." };
    case "bookings":
      return { list: ["Facebook and Instagram Feeds", "Stories", "Reels"], why: "People decide to book from a clear picture and a short line; Stories and Reels show the place or the service in a few seconds." };
    case "traffic":
      return { list: ["Facebook and Instagram Feeds", "Reels"], why: "Feeds and Reels are where people tap through to read more. MAIRO leaves out Meta's Audience Network — apps and sites outside Facebook and Instagram — so the visits come from people on Facebook and Instagram." };
    case "awareness":
      return { list: ["Instagram and Facebook Reels", "Stories", "Facebook and Instagram Feeds"], why: "Full-screen Reels and Stories are the most noticeable way to be seen; Advantage+ placements let Meta reach the most of the right people for the budget." };
  }
}

/** Advertising opportunities the facts support — suggestions, each from something the visitor or their website said. */
export function opportunitiesFor(f: PreviewFacts, goal: PreviewGoal, b: BudgetPlan, kind: Preview["kind"]): { title: string; detail: string }[] {
  const out: { title: string; detail: string }[] = [];
  const offer = f.offer.trim();
  if (offer) out.push({ title: "Lead with your offer", detail: `“${offer}” is a concrete reason to act now — the first ad can open with it.` });
  if (f.proof.trim()) out.push({ title: "Show what's true about you", detail: `“${f.proof.trim()}” is the kind of detail that makes a stranger trust a business they've never heard of.` });
  if (f.location.trim() && kind !== "shop") out.push({ title: "Reach only the people near you", detail: `Meta can show your ads only to people around ${f.location.split(",")[0].trim()}, so no money goes on people who can't become customers.` });
  if (f.customer.trim()) out.push({ title: "Speak to one kind of customer", detail: `An ad written for ${f.customer.trim().replace(/[.!]+$/, "").replace(/^./, (c) => c.toLowerCase())} reads as if it's for them — usually more convincing than one for everyone.` });
  if (f.destinations?.booking && goal === "bookings") out.push({ title: "Send people straight to booking", detail: `Your site books through ${f.destinations.booking}, so the ad's button can open booking directly.` });
  if (goal === "leads" && !f.destinations?.form) out.push({ title: "Take enquiries inside the ad", detail: "A Meta lead form lets people ask for a quote without leaving Facebook or Instagram — no website form needed." });
  if (b.lines.some((l) => l.key === "retargeting")) out.push({ title: kind === "shop" ? "Win back people who looked" : "Follow up people who visited", detail: "Part of the budget reminds people who already visited — often the least expensive results, once enough people have seen the ads." });
  if (f.pixelSeen === false && goal !== "awareness") out.push({ title: "Let Meta see your results", detail: "MAIRO found no Meta pixel on the pages it read. Adding one lets Meta learn who buys or gets in touch, and find more people like them." });
  out.push({ title: "Use short video", detail: kind === "shop" ? "A few seconds of the product in use, filmed on a phone, gives Reels and Stories something to show." : "A few seconds of you or your work, filmed on a phone, gives Reels and Stories something real to show." });
  return out.slice(0, 5);
}

const KIND_LABEL: Record<Preview["kind"], string> = { shop: "an online shop", service: "a local service", appointments: "a business that takes bookings" };

/** The report, or null when the saved plan can't make one (it always can, once validated). */
export function buildReport(p: SavedPlan): PlanReport | null {
  const f = factsOf(p);
  const preview = buildPreview(f.name ? f : { ...f, name: "Your business" }, { quick: true });
  if (!preview) return null;
  const goal = p.inputs.goal;
  const budget = budgetPlan(budgetInputOf(p, preview));
  const kind = kindOf(f);
  const kindLabel = businessTypeFrom(f.businessType)?.label ?? KIND_LABEL[kind];

  const targetCustomer = f.customer.trim() || p.written?.customers || preview.plan.audience.split(",")[0];
  const fallback = preview.directions.map((d) => conceptFromDirection(d, goal, targetCustomer));
  const list = p.written?.concepts.length ? (p.written.concepts as PlanConcept[]) : fallback;
  const first = p.written ? Math.min(p.written.first, list.length - 1) : 0;
  const firstWhy = p.written?.firstWhy || list[first]?.why || "";

  const facts: FactLine[] = FACT_ORDER.filter((k) => f[k].trim()).map((k) => ({ key: k, label: FACT_LABEL[k], value: f[k].trim(), from: p.facts.fromWebsite.includes(k) ? "website" : "you" }));
  const customers: PlanReport["business"]["customers"] = f.customer.trim()
    ? { text: f.customer.trim(), from: p.facts.fromWebsite.includes("customer") ? "website" : "you" }
    : { text: p.written?.customers || (kind === "shop" ? "People likely to buy what you sell" : "People nearby who need what you offer"), from: "suggestion" };
  const appeal = p.written?.appeal.length
    ? p.written.appeal
    : [f.offer.trim() && `A real offer to lead with: ${f.offer.trim().replace(/[.!]+$/, "")}.`, f.proof.trim() && `Something true that builds trust: ${f.proof.trim().replace(/[.!]+$/, "")}.`, `What you offer, said plainly: ${f.offering.trim().replace(/[.!]+$/, "")}.`].filter((x): x is string => Boolean(x));

  const placements = placementsFor(goal, Boolean(p.inputs.website));
  const main = budget.lines[0];
  const structure = [
    preview.strategy.campaign,
    `${main.label}: ${preview.plan.audience} — about $${Math.round(main.daily)} a day.`,
    ...budget.lines.slice(1).map((l) => `${l.label}: about $${Math.round(l.daily)} a day, once ${l.key === "retargeting" ? "enough people have visited" : l.key === "testing" ? "the first ads have results to beat" : "the main audience is learning steadily"}.`),
    `${budget.adsAtOnce === 3 ? "Three" : budget.adsAtOnce === 2 ? "Two" : "One"} ad${budget.adsAtOnce === 1 ? "" : "s"} running against each other at first — the concepts below.`,
    `People go to: ${preview.plan.destination}.`,
  ];
  const messaging = p.written?.messaging.length
    ? p.written.messaging
    : [`Say what you offer first: ${f.offering.trim().replace(/[.!]+$/, "")}.`, f.offer.trim() ? `Give the reason to act now: ${f.offer.trim().replace(/[.!]+$/, "")}.` : "Show your own work or product, not stock photos.", f.proof.trim() ? `Back it up with something true: ${f.proof.trim().replace(/[.!]+$/, "")}.` : "Use one clear button that says what happens next."];

  const d = p.facts.destinations;
  const seen: PlanReport["website"]["seen"] = p.site
    ? [
        { label: "Pages read", value: String(p.site.pagesRead), ok: null },
        ...(p.site.platform ? [{ label: "Built with", value: p.site.platform, ok: null }] : []),
        { label: "Meta pixel", value: p.facts.pixelSeen ? "Found on the pages read" : "Not found on the pages read", ok: Boolean(p.facts.pixelSeen) },
        { label: "Checkout", value: d?.checkout ? "Found" : "Not found", ok: kind === "shop" ? Boolean(d?.checkout) : null },
        { label: "Contact form", value: d?.form ? "Found" : "Not found", ok: goal === "leads" ? Boolean(d?.form) : null },
        { label: "Online booking", value: d?.booking ? `Through ${d.booking}` : "Not found", ok: goal === "bookings" ? Boolean(d?.booking) : null },
        { label: "Phone link", value: d?.phone ? "Found" : "Not found", ok: null },
      ]
    : [];

  return {
    goal,
    goalLabel: GOAL_OPTIONS.find((g) => g.value === goal)?.label ?? goal,
    name: f.name.trim() || "Your business",
    business: { offering: f.offering.trim(), facts, appeal, customers, opportunities: opportunitiesFor(f, goal, budget, kind), assumptions: preview.assumed.map((a) => a.text), kindLabel },
    strategy: {
      objective: preview.plan.objective,
      optimiseFor: preview.plan.optimiseFor,
      campaign: preview.strategy.campaign,
      placements: placements.list,
      placementsWhy: placements.why,
      audience: preview.plan.audience,
      destination: preview.plan.destination,
      messaging,
      structure,
      why: preview.reasons.filter((r) => r.title !== "Why this budget"),
      learning: preview.strategy.learning,
    },
    budget,
    concepts: { list, first, firstWhy, source: p.source, filled: p.filled, dropped: p.dropped },
    website: { read: Boolean(p.site), url: p.site?.url ?? p.inputs.website, pagesRead: p.site?.pagesRead ?? 0, platform: p.site?.platform ?? null, seen, findings: p.findings },
    month: firstMonth({ ...budgetInputOf(p, preview), firstAd: list[first]?.headline ?? list[0]?.headline ?? "your first ad" }),
  };
}
