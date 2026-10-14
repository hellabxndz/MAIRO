import { generateHooks, ANGLE_LABEL, type HookAngle, type HookInput } from "@/lib/creative/hooks";
import { recommendedEvents } from "@/lib/tracking/events";
import { businessTypeFrom } from "@/lib/onboarding/business-types";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import type { ScanResult } from "@/lib/website/scan";

// The campaign preview a visitor sees before they have an account: built from
// facts they confirmed — read from their own website or typed in — and
// nothing else. Pure and deterministic, so the same facts always give the
// same preview, and pinned by scripts/check-preview.ts.
//
// What it is: a first draft of the plan (channel, objective, destination,
// audience, an example budget), three ad directions written from the owner's
// own words, what tracking the campaign needs, and what has to happen before
// anything can run. What it isn't: a forecast. No number of leads, sales or
// returns, no generated pictures, nothing a website didn't say or the owner
// didn't confirm.

export type PreviewKind = "shop" | "service" | "appointments";
export type PreviewGoal = "sales" | "leads" | "bookings";
export type FactKey = "name" | "offering" | "customer" | "location" | "offer" | "proof" | "problem";
export type FactSource = { from: "website"; url: string | null; quote: string | null } | { from: "instagram"; handle: string; quote: string | null } | { from: "you" } | { from: "example" };

export type PreviewFacts = Record<FactKey, string> & {
  /** An onboarding business type id (lib/onboarding/business-types), or "" when not chosen. */
  businessType: string;
  /** Where the business type came from, so the form can say so. */
  typeFrom: "website" | "link" | "you" | "example" | null;
  goal: PreviewGoal | "";
  website: string | null;
  /** Where the site sends people, as read from it. Null when there was no reading. */
  destinations: { booking: string | null; form: boolean; phone: boolean; checkout: boolean } | null;
  /** Whether a Meta pixel was seen on the site; null when the site wasn't read. */
  pixelSeen: boolean | null;
  /** What the owner said they'd like to spend on ads a month, in dollars; null when they didn't say. */
  monthlyBudget?: number | null;
  sources: Partial<Record<FactKey, FactSource>>;
};

export const FACT_LABEL: Record<FactKey, string> = {
  name: "Business name",
  offering: "What you offer",
  customer: "Who it's for",
  location: "Where you work or sell",
  offer: "A current offer",
  proof: "Something true that builds trust",
  problem: "The problem you solve",
};

export const FACT_HINT: Record<FactKey, string> = {
  name: "As customers know it.",
  offering: "One line, in your words — what someone gets from you.",
  customer: "Optional. For example: homeowners, new parents, coffee lovers.",
  location: "A town, an area, or where you ship to.",
  offer: "Optional. Only one you actually run — MAIRO never invents a discount.",
  proof: "Optional. For example: licensed and insured, in business since 2009.",
  problem: "Optional. What's wrong when someone needs you — in their words.",
};

const REQUIRED: FactKey[] = ["name", "offering", "location"];

export function emptyFacts(website: string | null = null): PreviewFacts {
  return { name: "", offering: "", customer: "", location: "", offer: "", proof: "", problem: "", businessType: "", typeFrom: null, goal: "", website, destinations: null, pixelSeen: null, sources: {} };
}

/** A sentence short enough to use as written, without its closing full stop; "" when it isn't. */
function asLine(s: string | null | undefined, max: number): string {
  const v = (s ?? "").replace(/\s+/g, " ").trim();
  return v && v.length <= max ? v.replace(/[.!]+$/, "") : "";
}

const TYPE_FROM_SCHEMA: [RegExp, string][] = [
  [/plumb|electric|hvac|roof|locksmith|homeandconstruction|housepainter|generalcontractor|movingcompany|landscap|clean/i, "home_services"],
  [/hair|beauty|nail|dayspa|tattoo|barber/i, "beauty"],
  [/dent|medical|physician|clinic|optician|physiotherap|veterinar/i, "health_clinic"],
  [/gym|exercise|sportsactivity|yoga|fitness/i, "fitness"],
  [/legal|attorney|lawyer|accounting|financialservice|insurance|notary/i, "professional"],
  [/realestate/i, "real_estate"],
  [/restaurant|cafe|bakery|foodestablishment|bar(?!ber)/i, "restaurant"],
  [/school|educational|tutor/i, "education"],
];

/** The business type the website suggests — a suggestion the owner confirms, never a decision. */
export function suggestedType(r: Pick<ScanResult, "kind" | "business">): string {
  if (r.kind === "shop") return "ecommerce";
  for (const t of r.business.types) for (const [re, id] of TYPE_FROM_SCHEMA) if (re.test(t)) return id;
  return "";
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const APPOINTMENT_TYPES = new Set(["beauty", "health_clinic", "fitness"]);

export function previewKind(businessType: string, hasBooking: boolean): PreviewKind {
  const t = businessTypeFrom(businessType);
  if (t?.kind === "shop") return "shop";
  if (APPOINTMENT_TYPES.has(businessType) || hasBooking) return "appointments";
  return "service";
}

/**
 * The kind of business a plan is built for: from the industry when one was
 * chosen, else from the goal (sales → an online shop, bookings → a business
 * that takes bookings, leads → a local service). The quick plan says when
 * it had to go by the goal.
 */
export function kindOf(f: Pick<PreviewFacts, "businessType" | "destinations" | "goal">): PreviewKind {
  if (businessTypeFrom(f.businessType)) return previewKind(f.businessType, Boolean(f.destinations?.booking));
  return f.goal === "sales" ? "shop" : f.goal === "bookings" || f.destinations?.booking ? "appointments" : "service";
}

export function defaultGoal(kind: PreviewKind): PreviewGoal {
  return kind === "shop" ? "sales" : kind === "appointments" ? "bookings" : "leads";
}

/** Facts from a website reading: only what the site said, each with where it said it. Gaps stay empty. */
export function factsFromScan(r: ScanResult): PreviewFacts {
  const url = r.finalUrl ?? r.requestedUrl;
  const fact = (k: string) => r.facts.find((f) => f.field === k)?.value ?? null;
  const f = emptyFacts(url);
  const set = (k: FactKey, value: string, quote: string | null) => {
    if (!value) return;
    f[k] = value;
    f.sources[k] = { from: "website", url, quote };
  };
  set("name", asLine(fact("name"), 80), null);
  const offering = fact("offering");
  set("offering", asLine(offering, 110), offering);
  set("location", asLine(fact("location"), 80), null);
  const offer = r.offers.find((o) => asLine(o, 70));
  set("offer", asLine(offer, 70), offer ?? null);
  const proofs = r.trust.map((s) => asLine(s, 50)).filter(Boolean);
  const proof = proofs.slice(0, 2).join(". ");
  set("proof", proof.length <= 80 ? proof : proofs[0] ?? "", r.trust.slice(0, 2).join(" ") || null);
  const booking = r.destinations.booking[0]?.provider ?? null;
  const form = r.destinations.forms.some((x) => x.hasSubmit);
  f.destinations = { booking, form, phone: r.destinations.phoneLinks.length > 0, checkout: r.destinations.checkout || r.destinations.cart };
  f.pixelSeen = r.tracking.metaPixelIds.length > 0 || r.tracking.metaPixelScript;
  f.businessType = suggestedType(r);
  f.typeFrom = f.businessType ? "website" : null;
  f.goal = r.kind === "unknown" && !f.businessType ? "" : defaultGoal(previewKind(f.businessType, Boolean(booking)));
  return f;
}

/**
 * Facts from an Instagram profile's public preview: the name and the bio,
 * each marked as from Instagram, and the bio's link as the website (not
 * read yet — that's the visitor's choice). Gaps stay empty.
 */
export function factsFromInstagram(p: { handle: string; name: string | null; bio: string | null; website: string | null }): PreviewFacts {
  const f = emptyFacts(null);
  const name = asLine(p.name, 80);
  if (name) {
    f.name = name;
    f.sources.name = { from: "instagram", handle: p.handle, quote: null };
  }
  const first = p.bio ? (p.bio.match(/^[^.!?\n]+[.!?]?/)?.[0] ?? p.bio) : "";
  const offering = asLine(first, 110);
  if (offering) {
    f.offering = offering;
    f.sources.offering = { from: "instagram", handle: p.handle, quote: p.bio };
  }
  return f;
}

/** What's still missing before a preview can be built — asked, never guessed. */
export function missingFacts(f: PreviewFacts): { key: FactKey | "businessType" | "goal"; ask: string }[] {
  const out: { key: FactKey | "businessType" | "goal"; ask: string }[] = [];
  for (const k of REQUIRED) if (!f[k].trim()) out.push({ key: k, ask: k === "location" ? "Where do you work, or where do you sell to?" : k === "name" ? "What's the business called?" : "What do you offer, in one line?" });
  if (!businessTypeFrom(f.businessType)) out.push({ key: "businessType", ask: "What kind of business is it?" });
  if (!f.goal) out.push({ key: "goal", ask: "What should the first campaign get you?" });
  return out;
}

/**
 * The least a quick plan is built from: the name, what's offered and the
 * goal. Where they are and the industry sharpen it, and the plan says what it
 * did without them — never filling them in.
 */
export function quickMissing(f: PreviewFacts): { key: FactKey | "goal"; ask: string }[] {
  const out: { key: FactKey | "goal"; ask: string }[] = [];
  if (!f.name.trim()) out.push({ key: "name", ask: "What's the business called?" });
  if (!f.offering.trim()) out.push({ key: "offering", ask: "What do you offer, in one line?" });
  if (!f.goal) out.push({ key: "goal", ask: "What should the first campaign get you?" });
  return out;
}

/**
 * The plan's openings: the hook generator's angles, plus two that need
 * nothing but the name, what's offered and the goal — so even a one-line
 * description gets three concepts. Neither says anything the owner didn't.
 */
export type PlanAngle = HookAngle | "invite" | "meet";

export type Direction = {
  angle: PlanAngle;
  label: string;
  /** The opening line — the first words people read. */
  hook: string;
  /** A short headline under the picture, from the owner's own facts. */
  headline: string;
  /** The ad's main text: the hook, then what the owner confirmed. */
  primaryText: string;
  /** What the picture or video should show — a direction, not a generated image. */
  visual: string;
  why: string;
  format: string;
  cta: string;
  recommended: boolean;
  uses: FactKey[];
};

export type Preview = {
  kind: PreviewKind;
  goal: PreviewGoal;
  name: string;
  plan: { channel: string; objective: string; optimiseFor: string; destination: string; audience: string; exampleBudget: string; budgetWhy: string; why: string };
  directions: Direction[];
  /** Other directions the facts support, for "Change direction" — never more than the facts allow. */
  alternatives: Direction[];
  /** Directions that need a fact the owner hasn't given — offered as a way to get more, never filled in. */
  couldAdd: { fact: FactKey; gives: string }[];
  tracking: { events: { name: string; required: boolean; when: string }[]; status: string };
  readiness: { label: string; state: "done" | "next" | "later"; detail: string }[];
  /** Which facts came from where, for the "built from" line. */
  builtFrom: { website: number; instagram: number; you: number };
  /** How the first Meta campaign is built. */
  strategy: { campaign: string; structure: string[]; placements: string; learning: string };
  /** Where the money goes: the owner's own monthly figure when given, else the example. */
  allocation: { daily: number; monthly: number; fromOwner: boolean; parts: { label: string; share: number; when: string; why: string }[] };
  /** The creative plan in a sentence or two. */
  creativeStrategy: string;
  /** The campaign MAIRO would build first. */
  firstCampaign: { name: string; objective: string; budget: string; length: string; judgedOn: string };
  /** Why MAIRO recommends each part of the plan. */
  reasons: { title: string; text: string }[];
  /** What a quick plan went without, and what it did instead — said, never filled in. */
  assumed: { key: "location" | "businessType"; text: string }[];
};

const ORDER: Record<PreviewKind, HookAngle[]> = {
  shop: ["offer", "proof", "callout", "problem", "outcome", "local", "explain"],
  service: ["problem", "local", "offer", "proof", "callout", "explain"],
  appointments: ["offer", "local", "callout", "proof", "problem", "explain"],
};

const GIVES: Partial<Record<FactKey, string>> = {
  problem: "an ad that opens with your customer's problem",
  offer: "an ad that leads with your offer",
  proof: "an ad that opens with proof",
  customer: "an ad that speaks to one kind of customer",
  location: "an ad for people near you",
};

const CTA: Record<PreviewGoal, string> = { sales: "Shop now", leads: "Get quote", bookings: "Book now" };

/** What the picture should show for each kind of opening — a direction for the owner's own photos or a picture made later, never a promise of one. */
const VISUAL: Record<HookAngle, string> = {
  problem: "A real moment of the problem being solved — your own work or product in use, not stock imagery.",
  outcome: "The result your customer gets, shown plainly: the finished job, the product in their life.",
  objection: "A clear, honest close-up that answers the doubt — how it's made, what's included.",
  offer: "Your product or service front and centre, with the offer in large, readable type.",
  local: "A recognisable local setting, your shopfront, van or team at work in the area.",
  proof: "Your team or your work, with the proof point as a short line of text on the picture.",
  callout: "The kind of customer you're speaking to, in their own setting — lifestyle, not studio.",
  moment: "The everyday moment someone realises they need you.",
  explain: "Two or three simple frames: what happens first, next, and what they get.",
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const low = (s: string) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** The two openings that work from the name, the offer and the goal alone — used only to make up three. */
function starterDirections(f: PreviewFacts, goal: PreviewGoal, offering: string): Omit<Direction, "recommended">[] {
  const what = offering.replace(/[.!]+$/, "").trim();
  const name = f.name.trim();
  const invite = goal === "sales" ? `${cap(what)} — order online from ${name}.` : goal === "bookings" ? `Book ${low(what)} with ${name}.` : `Need ${low(what)}? Ask ${name} for a quote.`;
  return [
    {
      angle: "invite",
      label: "Straight to the point",
      hook: invite,
      headline: headlineFor(f, "explain"),
      primaryText: invite,
      visual: "Your product or your work, clear and well lit, with the button's words easy to see.",
      why: "Says plainly what you offer and what to do next — often the clearest ad for people already looking.",
      format: "Picture of your work or product",
      cta: CTA[goal],
      uses: ["name", "offering"],
    },
    {
      angle: "meet",
      label: "Meet the business",
      hook: `Meet ${name}: ${low(what)}.`,
      headline: name.length <= 40 ? name : headlineFor(f, "explain"),
      primaryText: `Meet ${name}: ${low(what)}.`,
      visual: "You or your team at work — a real, everyday moment. Filmed on a phone is fine.",
      why: "Puts a face to the name: people often choose a business they feel they already know.",
      format: "Short video of you or your team",
      cta: CTA[goal],
      uses: ["name", "offering"],
    },
  ];
}

/** A headline short enough for under the picture, from the owner's words. */
function headlineFor(f: PreviewFacts, angle: HookAngle): string {
  const short = (s: string, n = 40) => {
    const v = s.replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
    if (v.length <= n) return v;
    const cut = v.slice(0, n);
    return `${cut.slice(0, cut.lastIndexOf(" ") > 20 ? cut.lastIndexOf(" ") : n).trim()}…`;
  };
  if (angle === "offer" && f.offer.trim()) return short(f.offer);
  if (angle === "proof" && f.proof.trim()) return short(f.proof);
  if (angle === "local" && f.location.trim()) return short(`${f.name} · ${f.location.split(",")[0]}`);
  return short(f.offering);
}

/** The ad's main text: the hook, then one or two things the owner confirmed. Never a claim they didn't make. */
function primaryTextFor(f: PreviewFacts, hook: string, angle: HookAngle): string {
  const parts = [hook.replace(/\s+$/, "")];
  const add = (s: string) => {
    const v = s.trim().replace(/[.!]+$/, "");
    if (v && !parts.some((p) => p.toLowerCase().includes(v.toLowerCase()))) parts.push(`${v}.`);
  };
  if (angle !== "offer" && f.offer.trim()) add(f.offer);
  if (angle !== "proof" && f.proof.trim()) add(f.proof);
  // A place name reads as a sign-off ("Brightwater Plumbing, Eastfield"); a shop's "Ships across the US" doesn't.
  const place = f.location.split(",")[0].trim();
  if (parts.length < 3) add(`${f.name}${place && /^[A-Z][a-z]+(?:\s[A-Z][a-z]+)*$/.test(place) ? `, ${place}` : ""}`);
  return parts.slice(0, 3).join(" ");
}

/** Daily amount used in the example; the owner sets the real one, and nothing runs without their approval. */
export const EXAMPLE_DAILY = 15;

export function buildPreview(f: PreviewFacts, opts: { quick?: boolean } = {}): Preview | null {
  if (opts.quick ? quickMissing(f).length : missingFacts(f).length) return null;
  const goal = f.goal as PreviewGoal;
  const kind = kindOf(f);
  const d = f.destinations;

  const objective =
    goal === "sales" ? "Sales — purchases on your website" : goal === "bookings" ? (d?.booking ? `Bookings — appointments booked through ${d.booking}` : "Bookings — appointments booked on your website") : d?.form ? "Leads — enquiries through your website's form" : "Leads — a short form inside the ad";
  const optimiseFor = goal === "sales" ? "Purchases" : goal === "bookings" ? "Booked appointments" : "Leads";
  const destination =
    goal === "sales"
      ? f.website ?? "Your online shop"
      : goal === "bookings"
        ? d?.booking ? `Your ${d.booking} booking page` : `Your booking page${f.website ? ` (${f.website})` : ""}`
        : d?.form ? `Your website's contact form${f.website ? ` (${f.website})` : ""}` : "A Meta lead form — people ask for a quote without leaving Facebook or Instagram";
  const who = f.customer.trim() || (kind === "shop" ? "People likely to buy what you sell" : "People who need what you offer");
  const place = f.location.trim();
  const audience = kind === "shop" ? (place ? `${who}, where you sell: ${place}` : `${who}, wherever you sell`) : place ? `${who}, within a short drive of ${place}` : `${who}, near you`;

  // "Drain repair in Eastfield" plus a location of "Eastfield, OH" would say the town twice; the hooks add the place themselves.
  const town = f.location.split(",")[0].trim();
  const offering = town ? f.offering.replace(new RegExp(`\\s+(?:in|around|across|near|throughout)\\s+${escapeRe(town)}\\b.*$`, "i"), "").trim() || f.offering : f.offering;
  const input: HookInput = { offering, customer: f.customer, location: kind === "shop" ? "" : f.location, offer: f.offer, proof: f.proof, problem: f.problem };
  const set = generateHooks(input);
  const order = ORDER[kind];
  const usable = set.hooks
    .filter((h) => !h.warnings.length && order.includes(h.angle))
    .sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle));
  const picked = usable.slice(0, 3);
  const toDirection = (h: (typeof usable)[number], i: number): Direction => ({
    angle: h.angle,
    label: ANGLE_LABEL[h.angle],
    hook: h.text,
    headline: headlineFor(f, h.angle),
    primaryText: primaryTextFor(f, h.text, h.angle),
    visual: VISUAL[h.angle],
    why: h.why,
    format: h.bestFor,
    cta: CTA[goal],
    recommended: i === 0,
    uses: h.uses.filter((u) => u in FACT_LABEL) as FactKey[],
  });
  // Fewer than three from the facts given: the openings that need only the name, the offer and the goal make up the rest.
  // "How it works" is the weakest opening to test first, so "Straight to the point" goes ahead of it.
  const real = picked.map(toDirection);
  const [invite, meet] = starterDirections(f, goal, offering).map((d) => ({ ...d, recommended: false }));
  const need = Math.max(0, 3 - real.length);
  const directions: Direction[] = [...real.filter((d) => d.angle !== "explain"), ...(need >= 1 ? [invite] : []), ...real.filter((d) => d.angle === "explain"), ...(need >= 2 ? [meet] : [])].map((d, i) => ({ ...d, recommended: i === 0 }));
  const alternatives: Direction[] = usable.slice(3, 6).map((h) => toDirection(h, -1));
  const couldAdd = (Object.keys(GIVES) as FactKey[])
    .filter((k) => !f[k].trim() && !(k === "location" && kind === "shop"))
    .map((k) => ({ fact: k, gives: GIVES[k]! }));

  // The one event the campaign is judged on is "needed"; the others the business type calls for are "useful".
  const main = goal === "sales" ? "Purchase" : goal === "bookings" ? "Schedule" : "Lead";
  const events = recommendedEvents(kind === "shop" ? "shop" : "service", { booking: Boolean(d?.booking) || goal === "bookings", phone: d?.phone })
    .filter((e) => e.required || e.name === main)
    .map((e) => ({ name: e.name, required: e.name === main, when: e.when }))
    .sort((a, b) => Number(b.required) - Number(a.required));
  const usesLeadForm = goal === "leads" && !d?.form;
  const status = usesLeadForm
    ? "A lead form inside the ad reports each lead to Meta by itself, so the first campaign doesn't need a pixel. One on your website still helps later."
    : f.pixelSeen === true
      ? "A Meta pixel is on your website. During setup MAIRO checks it reports the event below — a pixel being present doesn't mean it does."
      : f.pixelSeen === false
        ? "No Meta pixel was found on the pages read. Setup walks you through adding one, and MAIRO checks it before a campaign can launch."
        : "Your website wasn't read, so MAIRO checks your tracking during setup.";

  const starter = PLANS[0];
  const readiness: Preview["readiness"] = [
    { label: "Your business details", state: "done", detail: "From you just now. You can change any of them later." },
    { label: "Save this plan", state: "next", detail: "A free account keeps it and turns it into your full free plan. No card needed." },
    { label: "Connect your Meta ad account", state: "later", detail: "Your own account — MAIRO never runs ads from an account you don't own." },
    { label: usesLeadForm ? "Set up the lead form" : `Make sure Meta sees each ${optimiseFor.toLowerCase().replace(/s$/, "")}`, state: "later", detail: usesLeadForm ? "MAIRO builds the form with you during setup." : "MAIRO checks the tracking and shows you what it found." },
    { label: "Approve the ad and the budget", state: "later", detail: "Nothing is published or spent until you approve the exact ad and daily budget." },
    { label: "Subscribe to launch", state: "later", detail: `From $${starter.priceMonthly} a month; ${starter.name} includes a ${STARTER_TRIAL_DAYS}-day trial. Your ad budget is paid to Meta separately.` },
  ];

  // The budget: the owner's own monthly figure when they gave one, else the example amount.
  const ownMonthly = f.monthlyBudget && f.monthlyBudget >= 30 && f.monthlyBudget <= 1_000_000 ? Math.round(f.monthlyBudget) : null;
  const monthly = ownMonthly ?? Math.round(EXAMPLE_DAILY * 30.4);
  const daily = Math.max(1, Math.round(monthly / 30.4));
  const result = optimiseFor.toLowerCase().replace(/s$/, "");
  const allocation: Preview["allocation"] = {
    daily,
    monthly,
    fromOwner: ownMonthly !== null,
    parts: [
      { label: "First test", share: 100, when: "Weeks 1–2", why: `All of it to one campaign and one audience, so Meta learns quickly which of the three ads brings ${result}s. Meta divides it between the ads by results.` },
      { label: "After the test", share: 0, when: "From week 3", why: "MAIRO looks at what the test showed and may recommend moving part of the budget — to the best ad, or to people who already visited. Every change waits for your approval." },
    ],
  };
  const rec = directions[0];
  const strategy: Preview["strategy"] = {
    campaign: `One ${goal === "sales" ? "Sales" : goal === "bookings" ? "Bookings" : "Leads"} campaign on Facebook and Instagram, optimised for ${optimiseFor.toLowerCase()}.`,
    structure: [
      `One audience: ${audience}.`,
      `${directions.length === 3 ? "Three" : directions.length === 2 ? "Two" : "One"} ad version${directions.length === 1 ? "" : "s"} — one per direction below — so the results show which opening works.`,
      `People go to: ${destination}.`,
    ],
    placements: "Advantage+ placements: Meta shows the ad where it's likely to do best across Feeds, Stories and Reels on Facebook and Instagram.",
    learning: "Meta needs about a week of delivery to learn who responds. MAIRO doesn't judge the ads before then.",
  };
  const creativeStrategy = rec
    ? `Lead with “${rec.label.toLowerCase()}” — it's built from ${rec.uses.length ? rec.uses.map((u) => FACT_LABEL[u].toLowerCase()).join(", ") : "what you confirmed"}. Run it alongside the other ${directions.length - 1 === 1 ? "direction" : directions.length - 1 === 2 ? "two directions" : "directions"} for two weeks, keep what brings ${result}s, and replace what doesn't.`
    : "Add a few more details to get ad directions.";
  const firstCampaign: Preview["firstCampaign"] = {
    name: `${f.name.trim()} — ${goal === "sales" ? "sales" : goal === "bookings" ? "bookings" : "leads"} test`,
    objective,
    budget: `$${daily} a day${ownMonthly ? ` (about $${monthly.toLocaleString("en-US")} a month, as you said)` : " — an example; you set the real amount"}`,
    length: "Two weeks before judging the ads",
    judgedOn: `What each ${result} costs${f.pixelSeen === false && goal !== "leads" ? " — once your website tracking reports it" : ""}`,
  };
  const reasons: Preview["reasons"] = [
    { title: "Why this objective", text: goal === "sales" ? "You sell online, so the campaign is told to find people likely to buy — not just people likely to click." : goal === "bookings" ? "Booked appointments are what you need, so the campaign is judged on bookings rather than clicks or likes." : "You need people to get in touch, so the campaign is judged on enquiries rather than clicks or likes." },
    { title: "Why this audience", text: kind === "shop" ? "Starting broad within where you sell lets Meta find buyers from behaviour, which usually beats guessing interests on day one." : "People near you are the ones who can become customers, so the ad is shown only within your area." },
    { title: "Why this budget", text: ownMonthly ? `It's the amount you gave. Spread over one campaign, $${daily} a day is enough for Meta to start learning without splitting it too thin.` : `You didn't give a budget, so this uses $${EXAMPLE_DAILY} a day as an example. Your plan uses the amount you choose, and nothing is spent until you approve it.` },
    { title: "Why these ads", text: rec ? `Each one is written from facts you confirmed, so nothing in it is invented. MAIRO suggests testing “${rec.label}” first. ${rec.why}` : "The ads come from facts you confirm." },
  ];

  const sources = Object.values(f.sources);
  return {
    kind,
    goal,
    name: f.name.trim(),
    plan: {
      channel: "Meta — Facebook and Instagram, in one campaign",
      objective,
      optimiseFor,
      destination,
      audience,
      exampleBudget: f.monthlyBudget && f.monthlyBudget >= 30 ? `$${Math.max(1, Math.round(f.monthlyBudget / 30.4))} a day` : `$${EXAMPLE_DAILY} a day`,
      budgetWhy: f.monthlyBudget && f.monthlyBudget >= 30 ? "From the monthly amount you gave, spread evenly. You can change it any time, and nothing is spent until you approve it." : `An example to show the shape of the plan, not a recommendation for your business. At $${EXAMPLE_DAILY} a day, one campaign with one audience learns fastest; you set the real amount in your plan.`,
      why: kind === "shop" ? "Meta is where most small shops start: it can find buyers from what people do on Facebook and Instagram, and it reports each purchase back." : "Nearness decides who calls a local business, and Meta can show your ad only to people in your area.",
    },
    directions,
    alternatives,
    couldAdd: directions.length < 3 ? couldAdd : couldAdd.slice(0, 2),
    tracking: { events, status },
    readiness,
    builtFrom: { website: sources.filter((s) => s?.from === "website").length, instagram: sources.filter((s) => s?.from === "instagram").length, you: sources.filter((s) => s?.from === "you").length },
    strategy,
    allocation,
    creativeStrategy,
    firstCampaign,
    reasons,
    assumed: [
      ...(!place ? [{ key: "location" as const, text: kind === "shop" ? "You didn't say where you sell, so the plan doesn't name an area yet — add it and MAIRO targets it." : "You didn't say where your customers are, so the plan says \"near you\" — add your area and MAIRO shows the ads only there." }] : []),
      ...(!businessTypeFrom(f.businessType) ? [{ key: "businessType" as const, text: `You didn't choose an industry, so MAIRO planned for ${kind === "shop" ? "an online shop" : kind === "appointments" ? "a business that takes bookings" : "a local service"}, from your goal — choose yours to change it.` }] : []),
    ],
  };
}
