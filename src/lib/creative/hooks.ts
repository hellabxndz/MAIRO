import { checkCopy } from "@/lib/campaigns/ad-copy";

// Opening lines for ads, from distinct angles — the problem, the result, an
// objection, the offer, the place, proof, who it's for, the moment of need.
// Not ten rewrites of one sentence: each angle is a different reason someone
// might stop scrolling, and testing two angles teaches more than testing two
// wordings.
//
// Built only from what the owner entered. An angle whose ingredient is missing
// (no offer, no proof) is skipped and listed as such — never filled with an
// invented discount, review count or deadline. Every hook is run through the
// same copy check the campaign builder uses, so a line Meta would reject for
// implying something personal about the reader is flagged, not offered.
//
// Deterministic and local: no AI, nothing leaves the browser.

export type HookInput = {
  offering: string;
  customer?: string;
  problem?: string;
  outcome?: string;
  offer?: string;
  location?: string;
  proof?: string;
  objection?: string;
  moment?: string;
};

export type HookAngle = "problem" | "outcome" | "objection" | "offer" | "local" | "proof" | "callout" | "moment" | "explain";

export const ANGLE_LABEL: Record<HookAngle, string> = {
  problem: "The problem",
  outcome: "The result",
  objection: "The objection",
  offer: "The offer",
  local: "Local",
  proof: "Proof",
  callout: "Who it's for",
  moment: "The moment of need",
  explain: "How it works",
};

const WHY: Record<HookAngle, string> = {
  problem: "Names the problem in the customer's words, so the people who have it recognise themselves.",
  outcome: "Leads with what the customer gets, not what you do — useful when the result is easy to picture.",
  objection: "Answers the doubt that stops people enquiring. Only worth it if you can answer it honestly in the ad.",
  offer: "Puts your real offer first. Strong when the offer is the reason to act now.",
  local: "Tells nearby people this is for them; for service businesses, nearness is often the deciding fact.",
  proof: "Opens with evidence you can stand behind. Use only proof that's true and checkable.",
  callout: "Speaks to one kind of customer directly, so the right people stop and the wrong ones scroll on.",
  moment: "Catches people at the moment they need you — the situation, not the sales pitch.",
  explain: "For people who don't know how it works yet; pairs well with a short video or a carousel.",
};

const BEST_FOR: Record<HookAngle, string> = {
  problem: "Picture or short video",
  outcome: "Before-and-after picture or video",
  objection: "Video or carousel with the answer",
  offer: "Picture with the offer on it",
  local: "Picture of your work in the area",
  proof: "Picture of the proof (reviews you can show, your work)",
  callout: "Picture or video aimed at that customer",
  moment: "Short video showing the situation",
  explain: "Carousel or 15–30 second video",
};

export type Hook = {
  angle: HookAngle;
  text: string;
  why: string;
  bestFor: string;
  /** The owner's own inputs this hook is built from. */
  uses: (keyof HookInput)[];
  /** Problems Meta's review would likely raise, from the campaign builder's own check. */
  warnings: string[];
};

const t = (s: string | undefined) => (s ?? "").trim().replace(/[.!?]+$/, "");
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lower = (s: string) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

type Template = { needs: (keyof HookInput)[]; make: (i: Required<HookInput>) => string };

const TEMPLATES: Record<HookAngle, Template[]> = {
  problem: [
    { needs: ["problem"], make: (i) => `${cap(i.problem)}? ${cap(i.offering)}${i.location ? ` in ${i.location}` : ""}.` },
    { needs: ["problem"], make: (i) => `${cap(i.problem)} — that's what ${lower(i.offering)} is for.` },
  ],
  outcome: [
    { needs: ["outcome"], make: (i) => `${cap(i.outcome)}. That's the whole point of ${lower(i.offering)}.` },
    { needs: ["outcome"], make: (i) => `Picture ${lower(i.outcome)}. Start with ${lower(i.offering)}.` },
  ],
  objection: [
    { needs: ["objection"], make: (i) => `"${cap(i.objection)}?" Fair question — here's the straight answer.` },
    { needs: ["objection"], make: (i) => `Worried about ${lower(i.objection)}? Here's how ${lower(i.offering)} actually works.` },
  ],
  offer: [
    { needs: ["offer"], make: (i) => `${cap(i.offer)} — ${lower(i.offering)}${i.location ? ` in ${i.location}` : ""}.` },
    { needs: ["offer"], make: (i) => `${cap(i.offering)}: ${lower(i.offer)}.` },
  ],
  local: [
    { needs: ["location"], make: (i) => `${cap(i.offering)} in ${i.location}.` },
    { needs: ["location"], make: (i) => `${i.location}${i.customer ? ` ${lower(i.customer)}` : ""}: ${lower(i.offering)}, close to you.` },
  ],
  proof: [
    { needs: ["proof"], make: (i) => `${cap(i.proof)}. ${cap(i.offering)}${i.location ? ` in ${i.location}` : ""}.` },
    { needs: ["proof"], make: (i) => `Why people choose us for ${lower(i.offering)}: ${lower(i.proof)}.` },
  ],
  callout: [
    { needs: ["customer"], make: (i) => `For ${lower(i.customer)}: ${lower(i.offering)}${i.outcome ? ` — ${lower(i.outcome)}` : ""}.` },
    { needs: ["customer"], make: (i) => `${cap(i.offering)}, made for ${lower(i.customer)}.` },
  ],
  moment: [
    { needs: ["moment"], make: (i) => `${cap(i.moment)}? ${cap(i.offering)}.` },
    { needs: ["moment"], make: (i) => `${cap(i.moment)} is when people call us. ${cap(i.offering)}${i.location ? ` in ${i.location}` : ""}.` },
  ],
  explain: [
    { needs: [], make: (i) => `How ${lower(i.offering)} works — in plain words.` },
    { needs: [], make: (i) => `What actually happens when you book ${lower(i.offering)}.` },
  ],
};

export const ANGLES = Object.keys(TEMPLATES) as HookAngle[];

export type HookSet = { hooks: Hook[]; skipped: { angle: HookAngle; missing: (keyof HookInput)[] }[] };

/** One hook per angle the inputs support; `variant` picks the alternative wording of each angle. */
export function generateHooks(input: HookInput, variant = 0): HookSet {
  const i: Required<HookInput> = {
    offering: t(input.offering),
    customer: t(input.customer),
    problem: t(input.problem),
    outcome: t(input.outcome),
    offer: t(input.offer),
    location: t(input.location),
    proof: t(input.proof),
    objection: t(input.objection),
    moment: t(input.moment),
  };
  const hooks: Hook[] = [];
  const skipped: HookSet["skipped"] = [];
  if (!i.offering) return { hooks, skipped: ANGLES.map((angle) => ({ angle, missing: ["offering"] })) };
  for (const angle of ANGLES) {
    const options = TEMPLATES[angle];
    const tpl = options[variant % options.length];
    const missing = tpl.needs.filter((k) => !i[k]);
    if (missing.length) {
      skipped.push({ angle, missing });
      continue;
    }
    const text = tpl.make(i).replace(/\s+/g, " ").trim();
    const uses = (["offering", ...tpl.needs, ...(["location", "customer", "outcome"] as const).filter((k) => text.toLowerCase().includes(i[k].toLowerCase()) && i[k] && !tpl.needs.includes(k))] as (keyof HookInput)[]).filter((v, n, a) => a.indexOf(v) === n);
    const warnings = checkCopy({ primaryText: text, headline: "x", cta: "LEARN_MORE" }, "WEBSITE")
      .filter((f) => /personal about the reader|provably true|capital letters|spammy/.test(f.text))
      .map((f) => f.text);
    hooks.push({ angle, text, why: WHY[angle], bestFor: BEST_FOR[angle], uses, warnings });
  }
  return { hooks, skipped };
}

/** Two hooks worth testing against each other: different angles, both clean. */
export function suggestedPair(set: HookSet): [Hook, Hook] | null {
  const clean = set.hooks.filter((h) => !h.warnings.length && h.angle !== "explain");
  const order: HookAngle[] = ["problem", "outcome", "offer", "proof", "moment", "local", "callout", "objection"];
  const sorted = [...clean].sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle));
  return sorted.length >= 2 ? [sorted[0], sorted[1]] : null;
}
