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
export type FactSource = { from: "website"; url: string | null; quote: string | null } | { from: "you" } | { from: "example" };

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

/** What's still missing before a preview can be built — asked, never guessed. */
export function missingFacts(f: PreviewFacts): { key: FactKey | "businessType" | "goal"; ask: string }[] {
  const out: { key: FactKey | "businessType" | "goal"; ask: string }[] = [];
  for (const k of REQUIRED) if (!f[k].trim()) out.push({ key: k, ask: k === "location" ? "Where do you work, or where do you sell to?" : k === "name" ? "What's the business called?" : "What do you offer, in one line?" });
  if (!businessTypeFrom(f.businessType)) out.push({ key: "businessType", ask: "What kind of business is it?" });
  if (!f.goal) out.push({ key: "goal", ask: "What should the first campaign get you?" });
  return out;
}

export type Direction = { angle: HookAngle; label: string; hook: string; why: string; format: string; cta: string; recommended: boolean; uses: FactKey[] };

export type Preview = {
  kind: PreviewKind;
  goal: PreviewGoal;
  name: string;
  plan: { channel: string; objective: string; optimiseFor: string; destination: string; audience: string; exampleBudget: string; budgetWhy: string; why: string };
  directions: Direction[];
  /** Directions that need a fact the owner hasn't given — offered as a way to get more, never filled in. */
  couldAdd: { fact: FactKey; gives: string }[];
  tracking: { events: { name: string; required: boolean; when: string }[]; status: string };
  readiness: { label: string; state: "done" | "next" | "later"; detail: string }[];
  /** Which facts came from where, for the "built from" line. */
  builtFrom: { website: number; you: number };
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

/** Daily amount used in the example; the owner sets the real one, and nothing runs without their approval. */
export const EXAMPLE_DAILY = 15;

export function buildPreview(f: PreviewFacts): Preview | null {
  if (missingFacts(f).length) return null;
  const goal = f.goal as PreviewGoal;
  const kind = previewKind(f.businessType, Boolean(f.destinations?.booking));
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
  const audience = kind === "shop" ? `${who}, where you sell: ${f.location}` : `${who}, within a short drive of ${f.location}`;

  // "Drain repair in Eastfield" plus a location of "Eastfield, OH" would say the town twice; the hooks add the place themselves.
  const town = f.location.split(",")[0].trim();
  const offering = town ? f.offering.replace(new RegExp(`\\s+(?:in|around|across|near|throughout)\\s+${escapeRe(town)}\\b.*$`, "i"), "").trim() || f.offering : f.offering;
  const input: HookInput = { offering, customer: f.customer, location: kind === "shop" ? "" : f.location, offer: f.offer, proof: f.proof, problem: f.problem };
  const set = generateHooks(input);
  const order = ORDER[kind];
  const picked = set.hooks
    .filter((h) => !h.warnings.length && order.includes(h.angle))
    .sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle))
    .slice(0, 3);
  const directions: Direction[] = picked.map((h, i) => ({
    angle: h.angle,
    label: ANGLE_LABEL[h.angle],
    hook: h.text,
    why: h.why,
    format: h.bestFor,
    cta: CTA[goal],
    recommended: i === 0,
    uses: h.uses.filter((u) => u in FACT_LABEL) as FactKey[],
  }));
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
    { label: "Your business details", state: "done", detail: "Confirmed by you just now. You can change any of them later." },
    { label: "Save this plan", state: "next", detail: "A free account keeps it and turns it into your full free plan. No card needed." },
    { label: "Connect your Meta ad account", state: "later", detail: "Your own account — MAIRO never runs ads from an account you don't own." },
    { label: usesLeadForm ? "Set up the lead form" : `Make sure Meta sees each ${optimiseFor.toLowerCase().replace(/s$/, "")}`, state: "later", detail: usesLeadForm ? "MAIRO builds the form with you during setup." : "MAIRO checks the tracking and shows you what it found." },
    { label: "Approve the ad and the budget", state: "later", detail: "Nothing is published or spent until you approve the exact ad and daily budget." },
    { label: "Subscribe to launch", state: "later", detail: `From $${starter.priceMonthly} a month; ${starter.name} includes a ${STARTER_TRIAL_DAYS}-day trial. Your ad budget is paid to Meta separately.` },
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
      exampleBudget: `$${EXAMPLE_DAILY} a day`,
      budgetWhy: `An example to show the shape of the plan, not a recommendation for your business. At $${EXAMPLE_DAILY} a day, one campaign with one audience learns fastest; you set the real amount in your plan.`,
      why: kind === "shop" ? "Meta is where most small shops start: it can find buyers from what people do on Facebook and Instagram, and it reports each purchase back." : "Nearness decides who calls a local business, and Meta can show your ad only to people in your area.",
    },
    directions,
    couldAdd: directions.length < 3 ? couldAdd : couldAdd.slice(0, 2),
    tracking: { events, status },
    readiness,
    builtFrom: { website: sources.filter((s) => s?.from === "website").length, you: sources.filter((s) => s?.from === "you").length },
  };
}
