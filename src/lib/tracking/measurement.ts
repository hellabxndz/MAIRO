// The guided tracking setup, as rules: what a business can choose to measure,
// what each choice becomes in Meta, where a business stands, and what can be
// honestly reported. Pure; pinned by scripts/check-measurement.ts. The setup
// page (app/dashboard/pixel), onboarding, the launch gate and the report all
// read these answers.
//
// Three things are never confused here:
//   chosen     the owner picked what to measure (a fixed list — nothing else
//              ever becomes an event name, whoever suggested it)
//   installed  code is on the website, or Meta has seen an event from the Pixel
//   verified   Meta received THAT event, per event: a PageView proves nothing
//              about Purchase, and a Purchase without a value and currency is
//              not a purchase MAIRO can report on
//
// And the rule underneath every event: fire on the outcome, not the click. A
// checkout-page visit is InitiateCheckout, never Purchase; a Buy-button click
// is nothing at all.

import type { CheckRecord, CheckStatus } from "@/lib/tracking/state";

// --- what can be measured ----------------------------------------------------

/** Meta's standard events this setup can configure. A closed list. */
export type MeasuredEvent = "ViewContent" | "AddToCart" | "InitiateCheckout" | "Purchase" | "Lead" | "CompleteRegistration" | "Contact";

export type GoalId =
  | "view_content"
  | "add_to_cart"
  | "initiate_checkout"
  | "purchase"
  | "lead"
  | "complete_registration"
  | "phone_click"
  | "meta_lead_form"
  | "call_ads"
  | "qualified_leads";

/** Where a goal is counted: the website Pixel, by Meta on its own, or in MAIRO's own records. */
export type GoalSource = "pixel" | "meta" | "mairo";

export type Goal = {
  id: GoalId;
  label: string;
  /** One line, in the owner's words. */
  detail: string;
  /** The Meta event it becomes. Only pixel goals have one. */
  event: MeasuredEvent | null;
  source: GoalSource;
  group: "shopping" | "leads";
  /** When it fires, and — as important — when it must not. */
  when: string;
  never: string;
  /** What the event must carry for MAIRO to treat it as working. */
  requires: ("value" | "currency")[];
};

export const GOALS: Record<GoalId, Goal> = {
  view_content: {
    id: "view_content",
    label: "Product views",
    detail: "Someone looks at one of your products.",
    event: "ViewContent",
    source: "pixel",
    group: "shopping",
    when: "On a product page.",
    never: "Not on the home page or a list of products.",
    requires: [],
  },
  add_to_cart: {
    id: "add_to_cart",
    label: "Add to cart",
    detail: "Someone puts something in their cart.",
    event: "AddToCart",
    source: "pixel",
    group: "shopping",
    when: "When an item is actually added to the cart.",
    never: "Not on viewing or hovering.",
    requires: [],
  },
  initiate_checkout: {
    id: "initiate_checkout",
    label: "Checkout started",
    detail: "Someone begins checking out.",
    event: "InitiateCheckout",
    source: "pixel",
    group: "shopping",
    when: "When the checkout page opens.",
    never: "Not when the cart opens, and never counted as a purchase.",
    requires: [],
  },
  purchase: {
    id: "purchase",
    label: "Completed purchases",
    detail: "Someone pays and the order is confirmed — with its value.",
    event: "Purchase",
    source: "pixel",
    group: "shopping",
    when: "Once per order, on the order confirmation, with the order's value, currency and ID.",
    never: "Never on a Buy-button click or a checkout-page visit — only a confirmed order is a purchase.",
    requires: ["value", "currency"],
  },
  lead: {
    id: "lead",
    label: "Submitted inquiries",
    detail: "Someone sends an enquiry form on your website.",
    event: "Lead",
    source: "pixel",
    group: "leads",
    when: "When an enquiry form is sent.",
    never: "Never with what they typed: no names, emails or messages go to Meta.",
    requires: [],
  },
  complete_registration: {
    id: "complete_registration",
    label: "Completed registrations",
    detail: "Someone finishes signing up or registering.",
    event: "CompleteRegistration",
    source: "pixel",
    group: "leads",
    when: "When the sign-up is complete — the confirmation page or message.",
    never: "Not when the sign-up form opens.",
    requires: [],
  },
  phone_click: {
    id: "phone_click",
    label: "Taps on your phone number (website)",
    detail: "Someone taps your phone number on your website. A tap isn't a call — MAIRO can't tell whether they rang.",
    event: "Contact",
    source: "pixel",
    group: "leads",
    when: "When a phone link on your website is tapped.",
    never: "Not counted as a call or a lead.",
    requires: [],
  },
  meta_lead_form: {
    id: "meta_lead_form",
    label: "Forms inside your ads (Meta lead forms)",
    detail: "Meta counts every form sent from the ad itself. Nothing to install on your website.",
    event: null,
    source: "meta",
    group: "leads",
    when: "Counted by Meta when the form in the ad is sent.",
    never: "Not a website event — no Pixel involved.",
    requires: [],
  },
  call_ads: {
    id: "call_ads",
    label: "Calls from call ads",
    detail: "Meta counts taps on the call button in a call ad. It can't confirm the call connected or how long it lasted.",
    event: null,
    source: "meta",
    group: "leads",
    when: "Counted by Meta when the ad's call button is tapped.",
    never: "Not proof of a completed call, and not a qualified lead.",
    requires: [],
  },
  qualified_leads: {
    id: "qualified_leads",
    label: "Qualified leads you mark",
    detail: "The enquiries you mark as good ones in MAIRO's Leads page — the most honest measure of a lead business.",
    event: null,
    source: "mairo",
    group: "leads",
    when: "When you mark a lead as qualified, booked or a customer in Leads.",
    never: "Not sent to Meta's Pixel.",
    requires: [],
  },
};

/** Display and storage order. */
export const GOAL_ORDER: GoalId[] = ["view_content", "add_to_cart", "initiate_checkout", "purchase", "lead", "complete_registration", "phone_click", "meta_lead_form", "call_ads", "qualified_leads"];

export const SHOPPING_JOURNEY: GoalId[] = ["view_content", "add_to_cart", "initiate_checkout", "purchase"];

export const SHOPPING_PRESET = {
  title: "Recommended: track the full shopping journey.",
  detail: "See where shoppers drop off—from viewing a product to completing a purchase.",
};

/** What MAIRO doesn't measure, said plainly next to the lead choices. */
export const COMPLETED_CALLS_NOTE =
  "Completed calls aren't measured: that needs a call-tracking service, which MAIRO doesn't connect to. Taps on a phone number or a call button are counted, and you can mark calls that became customers in Leads.";

export function isGoalId(x: unknown): x is GoalId {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(GOALS, x);
}

/** Only ids in the fixed list survive, once each, in display order. Anything else is reported as dropped. */
export function validateGoals(raw: unknown): { goals: GoalId[]; dropped: string[] } {
  const list = Array.isArray(raw) ? raw : [];
  const dropped: string[] = [];
  const seen = new Set<GoalId>();
  for (const x of list.slice(0, 30)) {
    if (isGoalId(x)) seen.add(x);
    else dropped.push(typeof x === "string" ? x.slice(0, 40) : String(x).slice(0, 40));
  }
  return { goals: GOAL_ORDER.filter((g) => seen.has(g)), dropped };
}

/** The stored column, read defensively: malformed JSON or unknown ids never reach the page or Meta. */
export function goalsFrom(stored: string | null | undefined): GoalId[] {
  if (!stored) return [];
  try {
    return validateGoals(JSON.parse(stored)).goals;
  } catch {
    return [];
  }
}

export function pixelGoals(goals: GoalId[]): GoalId[] {
  return goals.filter((g) => GOALS[g].source === "pixel");
}

/** The Meta events the website must send for these goals. */
export function eventsFor(goals: GoalId[]): MeasuredEvent[] {
  return pixelGoals(goals).map((g) => GOALS[g].event!) as MeasuredEvent[];
}

// --- suggestions ---------------------------------------------------------------

export type SuggestInput = {
  sellsOnline: boolean;
  /** How the owner said leads come in (lib/tracking/pixel-rules.ts LEAD_MEASUREMENT), if they did. */
  leadMeasurement?: "calls" | "meta_forms" | "crm" | "other" | null;
  /** What MAIRO read on the website, when it could. */
  site?: { forms: boolean; phoneLinks: boolean; booking: boolean; checkout: boolean; cart: boolean } | null;
};

export type Suggestion = { goals: GoalId[]; why: Partial<Record<GoalId, string>>; preset: "shopping_journey" | "leads"; source: "rules" | "ai" };

/** MAIRO's own suggestion, from facts it has. Always available; the AI's is checked against the same list. */
export function suggestGoals(input: SuggestInput): Suggestion {
  if (input.sellsOnline || input.site?.checkout) {
    return {
      goals: [...SHOPPING_JOURNEY],
      why: {
        view_content: "The first step of the journey.",
        add_to_cart: "Far more common than a sale, so Meta learns from it sooner.",
        initiate_checkout: "A gap between this and purchases is a checkout problem, not an ads problem.",
        purchase: "What your ads are judged on, with the order's value.",
      },
      preset: "shopping_journey",
      source: "rules",
    };
  }
  const goals: GoalId[] = [];
  const why: Partial<Record<GoalId, string>> = {};
  const site = input.site;
  if (!site || site.forms) {
    goals.push("lead");
    why.lead = site?.forms ? "MAIRO found an enquiry form on your website." : "Most service businesses get enquiries through a website form.";
  }
  if (site?.booking) {
    goals.push("complete_registration");
    why.complete_registration = "Your website links to a booking or sign-up tool.";
  }
  if (site?.phoneLinks || input.leadMeasurement === "calls") {
    goals.push("phone_click", "call_ads");
    why.phone_click = "Your website has a tap-to-call number.";
    why.call_ads = "Call ads count taps on their call button without any website setup.";
  }
  if (input.leadMeasurement === "meta_forms") {
    goals.push("meta_lead_form");
    why.meta_lead_form = "You said leads come through forms inside the ad — Meta counts those itself.";
  }
  goals.push("qualified_leads");
  why.qualified_leads = "Marking which enquiries were real is how MAIRO tells good leads from clicks.";
  return { goals: validateGoals(goals).goals, why, preset: "leads", source: "rules" };
}

/**
 * The AI's suggestion, accepted only as data: ids from the fixed list, with a
 * short reason each. Unknown ids are dropped (and reported), and nothing the
 * AI says can mark anything as installed or working — this returns a
 * suggestion, never a status. Falls back to the rules when nothing usable is left.
 */
export function acceptAiSuggestion(text: string, fallback: Suggestion): { suggestion: Suggestion; dropped: string[] } {
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  let parsed: { goals?: unknown; why?: unknown } | null = null;
  try {
    parsed = json ? (JSON.parse(json) as { goals?: unknown; why?: unknown }) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) return { suggestion: fallback, dropped: [] };
  const { goals, dropped } = validateGoals(parsed.goals);
  if (goals.length === 0) return { suggestion: fallback, dropped };
  const why: Partial<Record<GoalId, string>> = {};
  if (parsed.why && typeof parsed.why === "object") {
    for (const g of goals) {
      const v = (parsed.why as Record<string, unknown>)[g];
      if (typeof v === "string") why[g] = v.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 160);
    }
  }
  return { suggestion: { goals, why, preset: fallback.preset, source: "ai" }, dropped };
}

// --- the website platform ------------------------------------------------------

export type SitePlatform = "shopify" | "woocommerce" | "wordpress" | "wix" | "squarespace" | "webflow" | "custom" | "other";

export const PLATFORMS: Record<SitePlatform, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce (WordPress shop)",
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  webflow: "Webflow",
  custom: "A custom-built website",
  other: "Something else / not sure",
};

export function platformFrom(raw: string | null | undefined): SitePlatform | null {
  return raw && Object.prototype.hasOwnProperty.call(PLATFORMS, raw) ? (raw as SitePlatform) : null;
}

/** The website reader's guess, as one of the options — only ever offered for the owner to confirm. */
export function platformGuess(detected: { name: string; confidence: "certain" | "likely" } | null | undefined): { platform: SitePlatform; confidence: "certain" | "likely" } | null {
  if (!detected) return null;
  const n = detected.name.toLowerCase();
  const map: [RegExp, SitePlatform][] = [
    [/shopify/, "shopify"],
    [/woocommerce/, "woocommerce"],
    [/wordpress/, "wordpress"],
    [/wix/, "wix"],
    [/squarespace/, "squarespace"],
    [/webflow/, "webflow"],
  ];
  const hit = map.find(([re]) => re.test(n));
  return { platform: hit ? hit[1] : "other", confidence: detected.confidence };
}

// --- installing ----------------------------------------------------------------

export type InstallMethod = "native" | "mairo_tag";

export type InstallPlan = {
  method: InstallMethod;
  /** What it's called where the owner will see it. */
  title: string;
  summary: string;
  steps: string[];
  /** Goals this route covers on its own, and the ones it doesn't. */
  covers: GoalId[];
  notCovered: { goal: GoalId; why: string }[];
  /** Server-side events: who sends them, so nothing sends a second copy. */
  server: string;
  /** Said on every plan: MAIRO doesn't install anything by itself. */
  automatic: false;
  warnings: string[];
};

const NO_DOUBLE = "Use one route only: adding a second Pixel code (or MAIRO's tag) next to it counts every event twice.";

/**
 * How to get the chosen events onto this kind of website. A platform's own
 * Meta integration comes first when there is one — it knows the order value
 * and sends server events itself — and MAIRO's one-line tag covers the rest.
 * Nothing here is installed for the owner; every route ends in a check.
 */
export function installPlan(platform: SitePlatform, goals: GoalId[]): InstallPlan {
  const pix = pixelGoals(goals);
  const shopping = pix.filter((g) => GOALS[g].group === "shopping");
  const leads = pix.filter((g) => GOALS[g].group === "leads");
  const tag = (summary: string, extraWarnings: string[] = []): InstallPlan => ({
    method: "mairo_tag",
    title: "MAIRO's one-line tag",
    summary,
    steps: [
      "Copy the line below and paste it into your website's <head>, on every page (the steps for your website are shown).",
      ...(leads.includes("lead") ? ["Enquiry forms are counted when they're sent — nothing else to add."] : []),
      ...(leads.includes("phone_click") ? ["Taps on phone links are counted automatically."] : []),
      ...(leads.includes("complete_registration") ? ["On the page shown after someone finishes signing up, add: mairo('track', 'CompleteRegistration')."] : []),
      ...(shopping.includes("view_content") ? ["On product pages, add: mairo('track', 'ViewContent')."] : []),
      ...(shopping.includes("add_to_cart") ? ["When an item is added to the cart, call: mairo('track', 'AddToCart')."] : []),
      ...(shopping.includes("initiate_checkout") ? ["When checkout opens, call: mairo('track', 'InitiateCheckout')."] : []),
      ...(shopping.includes("purchase")
        ? ["Only on the order confirmation, once per order: mairo('purchase', { value: ORDER_TOTAL, currency: 'USD', order_id: ORDER_ID }). Without a value and currency MAIRO doesn't send it."]
        : []),
      "Then come back and press “Check with Meta”.",
    ],
    covers: pix,
    notCovered: [],
    server: "MAIRO's tag sends each event from the browser and through MAIRO's server with the same event ID, so Meta counts it once.",
    automatic: false,
    warnings: [NO_DOUBLE, ...extraWarnings],
  });

  switch (platform) {
    case "shopify":
      return {
        method: "native",
        title: "Shopify — Meta's Facebook & Instagram app",
        summary: "Shopify's own Meta app sends product views, add to cart, checkout started and purchases (with the order value) — browser and server — without any code.",
        steps: [
          "In Shopify, add Meta's Facebook & Instagram app (Sales channels).",
          "Connect the same Meta business and choose this Pixel (Meta may call it a dataset).",
          "Set customer data sharing to the highest level your store's privacy settings allow — that turns on server events.",
          "Place a test order you then cancel or refund, and press “Check with Meta”.",
        ],
        covers: pix.filter((g) => GOALS[g].group === "shopping"),
        notCovered: leads.map((g) => ({ goal: g, why: "Shopify's Meta app tracks shopping. Count enquiries with Meta lead forms or by marking leads in MAIRO instead of adding a second Pixel code." })),
        server: "Shopify's app sends purchases server-side itself, so MAIRO doesn't send your Shopify orders to Meta a second time.",
        automatic: false,
        warnings: [NO_DOUBLE, "Shopify runs the Pixel where a page check can't see it, so MAIRO verifies through Meta's event counts."],
      };
    case "woocommerce":
      return {
        method: "native",
        title: "WooCommerce — the official Facebook for WooCommerce plugin",
        summary: "The official plugin sends shopping events, including purchases with their value, from the browser and the server.",
        steps: [
          "In WordPress, install the Facebook for WooCommerce plugin (Plugins → Add New).",
          "Connect it to the same Meta business and choose this Pixel.",
          "Place a test order you then cancel or refund, and press “Check with Meta”.",
        ],
        covers: pix.filter((g) => GOALS[g].group === "shopping"),
        notCovered: leads.map((g) => ({ goal: g, why: "The plugin is for shopping events. For enquiry forms, mark leads in MAIRO, or ask a developer to add a Lead event to the form's success message." })),
        server: "The plugin sends server events itself, so MAIRO doesn't send your orders to Meta again.",
        automatic: false,
        warnings: [NO_DOUBLE],
      };
    case "wix":
    case "squarespace":
      if (shopping.length > 0) {
        return {
          method: "native",
          title: platform === "wix" ? "Wix — Marketing Integrations → Meta Pixel & CAPI" : "Squarespace — the built-in Meta Pixel setting",
          summary: `${PLATFORMS[platform]}'s own Meta setting sends its store's shopping events, including purchases with their value.`,
          steps: [
            platform === "wix" ? "In Wix, open Marketing Integrations and choose Meta Pixel & CAPI." : "In Squarespace, find the Facebook / Meta Pixel field in your marketing or external services settings.",
            "Paste this Pixel's ID (shown under Details) and save.",
            "Place a test order you then cancel or refund, and press “Check with Meta”.",
          ],
          covers: shopping,
          notCovered: leads.map((g) => ({ goal: g, why: `Check whether ${PLATFORMS[platform]}'s setting lists this event; if it doesn't, mark leads in MAIRO instead of adding a second Pixel code.` })),
          server: `${PLATFORMS[platform]} decides whether server events are sent; MAIRO doesn't add its own on top.`,
          automatic: false,
          warnings: [NO_DOUBLE, "Menus in these tools change from time to time — the check at the end is what counts."],
        };
      }
      return tag(`${PLATFORMS[platform]} lets you paste one line into every page's header — MAIRO's tag then counts the events you chose.`);
    case "wordpress":
      return tag("Paste one line into your WordPress header (the free WPCode plugin does it without editing your theme).");
    case "webflow":
      return tag("Paste one line into Webflow's site-wide head code.");
    case "custom":
    case "other":
    default:
      return tag(
        shopping.length > 0
          ? "One line on every page, plus a short call for each shopping step — a two-minute job for whoever built your website. Send them the developer notes."
          : "One line on every page — send it to whoever built your website if you can't paste it yourself.",
      );
  }
}

/** The notes for a developer: what to send, where, and the rules that make it count. Copy, not an installation. */
export function developerNotes(input: { pixelId: string; snippet: string | null; goals: GoalId[]; website: string | null }): string {
  const lines = [
    `Meta tracking for ${input.website ?? "our website"} — requested through MAIRO`,
    `Meta Pixel ID: ${input.pixelId}`,
    "",
    input.snippet ? `1. Add this line inside <head> on every page:\n   ${input.snippet}` : "1. Add the Meta Pixel base code for this Pixel inside <head> on every page.",
    "",
    "2. Events we measure, and exactly when each fires:",
    ...pixelGoals(input.goals).map((g) => {
      const goal = GOALS[g];
      const call =
        goal.event === "Purchase"
          ? "mairo('purchase', { value: ORDER_TOTAL, currency: 'USD', order_id: ORDER_ID })"
          : goal.event === "Lead"
            ? "automatic on form send (or mairo('track', 'Lead') on the success message)"
            : goal.event === "Contact"
              ? "automatic on tel: link taps"
              : `mairo('track', '${goal.event}')`;
      return `   - ${goal.event}: ${goal.when} ${goal.never} → ${call}`;
    }),
    "",
    "3. Rules:",
    "   - Purchase only on the confirmed-order page, once per order, with the real total (a number) and a 3-letter currency.",
    "   - Never put form contents, names, emails or phone numbers in an event or in the page address.",
    "   - Don't add a second copy of the Meta Pixel code: MAIRO's tag loads it, and sends a server copy with the same event ID so Meta counts each event once.",
    "",
    "When it's live, MAIRO checks with Meta that each event is arriving.",
  ];
  return lines.join("\n");
}

// --- where a business stands ---------------------------------------------------

export type SetupState =
  | "not_started"
  | "goals_saved"
  | "pixel_selected"
  | "installation_needed"
  | "waiting_for_verification"
  | "receiving_events"
  | "needs_attention"
  | "deferred"
  | "no_website_tracking";

export const SETUP_STATE_LABEL: Record<SetupState, string> = {
  not_started: "Not set up yet",
  goals_saved: "Measurement goals saved",
  pixel_selected: "Pixel selected",
  installation_needed: "Installation needed",
  waiting_for_verification: "Waiting for verification",
  receiving_events: "Receiving events",
  needs_attention: "Needs attention",
  deferred: "Setup deferred",
  no_website_tracking: "Nothing to install",
};

export type EventStatus = "verified" | "not_seen" | "not_checked" | "missing_value" | "permission" | "failed";

export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  verified: "Receiving",
  not_seen: "Not received yet",
  not_checked: "Not checked yet",
  missing_value: "Received — without value or currency",
  permission: "MAIRO isn't allowed to check",
  failed: "Check didn't finish",
};

/** One event's state from its latest checks. Purchase also needs Meta to have seen value and currency on it. */
export function eventStatus(event: MeasuredEvent, check: CheckRecord | null | undefined, params?: CheckRecord | null): EventStatus {
  if (!check) return "not_checked";
  const map: Record<CheckStatus, EventStatus> = { VERIFIED: "verified", NOT_SEEN: "not_seen", NOT_DETECTED: "not_seen", MISSING_PERMISSION: "permission", FAILED: "failed", UNAVAILABLE: "failed" };
  const s = map[check.status] ?? "failed";
  if (s === "verified" && event === "Purchase" && params && params.status === "NOT_SEEN") return "missing_value";
  return s;
}

export type StateInput = {
  goals: GoalId[];
  goalsSavedAt: Date | null;
  deferredAt: Date | null;
  pixel: { lastFiredAt: Date | null; accessLost: boolean; otherAdAccount: boolean } | null;
  installVerified: boolean;
  installRoute: string | null;
  installMarkedAt: Date | null;
  /** Latest check per event, keyed by Meta event name. */
  events: Partial<Record<MeasuredEvent, CheckRecord>>;
  purchaseParams: CheckRecord | null;
};

export type StateView = { state: SetupState; label: string; next: string; events: { goal: GoalId; event: MeasuredEvent; status: EventStatus }[] };

export function setupState(i: StateInput): StateView {
  const events = pixelGoals(i.goals).map((g) => {
    const event = GOALS[g].event!;
    return { goal: g, event, status: eventStatus(event, i.events[event], event === "Purchase" ? i.purchaseParams : null) };
  });
  const view = (state: SetupState, next: string): StateView => ({ state, label: SETUP_STATE_LABEL[state], next, events });

  if (i.deferredAt) return view("deferred", "Pick up where you left off whenever you're ready.");
  if (!i.goalsSavedAt || i.goals.length === 0) return view("not_started", "Choose what you want to measure.");
  if (events.length === 0) return view("no_website_tracking", "What you chose is counted by Meta or in MAIRO — nothing to install on your website.");
  if (!i.pixel) return view("goals_saved", "Choose the Pixel to send these events to, or create one.");
  if (i.pixel.accessLost || i.pixel.otherAdAccount) return view("needs_attention", "MAIRO can't reach your Pixel any more. Re-check access or reconnect Meta.");
  const permission = events.find((e) => e.status === "permission");
  if (permission) return view("needs_attention", "Your Meta connection isn't allowed to read this Pixel's events. Reconnect Meta, or check in Events Manager.");
  const noValue = events.find((e) => e.status === "missing_value");
  if (noValue) return view("needs_attention", "Purchases are arriving without a value or currency. Fix the purchase code so each one carries the order total.");

  const installed = i.installVerified || i.pixel.lastFiredAt !== null;
  if (!installed) {
    if (!i.installRoute) return view("pixel_selected", "Pick how it goes on your website — MAIRO shows the steps for your platform.");
    if (i.installMarkedAt) return view("waiting_for_verification", "Do each action once yourself (or wait for visitors), then check with Meta.");
    return view("installation_needed", "Follow the steps for your website, then tell MAIRO it's done.");
  }
  if (events.every((e) => e.status === "verified")) return view("receiving_events", "Meta is receiving every event you chose.");
  const failed = events.find((e) => e.status === "failed");
  if (failed) return view("needs_attention", "The last check didn't finish. Try again in a minute.");
  return view("waiting_for_verification", "Some events haven't arrived yet. Do each one yourself once, wait a few minutes, then check again.");
}

// --- what depends on it ------------------------------------------------------------

export const MEASUREMENT_DEPENDENCIES: { feature: string; needs: string; enforced: boolean }[] = [
  { feature: "Campaigns aimed at website purchases", needs: "Completed purchases chosen, and your Pixel receiving website events. MAIRO won't launch one without it.", enforced: true },
  { feature: "Cost per purchase and return on ad spend", needs: "Completed purchases arriving with their value and currency.", enforced: false },
  { feature: "Website enquiry campaigns that learn who enquires", needs: "Submitted inquiries arriving — recommended, not required.", enforced: false },
  { feature: "Lead form, call and message campaigns", needs: "Nothing on your website — Meta counts these itself.", enforced: false },
];

// --- honest reporting ------------------------------------------------------------

export const MIN_EVENTS_FOR_RATES = 30;
const STALE_MS = 48 * 36e5;

export type ReportRow = {
  goal: GoalId;
  label: string;
  /** Null when there is no reading — shown as unavailable, never as zero. */
  value: number | null;
  unit: string;
  source: string;
  window: { start: Date; end: Date } | null;
  checkedAt: Date | null;
  stale: boolean;
  limitation: string;
};

export type FunnelStep = { goal: GoalId; label: string; events: number; fromPrevious: number | null };

export type MeasurementReport = {
  rows: ReportRow[];
  storeOrders: { count: number; revenueCents: number; currency: string; window: { start: Date; end: Date }; lastReceivedAt: Date | null } | null;
  /** Website events are counted as events; Meta's Pixel stats have no count of people. */
  uniquePeople: { available: false; why: string };
  funnel: { steps: FunnelStep[] } | { steps: null; why: string };
  insights: string[];
};

export type ReportInput = {
  goals: GoalId[];
  /** Latest check per event, from one verification run when possible. */
  checks: Partial<Record<MeasuredEvent, CheckRecord & { windowStart: Date | null; windowEnd: Date | null }>>;
  storeOrders: MeasurementReport["storeOrders"];
  now?: Date;
};

export function measurementReport(i: ReportInput): MeasurementReport {
  const now = i.now ?? new Date();
  const rows: ReportRow[] = i.goals.map((g) => {
    const goal = GOALS[g];
    if (goal.source !== "pixel") {
      return {
        goal: g,
        label: goal.label,
        value: null,
        unit: "",
        source: goal.source === "meta" ? "Meta, per campaign" : "Your Leads page",
        window: null,
        checkedAt: null,
        stale: false,
        limitation: goal.source === "meta" ? "Reported by Meta for each campaign, with Meta's attribution — see the campaign's results." : "Counted from the leads you mark in MAIRO.",
      };
    }
    const c = i.checks[goal.event!];
    const readable = c && (c.status === "VERIFIED" || c.status === "NOT_SEEN") && c.count !== null;
    return {
      goal: g,
      label: goal.label,
      value: readable ? c.count : null,
      unit: "website events",
      source: "Meta Pixel event counts",
      window: c?.windowStart && c.windowEnd ? { start: c.windowStart, end: c.windowEnd } : null,
      checkedAt: c?.checkedAt ?? null,
      stale: c ? now.getTime() - c.checkedAt.getTime() > STALE_MS : false,
      limitation: !c
        ? "Not checked yet."
        : !readable
          ? "Unavailable — the last check couldn't read this from Meta."
          : "Events Meta received from your Pixel — not people, and not conversions Meta credits to an ad.",
    };
  });

  const funnel = shoppingFunnel(i.goals, i.checks);
  const insights: string[] = [];
  if ("steps" in funnel && funnel.steps) {
    let worst: FunnelStep | null = null;
    for (const s of funnel.steps) if (s.fromPrevious !== null && (!worst || s.fromPrevious < (worst.fromPrevious ?? 1))) worst = s;
    if (worst && worst.fromPrevious !== null) {
      const i2 = funnel.steps.indexOf(worst);
      insights.push(`The biggest drop is from ${funnel.steps[i2 - 1].label.toLowerCase()} to ${worst.label.toLowerCase()}: ${Math.round(worst.fromPrevious * 100)} ${worst.label.toLowerCase()} events for every 100 ${funnel.steps[i2 - 1].label.toLowerCase()} events, over the same 7 days. Event counts, not shoppers — one person can view a product several times.`);
    }
  } else if (i.goals.some((g) => SHOPPING_JOURNEY.includes(g))) {
    insights.push(funnel.why);
  }
  for (const r of rows) {
    if (r.value === 0) insights.push(`Meta received no ${r.label.toLowerCase()} in the last 7 days. If that's unexpected, do one yourself and check again.`);
    else if (r.value !== null && r.value < MIN_EVENTS_FOR_RATES) insights.push(`Only ${r.value} ${r.label.toLowerCase()} so far — too few to read much into yet.`);
  }
  if (i.storeOrders && i.checks.Purchase?.count != null) {
    insights.push("Your store's orders and Meta's purchase events are counted differently (orders recorded vs. events received), so they're shown side by side, not compared as a rate.");
  }
  return {
    rows,
    storeOrders: i.storeOrders,
    uniquePeople: { available: false, why: "Meta's Pixel reports how many events arrived, not how many different people sent them." },
    funnel,
    insights,
  };
}

/** The shopping funnel only from one source and one window, and only with enough events to mean something. */
export function shoppingFunnel(goals: GoalId[], checks: ReportInput["checks"]): MeasurementReport["funnel"] {
  const steps = SHOPPING_JOURNEY.filter((g) => goals.includes(g));
  if (steps.length < 2) return { steps: null, why: "Choose at least two shopping steps to see where shoppers drop off." };
  const rows = steps.map((g) => ({ g, c: checks[GOALS[g].event!] }));
  if (rows.some((r) => !r.c || r.c.count === null || (r.c.status !== "VERIFIED" && r.c.status !== "NOT_SEEN"))) {
    return { steps: null, why: "The drop-off view needs a reading of every shopping step from Meta — run the check." };
  }
  const ends = rows.map((r) => r.c!.windowEnd?.getTime() ?? 0);
  if (Math.max(...ends) - Math.min(...ends) > 5 * 60 * 1000 || ends.some((e) => e === 0)) {
    return { steps: null, why: "The steps were read at different times, so they can't be compared. Run the check again to read them together." };
  }
  if ((rows[0].c!.count ?? 0) < MIN_EVENTS_FOR_RATES) {
    return { steps: null, why: `Not enough shopping activity yet to show drop-off (fewer than ${MIN_EVENTS_FOR_RATES} ${GOALS[rows[0].g].label.toLowerCase()} in 7 days).` };
  }
  return {
    steps: rows.map((r, idx) => {
      const prev = idx > 0 ? rows[idx - 1].c!.count ?? 0 : null;
      return { goal: r.g, label: GOALS[r.g].label, events: r.c!.count ?? 0, fromPrevious: prev === null ? null : prev > 0 ? (r.c!.count ?? 0) / prev : null };
    }),
  };
}
