import { emptyFacts, factsFromScan, type FactKey, type PreviewFacts, type PreviewGoal } from "@/lib/preview/build";
import { savedPlanSchema, type SavedPlan } from "@/lib/preview/saved-plan";
import type { PlanSource, WrittenPlan } from "@/lib/preview/plan-concepts";
import type { ScanResult } from "@/lib/website/scan";

// The free AI ad plan generator's four answers — website, what they sell,
// goal, monthly Meta budget (and the name, when no website gave it) — turned
// into the plan's facts, each with where it came from, and then into the
// saved-plan record the report, Save, Share and sign-up all use.
//
// Pure: the generator, scripts/check-report.ts.

export type GeneratorAnswers = {
  /** The address as typed and normalised, or null for "no website". */
  website: string | null;
  sells: string;
  /** Only asked when the website didn't give it. */
  name: string;
  goal: PreviewGoal;
  monthly: number;
};

const FACT_KEYS: FactKey[] = ["name", "offering", "customer", "location", "offer", "proof", "problem"];

/** Typed all in lower case in a hurry ("nova sports"): shown as a name ("Nova Sports"). Any capital means the owner chose it. */
export function asName(typed: string): string {
  const t = typed.replace(/\s+/g, " ").trim().slice(0, 80);
  return t && t === t.toLowerCase() ? t.replace(/(^|\s)(\p{L})/gu, (_, sp: string, c: string) => sp + c.toUpperCase()) : t;
}

/** "We sell premium streetwear for young adults." → offering "Premium streetwear for young adults", customer "Young adults". */
export function readSells(text: string): { offering: string; customer: string } {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return { offering: "", customer: "" };
  const first = (t.match(/^[^.!?]+[.!?]?/)?.[0] ?? t)
    .trim()
    .replace(/[.!]+$/, "")
    .replace(/^(?:we|i)\s+(?:sell|offer|make|provide|do|run|are)\s+/i, "")
    .slice(0, 140);
  const offering = first.charAt(0).toUpperCase() + first.slice(1);
  const forWhom = first.match(/\bfor\s+((?:[a-z'-]+\s?){1,5})$/i)?.[1]?.trim() ?? "";
  const customer = forWhom && !/^(?:you|everyone|all|less|more|free|sale)\b/i.test(forWhom) ? forWhom.charAt(0).toUpperCase() + forWhom.slice(1) : "";
  return { offering, customer };
}

/** The facts the plan is built from: the website's where it was read, the visitor's own words where they gave or changed them. */
export function factsFromAnswers(a: GeneratorAnswers, scan: ScanResult | null): PreviewFacts {
  const read = scan && (scan.status === "OK" || scan.status === "PARTIAL") && !scan.socialInstead ? factsFromScan(scan) : null;
  const f: PreviewFacts = read ? { ...read, sources: { ...read.sources } } : { ...emptyFacts(a.website), sources: {} };
  if (!read) f.website = a.website;

  const name = asName(a.name);
  if (name) {
    f.name = name;
    f.sources.name = { from: "you" };
  }
  const sells = a.sells.replace(/\s+/g, " ").trim();
  // Kept as the website said it — unless the visitor changed it, which makes it theirs.
  if (sells && !(read && read.offering && sells === read.offering)) {
    const { offering, customer } = readSells(sells);
    f.offering = offering;
    f.sources.offering = { from: "you" };
    if (customer && !f.customer) {
      f.customer = customer;
      f.sources.customer = { from: "you" };
    }
  }
  f.goal = a.goal;
  f.monthlyBudget = a.monthly;
  return f;
}

export type Writing = { source: PlanSource; plan: WrittenPlan | null; dropped: string[]; filled: number };

/** The record a plan is shown, saved and shared from. Validated, so what's shown is what would be saved. */
export function toSavedPlan(a: GeneratorAnswers, f: PreviewFacts, scan: ScanResult | null, w: Writing): SavedPlan | null {
  const read = scan && (scan.status === "OK" || scan.status === "PARTIAL") && !scan.socialInstead;
  const raw = {
    inputs: { website: a.website, sells: a.sells.trim().slice(0, 400) || f.offering, goal: a.goal, monthly: a.monthly },
    facts: {
      ...Object.fromEntries(FACT_KEYS.map((k) => [k, f[k].slice(0, 400)])),
      businessType: f.businessType,
      pixelSeen: f.pixelSeen,
      usesLeadForm: a.goal === "leads" && !f.destinations?.form,
      fromWebsite: FACT_KEYS.filter((k) => f.sources[k]?.from === "website"),
      destinations: f.destinations ? { ...f.destinations, booking: f.destinations.booking?.slice(0, 60) ?? null } : null,
    },
    site: read ? { url: (scan.finalUrl ?? scan.requestedUrl).slice(0, 300), pagesRead: Math.min(50, scan.pages.length), platform: scan.platform?.name ?? null } : null,
    findings: read
      ? scan.audit.top
          .filter((x) => x.status === "issue")
          .slice(0, 4)
          .map((x) => ({ title: x.title.slice(0, 200), why: x.why.slice(0, 600), change: x.change.slice(0, 600), evidence: x.evidence?.slice(0, 300) ?? null }))
      : [],
    written: w.plan,
    source: w.source,
    dropped: w.dropped.slice(0, 20),
    filled: w.filled,
  };
  const r = savedPlanSchema.safeParse(raw);
  return r.success ? r.data : null;
}
