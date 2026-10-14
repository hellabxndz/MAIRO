import { ANGLE_LABEL, generateHooks, type HookAngle, type HookInput } from "@/lib/creative/hooks";

// "Review your suggested ads": three directions for a first ad, written from
// what the business confirmed in its Business Brain — and nothing else.
//
// Each direction is a different reason to stop scrolling (the problem, the
// offer, the place, proof…), not three wordings of one line, and one is
// recommended as the first test with the reason why. A direction whose
// ingredient isn't confirmed is simply not offered; the page says which fact
// would unlock it. No invented discounts, numbers, reviews or deadlines; words
// the owner said to avoid are never used.
//
// Pure, so scripts/check-suggested-ads.ts can pin every rule.

export type ConfirmedFacts = {
  businessName: string;
  /** What they want to sell more of, or what they do. */
  offering: string;
  customer: string;
  location: string;
  presence: "" | "local" | "online" | "both";
  problem: string;
  outcome: string;
  offer: string;
  proof: string;
  objection: string;
  /** "sales" | "leads" | "bookings" — what the button asks for. */
  goal: "sales" | "leads" | "bookings";
  /** Words and claims the owner said never to use. */
  avoid: string[];
  /** The business type the owner confirmed (lib/tracking/niches.ts): "ecommerce", "saas", "professional"… */
  niche?: string;
  /** The website the ads send people to, if there is one. */
  website?: string;
};

export type Direction = {
  kind: HookAngle;
  title: string;
  hook: string;
  body: string;
  cta: string;
  format: string;
  why: string;
  /** The confirmed facts it's built from, by label, for "Built from:". */
  builtFrom: string[];
  recommended: boolean;
  recommendedWhy: string | null;
};

export const FACT_LABELS: Record<keyof Omit<ConfirmedFacts, "goal" | "avoid" | "presence" | "niche" | "website">, string> = {
  businessName: "Business name",
  offering: "What you want to sell more of",
  customer: "Ideal customer",
  location: "Where you work",
  problem: "Problems customers have",
  outcome: "What customers want",
  offer: "Standing offers",
  proof: "What makes you different",
  objection: "Why customers hesitate",
};

/** Which fact unlocks which kind of direction, for "add this to get more". */
export const UNLOCKS: { fact: keyof typeof FACT_LABELS; gives: string }[] = [
  { fact: "problem", gives: "an ad that opens with the problem your customers have" },
  { fact: "offer", gives: "an ad that leads with your offer" },
  { fact: "proof", gives: "an ad that opens with what makes you different" },
  { fact: "outcome", gives: "an ad that shows the result customers want" },
  { fact: "customer", gives: "an ad that speaks to one kind of customer" },
];

const CTA: Record<ConfirmedFacts["goal"], string> = { sales: "Shop now", leads: "Get a quote", bookings: "Book now" };

/**
 * The button, for the goal and the kind of business: software is signed up
 * for, an agency or consultant is contacted, a shop is shopped — a quote is
 * for jobs that are priced one by one.
 */
export function ctaFor(f: Pick<ConfirmedFacts, "goal" | "niche">): string {
  if (f.niche === "saas") return f.goal === "bookings" ? "Book now" : "Sign up";
  if (f.niche === "professional") return f.goal === "bookings" ? "Book now" : "Contact us";
  if (f.niche === "education" && f.goal !== "sales") return "Sign up";
  return CTA[f.goal];
}

/** Who a direction is for, from the confirmed ideal customer and area. */
export function audienceFor(f: Pick<ConfirmedFacts, "customer" | "location" | "presence">): string {
  const where = f.location && f.presence !== "online" ? ` in and around ${f.location}` : "";
  if (f.customer) return `${cap(f.customer)}${where}`;
  return where ? `People${where} — no ideal customer confirmed yet, so Meta finds them` : "People Meta finds for your goal — confirm an ideal customer to aim it";
}

/** Where the button sends people, in words. */
export function destinationFor(f: Pick<ConfirmedFacts, "goal" | "website">): string {
  const site = (f.website ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (f.goal === "sales") return site ? `Your website, ${site}` : "Your online shop — add its address in the Business Brain";
  if (!site) return "A short form inside the ad (Meta's lead form)";
  return f.goal === "bookings" ? `Your booking page on ${site}` : `Your website, ${site} — or a form inside the ad`;
}

/** Why each kind of direction is worth a test, in one line. */
export const TEST_REASON: Partial<Record<HookAngle, string>> = {
  problem: "If your customers recognise the problem at a glance, this one stops the right people.",
  offer: "A concrete reason to act now — and easy to tell whether it's the offer people respond to.",
  local: "Tells people straight away that you're nearby, which often decides who gets the call.",
  outcome: "Shows the result people want, which works when it's easy to picture.",
  proof: "Opens with something true about you that competitors can't say.",
  callout: "Speaks to one kind of customer, so the right people know it's for them.",
  objection: "Answers the doubt that stops people before they ask.",
  explain: "Says plainly what you do, for people who don't know you yet.",
};

/** Meta's button type for the button's words (Meta calls "Book now" BOOK_TRAVEL); anything else is "Learn more". */
export function ctaTypeFor(words: string): string {
  const w = words.toLowerCase();
  if (/shop|buy/.test(w)) return "SHOP_NOW";
  if (/quote/.test(w)) return "GET_QUOTE";
  if (/book/.test(w)) return "BOOK_TRAVEL";
  if (/order/.test(w)) return "ORDER_NOW";
  if (/contact|call|message/.test(w)) return "CONTACT_US";
  if (/sign up|join/.test(w)) return "SIGN_UP";
  return "LEARN_MORE";
}

/** The order directions are worth testing in, by how the business sells. */
export function preferredOrder(f: Pick<ConfirmedFacts, "presence" | "goal">): HookAngle[] {
  if (f.goal === "sales" && f.presence !== "local") return ["offer", "outcome", "proof", "problem", "callout", "objection", "explain"];
  if (f.goal === "bookings") return ["outcome", "offer", "local", "problem", "proof", "callout", "explain"];
  return ["problem", "local", "offer", "proof", "outcome", "callout", "objection", "explain"];
}

const RECOMMEND_WHY: Partial<Record<HookAngle, string>> = {
  problem: "People who have this problem recognise themselves straight away — for a service business it's usually the strongest first test.",
  offer: "Your offer is a concrete reason to act now, and it's easy to tell whether it's working.",
  local: "Nearness is often what decides who people call, and Meta can show this only to people near you.",
  outcome: "It shows the result people want, which works when that result is easy to picture.",
  proof: "It opens with something true about you that competitors can't say.",
  callout: "It speaks to the one kind of customer you want most, so the right people stop.",
};

function bodyFor(kind: HookAngle, f: ConfirmedFacts): string {
  // Only confirmed facts, in plain sentences. No figures unless the owner gave them.
  const where = f.location && f.presence !== "online" ? ` in ${f.location}` : "";
  const lines: string[] = [];
  if (kind !== "offer" && f.offer) lines.push(`${cap(f.offer)}.`);
  if (kind !== "proof" && f.proof) lines.push(`${cap(f.proof)}.`);
  if (!lines.length) lines.push(`${cap(f.offering)}${where}.`);
  return lines.join(" ").replace(/\.\./g, ".");
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s).replace(/[.!]+$/, "");

/** True when the text uses a word or phrase the owner asked never to use. */
export function usesAvoided(text: string, avoid: string[]): string | null {
  const t = text.toLowerCase();
  for (const a of avoid) {
    const w = a.trim().toLowerCase();
    if (w.length >= 3 && t.includes(w)) return a;
  }
  return null;
}

/** Why a direction is the one to test first, for when the recommendation moves to it. */
export function recommendedWhyFor(kind: string): string {
  return RECOMMEND_WHY[kind as HookAngle] ?? "It's the clearest of the three for how your business sells.";
}

/**
 * The suggested directions, best first. `exclude` leaves out kinds already
 * shown or turned down, so a replacement is a different reason to stop
 * scrolling, not the same one reworded.
 */
export function buildDirections(f: ConfirmedFacts, opts: { exclude?: string[] } = {}): { directions: Direction[]; missing: { fact: string; gives: string }[] } {
  if (!f.offering.trim()) return { directions: [], missing: [{ fact: FACT_LABELS.offering, gives: "any direction at all — MAIRO needs to know what you're advertising" }] };
  const input: HookInput = {
    offering: f.offering,
    customer: f.customer,
    location: f.presence === "online" ? "" : f.location,
    problem: f.problem,
    outcome: f.outcome,
    offer: f.offer,
    proof: f.proof,
    objection: f.objection,
  };
  const set = generateHooks(input);
  const order = preferredOrder(f);
  const usable = set.hooks
    .filter((h) => !h.warnings.length && !usesAvoided(h.text, f.avoid) && order.includes(h.angle) && !(opts.exclude ?? []).includes(h.angle))
    .sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle))
    .slice(0, 3);
  const factFor: Partial<Record<keyof HookInput, keyof typeof FACT_LABELS>> = { offering: "offering", customer: "customer", location: "location", problem: "problem", outcome: "outcome", offer: "offer", proof: "proof", objection: "objection" };
  const directions: Direction[] = usable.map((h, i) => {
    const body = bodyFor(h.angle, f);
    return {
      kind: h.angle,
      title: ANGLE_LABEL[h.angle],
      hook: h.text,
      body: usesAvoided(body, f.avoid) ? `${cap(f.offering)}.` : body,
      cta: ctaFor(f),
      format: h.bestFor,
      why: h.why,
      builtFrom: [...new Set(h.uses.map((u) => factFor[u]).filter((x): x is keyof typeof FACT_LABELS => Boolean(x)).map((k) => FACT_LABELS[k]))],
      recommended: i === 0,
      recommendedWhy: i === 0 ? recommendedWhyFor(h.angle) : null,
    };
  });
  const missing = UNLOCKS.filter((u) => !f[u.fact].trim()).map((u) => ({ fact: FACT_LABELS[u.fact], gives: u.gives }));
  return { directions, missing: directions.length < 3 ? missing : missing.slice(0, 2) };
}

/** A personal opening line for the page, from the business's own facts. */
export function introFor(f: ConfirmedFacts, count: number): string {
  const who = f.customer ? ` for ${f.customer.charAt(0).toLowerCase()}${f.customer.slice(1)}` : "";
  const where = f.location && f.presence !== "online" ? ` in ${f.location}` : "";
  if (!count) return `MAIRO needs a little more about ${f.businessName || "your business"} before it can suggest ads.`;
  return `${count === 3 ? "Three" : count === 2 ? "Two" : "One"} way${count === 1 ? "" : "s"} to start advertising ${f.offering.charAt(0).toLowerCase()}${f.offering.slice(1).replace(/[.!]+$/, "")}${who}${where} — each from what you told MAIRO.`;
}

/**
 * What the picture should show, for the image model. Built from the
 * direction and confirmed facts; it asks for no text in the picture (the ad's
 * words are separate), and never for people presented as customers or
 * reviewers.
 */
export function imagePromptFor(d: Pick<Direction, "kind" | "hook">, f: Pick<ConfirmedFacts, "offering" | "location" | "presence">): string {
  const scene: Partial<Record<HookAngle, string>> = {
    problem: "the everyday situation where someone needs this, shown honestly, before it's solved",
    outcome: "the result someone gets, shown simply and believably",
    offer: "the product or service itself, clean and well lit, with space to read an offer beside it",
    local: "the product or service in a recognisable everyday local setting",
    proof: "the work itself, close up, showing care and quality",
    callout: "the product or service in the setting where its intended customer would use it",
  };
  return [
    `An advertising photograph for: ${f.offering.replace(/[.!]+$/, "")}.`,
    `Show ${scene[d.kind] ?? "the product or service clearly"}.`,
    "Photographic, natural light, uncluttered. No text, words, prices or logos in the image.",
    "If people appear they are anonymous and not presented as customers, reviewers or staff. No before-and-after claims.",
  ].join(" ");
}
