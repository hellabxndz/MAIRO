import { savedPlanSchema, type SavedPlan } from "@/lib/preview/saved-plan";
import { FACT_LABEL, type FactKey, type PreviewGoal } from "@/lib/preview/build";
import { BUDGET_MAX, BUDGET_MIN, GOAL_OPTIONS, budgetLabel } from "@/lib/preview/strategy";
import { unsupportedNumbers } from "@/lib/campaigns/ad-copy";
import { BANNED_CLAIMS } from "@/lib/capabilities";
import type { Writing } from "@/lib/preview/answers";

// "Do you like it? What would you change?" — the question MAIRO asks under a
// free ad plan, and what it does with the answer.
//
// MAIRO's AI (lib/ai/plan-refine.ts) reads the owner's reply into changes; so
// do the rules here, when the AI isn't switched on. Either way nothing it
// proposes is trusted: a budget has to be a figure the owner wrote, a goal one
// of the five, and a fact the owner's own words — a number that isn't in what
// they wrote or already said, a guarantee, or wording that isn't theirs is
// dropped. Then the change is applied to the plan, and the plan says so.
//
// Pure: the refine route, the plan page and scripts/check-refine.ts.

export const REFINE_FACTS: FactKey[] = ["name", "offering", "customer", "location", "offer", "proof", "problem"];
export const MESSAGE_MAX = 500;

export type RefineChanges = {
  monthly: number | null;
  goal: PreviewGoal | null;
  /** New wording for a fact, in the owner's words. */
  facts: Partial<Record<FactKey, string>>;
  /** Facts the owner asked to take out ("drop the offer"). */
  remove: FactKey[];
};

export type RefineAnswer = {
  reply: string;
  changes: RefineChanges;
  /** They said they like it, and asked for nothing else. */
  likes: boolean;
  /** Who read the request: MAIRO's AI, the local test fixture, or MAIRO's rules. */
  by: "ai" | "fixture" | "rules";
  /** What was proposed and refused, said plainly. */
  dropped: string[];
};

export const NO_CHANGES: RefineChanges = { monthly: null, goal: null, facts: {}, remove: [] };

const FACT_MAX: Record<FactKey, number> = { name: 80, offering: 200, customer: 120, location: 120, offer: 120, proof: 160, problem: 160 };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();
const goalLabel = (g: PreviewGoal) => GOAL_OPTIONS.find((o) => o.value === g)?.label ?? g;

/** Whether the owner wrote this monthly figure — as a month, a day (×30) or "2k". */
export function figureWritten(monthly: number, message: string): boolean {
  const nums = (message.toLowerCase().match(/\$?\s?\d[\d,]*(?:\.\d+)?\s?k?/g) ?? []).map((n) => {
    const k = /k$/.test(n.trim());
    const v = Number(n.replace(/[$,\sk]/g, ""));
    return k ? v * 1000 : v;
  });
  return nums.some((v) => v === monthly || Math.round(v * 30) === monthly);
}

/** Most of the value's words are the owner's (or already in the plan): MAIRO may tidy their wording, never write its own. */
export function ownWords(value: string, source: string): boolean {
  const words = value.toLowerCase().match(/[\p{L}\p{N}']{4,}/gu) ?? [];
  if (!words.length) return value.trim().length > 0 && source.toLowerCase().includes(value.trim().toLowerCase());
  const src = source.toLowerCase();
  const found = words.filter((w) => src.includes(w.replace(/'s$/, ""))).length;
  return found / words.length >= 0.6;
}

function claimProblem(text: string): string | null {
  for (const b of BANNED_CLAIMS) if (b.pattern.test(text)) return b.why;
  if (/\b(best|#1|number one|cheapest|lowest price)\b/i.test(text)) return "a superlative it can't prove";
  return null;
}

/**
 * Keeps only the changes the owner's words support. `raw` is what the AI (or
 * the rules) proposed; the message is what the owner typed.
 */
export function settleChanges(raw: Partial<RefineChanges> | null | undefined, plan: SavedPlan, message: string): { changes: RefineChanges; dropped: string[] } {
  const dropped: string[] = [];
  const out: RefineChanges = { monthly: null, goal: null, facts: {}, remove: [] };
  const known = REFINE_FACTS.map((k) => plan.facts[k]).filter(Boolean).join("\n");
  const source = `${message}\n${known}`;

  const m = typeof raw?.monthly === "number" && Number.isFinite(raw.monthly) ? Math.round(raw.monthly) : null;
  if (m !== null && m !== plan.inputs.monthly) {
    if (m < BUDGET_MIN || m > BUDGET_MAX) dropped.push(`A budget of $${m.toLocaleString("en-US")} a month — the free plan works between $${BUDGET_MIN} and $${BUDGET_MAX.toLocaleString("en-US")}.`);
    else if (!figureWritten(m, message)) dropped.push("A budget you didn't write — say the amount, e.g. \"$300 a month\".");
    else out.monthly = m;
  }

  const g = raw?.goal;
  if (g && GOAL_OPTIONS.some((o) => o.value === g) && g !== plan.inputs.goal) out.goal = g;

  for (const k of REFINE_FACTS) {
    const v = raw?.facts?.[k];
    if (typeof v !== "string") continue;
    const value = squash(v).replace(/[.!]+$/, "").slice(0, FACT_MAX[k]);
    if (!value || value === plan.facts[k]) continue;
    const label = FACT_LABEL[k];
    const nums = unsupportedNumbers(value, source);
    if (nums.length) {
      dropped.push(`${label}: a number you didn't give (${nums.join(", ")}).`);
      continue;
    }
    const claim = claimProblem(value);
    if (claim) {
      dropped.push(`${label}: ${claim}.`);
      continue;
    }
    if (!ownWords(value, source)) {
      dropped.push(`${label}: wording that wasn't yours — tell MAIRO in your own words.`);
      continue;
    }
    out.facts[k] = value.charAt(0).toUpperCase() + value.slice(1);
  }

  for (const k of raw?.remove ?? []) {
    // The name and what they sell are what a plan is built on: changed, never removed.
    if (!REFINE_FACTS.includes(k) || k === "name" || k === "offering" || !plan.facts[k] || out.facts[k]) continue;
    out.remove.push(k);
  }
  return { changes: out, dropped };
}

export function hasChanges(c: RefineChanges): boolean {
  return c.monthly !== null || c.goal !== null || Object.keys(c.facts).length > 0 || c.remove.length > 0;
}

/** The plan with the changes made. `rewrite` is whether the ad concepts need writing again (the goal or a fact changed). */
export function applyChanges(plan: SavedPlan, c: RefineChanges): { plan: SavedPlan; rewrite: boolean } | null {
  const facts = { ...plan.facts };
  const touched: FactKey[] = [];
  for (const [k, v] of Object.entries(c.facts) as [FactKey, string][]) {
    facts[k] = v;
    touched.push(k);
  }
  for (const k of c.remove) {
    facts[k] = "";
    touched.push(k);
  }
  // What the owner changed is theirs now, not the website's.
  facts.fromWebsite = facts.fromWebsite.filter((k) => !touched.includes(k as FactKey));
  const goal = c.goal ?? plan.inputs.goal;
  facts.usesLeadForm = goal === "leads" && !facts.destinations?.form;
  const next = savedPlanSchema.safeParse({
    ...plan,
    inputs: { ...plan.inputs, goal, monthly: c.monthly ?? plan.inputs.monthly, sells: c.facts.offering ?? plan.inputs.sells },
    facts,
  });
  if (!next.success) return null;
  return { plan: next.data, rewrite: c.goal !== null || touched.length > 0 };
}

/** The plan with newly written concepts — or, when the writing came back empty, MAIRO's templates, as the report labels them. */
export function withWriting(plan: SavedPlan, w: Writing): SavedPlan {
  const next = savedPlanSchema.safeParse({ ...plan, written: w.plan, source: w.source, dropped: w.dropped.slice(0, 20), filled: w.filled });
  return next.success ? next.data : plan;
}

/** "Budget: $500 → $300 a month", one line per change, for the conversation. */
export function describeChanges(before: SavedPlan, c: RefineChanges): string[] {
  const lines: string[] = [];
  if (c.monthly !== null) lines.push(`Budget: ${budgetLabel(before.inputs.monthly)} → ${budgetLabel(c.monthly)} a month`);
  if (c.goal) lines.push(`Goal: ${goalLabel(before.inputs.goal)} → ${goalLabel(c.goal)}`);
  for (const [k, v] of Object.entries(c.facts) as [FactKey, string][]) lines.push(`${FACT_LABEL[k]}: ${v}`);
  for (const k of c.remove) lines.push(`${FACT_LABEL[k]}: taken out`);
  return lines;
}

// --- Reading a request without the AI --------------------------------------------

const GOAL_WORDS: [PreviewGoal, RegExp][] = [
  ["sales", /\b(sales|sell more|purchases|online orders|buy(?:ers)?)\b/i],
  ["leads", /\b(leads|quotes?|enquir(?:y|ies)|inquir(?:y|ies)|phone calls|calls)\b/i],
  ["bookings", /\b(bookings?|appointments?|reservations?)\b/i],
  ["traffic", /\b(traffic|website visit(?:s|ors)?|visitors|clicks)\b/i],
  ["awareness", /\b(awareness|brand|known|recogni[sz]ed)\b/i],
];
const LIKES = /\b(i (?:really )?(?:like|love) it|looks (?:good|great|perfect)|(?:it's|its|it is) (?:good|great|perfect)|perfect|love (?:it|this)|happy with (?:it|this)|no changes?|all good|let'?s (?:go|do it|start)|sounds good)\b/i;
const NEGATED = /\b(don'?t|do not|not|no longer)\s+(?:\w+\s){0,2}$/i;

/** MAIRO's rules: a budget, a goal, an area and "I like it". Anything else is left to the AI or to Edit answers. */
export function readRequest(message: string): { raw: Partial<RefineChanges>; likes: boolean } {
  const t = squash(message);
  const raw: Partial<RefineChanges> = { facts: {} };

  // A budget: "$300", "300 a month", "$20 a day", "2k".
  const money = t.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k\b)?(\s*(?:a|per|\/)\s*(day|month|mo)\b|\s*(daily|monthly))?/i) ?? t.match(/\b(\d[\d,]*)\s*(k\b)?\s*(?:dollars|usd)?\s*((?:a|per|\/)\s*(day|month|mo)\b|\s*(daily|monthly))/i);
  if (money) {
    let v = Number(money[1].replace(/,/g, ""));
    if (money[2]) v *= 1000;
    const perDay = /day|daily/i.test(money[3] ?? "");
    raw.monthly = Math.round(perDay ? v * 30 : v);
  }

  // A goal, asked for — "focus on calls", "I want more bookings", "switch to sales".
  const intent = /\b(focus(?:ed)? on|more|get|goal|instead|switch(?: it)? to|change (?:it|the goal) to|aim(?:ing)? for|prefer|want)\b/i;
  if (intent.test(t)) {
    const hits = GOAL_WORDS.filter(([, re]) => {
      const m = t.match(re);
      return m && !NEGATED.test(t.slice(0, m.index));
    }).map(([g]) => g);
    if (hits.length === 1) raw.goal = hits[0];
  }

  // An area: "only in Miami-Dade", "target people in Fort Lauderdale".
  const area = t.match(/\b(?:only|target(?:ing)?|reach|advertis(?:e|ing)|show)\b(?:\s+[a-z]+){0,2}?\s+(?:in|around|near)\s+([A-Z][\p{L}'.-]*(?:[ -](?:[A-Z][\p{L}'.-]*|and|&)){0,4})/u);
  if (area) raw.facts = { ...raw.facts, location: area[1].replace(/[.,]+$/, "") };

  const likes = LIKES.test(t) && !raw.monthly && !raw.goal && !area;
  return { raw, likes };
}

/** What MAIRO says back, from the rules (the AI writes its own). */
export function ruleReply(c: RefineChanges, likes: boolean, dropped: string[]): string {
  if (likes) return "Great — press “Get started” and MAIRO sets up your account with this plan. Nothing is charged or launched until you choose to.";
  if (hasChanges(c)) return `Done — I've updated your plan.${dropped.length ? " Some of it I couldn't change; it's listed below." : ""} Anything else?`;
  if (dropped.length) return "I couldn't make that change — the reason is below.";
  return "Here I can change your monthly budget (e.g. “$300 a month”), your goal (e.g. “focus on bookings”) or where you advertise (e.g. “only in Miami-Dade”). For anything else, use Edit answers.";
}

export { goalLabel };
