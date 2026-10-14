import { checkCopy, unsupportedNumbers } from "@/lib/campaigns/ad-copy";
import { BUTTONS } from "@/lib/creative/rewrite-rules";
import { BANNED_CLAIMS } from "@/lib/capabilities";
import type { PreviewFacts, PreviewGoal } from "@/lib/preview/build";
import { DEFAULT_CTA, FORMATS, type PlanConcept, type WrittenPlan } from "@/lib/preview/plan-concepts";

// What MAIRO's AI writes for the free ad plan, and the checks it has to pass
// before a visitor sees it. The model proposes; nothing it says is trusted:
// a number that isn't in the facts, a guarantee, a rating, a customer count,
// copy Meta would reject, or a field that's empty or too long is dropped, and
// a concept that can't be kept is replaced from MAIRO's own templates — and
// the plan says how many were. Pure, so scripts/check-plan-writing.ts pins it
// without calling a model.

export { FORMATS, DEFAULT_CTA, conceptFromDirection } from "@/lib/preview/plan-concepts";
export type { Format, PlanConcept, WrittenPlan, PlanSource } from "@/lib/preview/plan-concepts";

export type RawPlan = {
  appeal?: unknown;
  customers?: unknown;
  messaging?: unknown;
  concepts?: unknown;
  firstIndex?: unknown;
  firstWhy?: unknown;
};

const LIMIT = { label: 40, headline: 60, primaryText: 300, visual: 220, targetCustomer: 90, why: 240, point: 160 } as const;

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max).trim() : "");

/** The facts the ad may state, as one text: the visitor's own words and what the website said. */
export function factText(f: PreviewFacts): string {
  return [f.name, f.offering, f.customer, f.location, f.offer, f.proof, f.problem].filter((s) => s && s.trim()).join("\n");
}

function claimProblem(text: string): string | null {
  for (const b of BANNED_CLAIMS) if (b.pattern.test(text)) return b.why;
  if (/\b(best|#1|number one|cheapest|lowest price)\b/i.test(text)) return "a superlative it can't prove";
  if (/\b(only \d+ left|ends (today|tonight|soon)|last chance|hurry)\b/i.test(text)) return "made-up urgency";
  return null;
}

function metaProblem(primaryText: string, headline: string): string | null {
  const f = checkCopy({ primaryText, headline, cta: "LEARN_MORE" }, "WEBSITE").find((x) => /personal about the reader|provably true|capital letters|spammy/.test(x.text));
  return f ? f.text : null;
}

/**
 * Keeps only what the facts support. Returns the plan with every kept field
 * checked, what was dropped (for the plan's own note), and how many concepts
 * had to come from the templates.
 */
export function settlePlan(raw: RawPlan, f: PreviewFacts, fallback: PlanConcept[]): { plan: WrittenPlan; dropped: string[]; filled: number } {
  const known = factText(f);
  const dropped: string[] = [];
  const ok = (text: string, what: string): boolean => {
    if (!text) return false;
    const n = unsupportedNumbers(text, known);
    if (n.length) {
      dropped.push(`${what}: a number not in your facts (${n.join(", ")})`);
      return false;
    }
    const c = claimProblem(text);
    if (c) {
      dropped.push(`${what}: ${c}`);
      return false;
    }
    return true;
  };

  const list = (v: unknown, max: number, what: string, n: number): string[] =>
    (Array.isArray(v) ? v : [])
      .map((x) => clean(x, max))
      .filter((x) => ok(x, what))
      .filter((x, i, all) => all.indexOf(x) === i)
      .slice(0, n);

  const concepts: PlanConcept[] = [];
  for (const [i, c] of (Array.isArray(raw.concepts) ? raw.concepts : []).slice(0, 3).entries()) {
    const r = (c ?? {}) as Record<string, unknown>;
    const what = `Concept ${i + 1}`;
    const headline = clean(r.headline, LIMIT.headline);
    // The ad's text keeps every sentence the facts support and loses the rest.
    const primaryText = clean(r.primaryText, 600)
      .split(/(?<=[.!?])\s+/)
      .filter((s) => ok(s, what))
      .join(" ")
      .slice(0, LIMIT.primaryText)
      .trim();
    const visual = clean(r.visual, LIMIT.visual);
    const why = clean(r.why, LIMIT.why);
    const targetCustomer = clean(r.targetCustomer, LIMIT.targetCustomer);
    const label = clean(r.label, LIMIT.label) || `Concept ${i + 1}`;
    if (!ok(headline, what) || primaryText.length < 12 || !ok(visual, what) || !ok(why, what) || !ok(targetCustomer, what)) continue;
    const meta = metaProblem(primaryText, headline);
    if (meta) {
      dropped.push(`${what}: ${meta}`);
      continue;
    }
    const cta = BUTTONS.find((b) => b.toLowerCase() === clean(r.cta, 30).toLowerCase()) ?? DEFAULT_CTA[(f.goal || "leads") as PreviewGoal];
    const format = FORMATS.find((x) => x.toLowerCase() === clean(r.format, 30).toLowerCase()) ?? "Single image";
    concepts.push({ label, headline, primaryText, format, visual, cta, targetCustomer, why });
  }
  let filled = 0;
  for (const c of fallback) {
    if (concepts.length >= 3) break;
    if (concepts.some((x) => x.headline === c.headline)) continue;
    concepts.push(c);
    filled++;
  }
  const firstIndex = typeof raw.firstIndex === "number" && Number.isInteger(raw.firstIndex) && raw.firstIndex >= 0 && raw.firstIndex < concepts.length - filled ? raw.firstIndex : 0;
  const firstWhy = clean(raw.firstWhy, LIMIT.why);
  const customers = clean(raw.customers, LIMIT.targetCustomer);
  return {
    plan: {
      appeal: list(raw.appeal, LIMIT.point, "What makes it appealing", 3),
      customers: customers && ok(customers, "Likely customers") ? customers : null,
      messaging: list(raw.messaging, LIMIT.point, "Messaging", 4),
      concepts,
      first: firstIndex,
      firstWhy: firstWhy && ok(firstWhy, "Why test it first") ? firstWhy : concepts[firstIndex]?.why ?? "",
    },
    dropped: [...new Set(dropped)],
    filled,
  };
}
