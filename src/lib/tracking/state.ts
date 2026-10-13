// Where a business stands with tracking, worked out from what has actually
// been checked — never from what MAIRO did. Pure; pinned by
// scripts/check-tracking-setup.ts.
//
// The stages, in order:
//   no asset → asset selected → installation pending → installation detected
//   → event verification pending → verified
//
// And the results a check can come back with, kept apart on purpose:
//   VERIFIED            seen, with a source to point at
//   NOT_DETECTED        the pixel's code wasn't found on the pages read
//   NOT_SEEN            Meta received none of that event in the window
//   MISSING_PERMISSION  the connection isn't allowed to ask
//   FAILED              the check itself didn't work (network, Meta error)
// Only FAILED is a failure. The others are answers, and each has its own next
// step.

export type CheckStatus = "VERIFIED" | "NOT_SEEN" | "NOT_DETECTED" | "MISSING_PERMISSION" | "FAILED";
export type CheckSource = "meta_stats" | "meta_last_fired" | "public_scan";
export type CheckRecord = { status: CheckStatus; source: CheckSource; detail: string | null; count: number | null; checkedAt: Date };

export type TrackingStage = "no_asset" | "asset_selected" | "installation_pending" | "installation_detected" | "event_verification_pending" | "verified";

export const STAGE_ORDER: TrackingStage[] = ["no_asset", "asset_selected", "installation_pending", "installation_detected", "event_verification_pending", "verified"];

export const STAGE_LABEL: Record<TrackingStage, string> = {
  no_asset: "No pixel chosen yet",
  asset_selected: "Pixel chosen",
  installation_pending: "Installation pending",
  installation_detected: "Installation detected",
  event_verification_pending: "Event verification pending",
  verified: "Verified",
};

export type StageInput = {
  pixel: { id: string; lastFiredAt: Date | null } | null;
  installRoute: string | null;
  installMarkedAt: Date | null;
  install: CheckRecord | null;
  /** The event the campaign is judged on, e.g. "Lead" or "Purchase". Null when the first campaign doesn't need one (a Meta lead form). */
  requiredEvent: string | null;
  events: Record<string, CheckRecord | undefined>;
};

export type StageView = { stage: TrackingStage; label: string; next: string };

export function trackingStage(i: StageInput): StageView {
  const view = (stage: TrackingStage, next: string): StageView => ({ stage, label: STAGE_LABEL[stage], next });
  if (!i.pixel) return view("no_asset", "Choose the pixel you already have, or ask MAIRO to create one in your ad account.");
  // Installed is proven by the code being on the site or by Meta having seen any event from it.
  const installed = i.install?.status === "VERIFIED" || i.pixel.lastFiredAt !== null;
  if (!installed) {
    if (i.installRoute || i.installMarkedAt) return view("installation_pending", "Finish the installation steps, then run the check — MAIRO looks at your website and asks Meta.");
    return view("asset_selected", "Pick how you'll install it — MAIRO shows the steps for your website.");
  }
  if (!i.requiredEvent) return view("verified", "Nothing else needed for the first campaign.");
  const ev = i.events[i.requiredEvent];
  if (ev?.status === "VERIFIED") return view("verified", `Meta is receiving ${i.requiredEvent} events.`);
  if (!ev) return view("installation_detected", `Now check that Meta receives a ${i.requiredEvent} event — complete one yourself, then run the event check.`);
  return view("event_verification_pending", nextForEvent(i.requiredEvent, ev.status));
}

function nextForEvent(event: string, status: CheckStatus): string {
  switch (status) {
    case "NOT_SEEN":
      return `Meta hasn't received a ${event} yet. Complete one yourself (a test enquiry or order), wait a few minutes, and check again.`;
    case "MISSING_PERMISSION":
      return "Your Meta connection isn't allowed to read this pixel's events. Reconnect Meta and grant access to the pixel, or check it in Events Manager.";
    case "FAILED":
      return "The check didn't finish. Try again in a minute.";
    default:
      return `Check the ${event} event.`;
  }
}

/** What the first campaign may do with tracking in its current state. */
export function campaignHandoff(stage: TrackingStage, requiredEvent: string | null): { ready: boolean; optimiseFor: string; note: string } {
  if (!requiredEvent) return { ready: true, optimiseFor: "Leads from the form inside the ad", note: "Meta counts each lead from its own form, so the first campaign doesn't wait on a pixel." };
  if (stage === "verified") return { ready: true, optimiseFor: requiredEvent, note: `Meta can optimise for ${requiredEvent} because it is receiving them.` };
  return {
    ready: false,
    optimiseFor: requiredEvent,
    note: `Until Meta is receiving ${requiredEvent} events, a campaign optimised for them can't learn. MAIRO won't present the setup as ready.`,
  };
}

// --- consent for server-side events -----------------------------------------

export type ConsentPolicy = "respect_denied" | "require_granted";
export type OrderConsent = "granted" | "denied" | null;

export const CONSENT_POLICY_LABEL: Record<ConsentPolicy, { title: string; detail: string }> = {
  respect_denied: { title: "Send unless the shopper refused", detail: "Orders are sent to Meta unless your store marks the shopper as having refused tracking." },
  require_granted: { title: "Send only with consent", detail: "Only orders your store marks as consented are sent. Orders with no consent information aren't sent." },
};

export function consentPolicyFrom(raw: string | null | undefined): ConsentPolicy {
  return raw === "require_granted" ? "require_granted" : "respect_denied";
}

/** A store's consent value, read leniently: yes/true/granted, no/false/denied, anything else unknown. */
export function normalizeConsent(raw: unknown): OrderConsent {
  if (raw === true) return "granted";
  if (raw === false) return "denied";
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (["granted", "yes", "true", "accepted", "allow", "allowed", "opt_in", "opted_in"].includes(v)) return "granted";
  if (["denied", "no", "false", "declined", "refused", "deny", "opt_out", "opted_out"].includes(v)) return "denied";
  return null;
}

export function consentAllows(policy: ConsentPolicy, consent: OrderConsent): boolean {
  return policy === "require_granted" ? consent === "granted" : consent !== "denied";
}

// --- how to install, by website platform -------------------------------------

export type InstallRoute = "shopify_app" | "wordpress_plugin" | "wix" | "squarespace" | "gtm" | "manual";

export const INSTALL_ROUTES: Record<InstallRoute, { label: string; steps: string[]; note?: string }> = {
  shopify_app: {
    label: "Shopify — Meta's Facebook & Instagram app",
    steps: [
      "In Shopify, add Meta's Facebook & Instagram sales channel app.",
      "During its setup, connect the same Meta business and choose this pixel (Meta now calls it a dataset).",
      "Set data sharing to the highest level your store's privacy settings allow — that turns on server events too.",
      "Place a test order (you can cancel it), then run the event check here.",
    ],
    note: "Shopify runs the pixel in a sandbox that a public page check can't see, so MAIRO verifies it through Meta's event counts instead.",
  },
  wordpress_plugin: {
    label: "WordPress — Meta's official plugin",
    steps: ["Install Meta's official plugin for WordPress (or WooCommerce).", "Connect it to your Meta business and pick this pixel.", "Submit a test enquiry or order, then run the event check here."],
  },
  wix: {
    label: "Wix — Marketing integrations",
    steps: ["In Wix, open Marketing Integrations and choose Meta (Facebook) Pixel.", "Paste the pixel ID shown above.", "Submit a test enquiry or booking, then run the event check here."],
  },
  squarespace: {
    label: "Squarespace — built-in pixel setting",
    steps: ["In Squarespace, open the marketing or external services settings and find the Facebook / Meta pixel field.", "Paste the pixel ID shown above.", "Submit a test enquiry or order, then run the event check here."],
  },
  gtm: {
    label: "Google Tag Manager — MAIRO's ready-made container",
    steps: ["Use the Tag Manager section below: MAIRO builds the tags for your business type.", "Import or publish the container.", "Complete the action yourself, then run the event check here."],
  },
  manual: {
    label: "Paste the code yourself",
    steps: [
      "Put the base code on every page, inside <head>.",
      "Put the event code where the outcome happens — the thank-you page after an enquiry, the order confirmation after a purchase — not on the button.",
      "Complete the action yourself, then run the event check here.",
    ],
  },
};

/** The route the website suggests, from what the website reader detected. Only a suggestion. */
export function suggestedRoute(platform: string | null | undefined): InstallRoute {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("shopify")) return "shopify_app";
  if (p.includes("wordpress") || p.includes("woocommerce")) return "wordpress_plugin";
  if (p.includes("wix")) return "wix";
  if (p.includes("squarespace")) return "squarespace";
  return "manual";
}

export function routeFrom(raw: string | null | undefined): InstallRoute | null {
  return raw && raw in INSTALL_ROUTES ? (raw as InstallRoute) : null;
}

export const MENUS_CHANGE_NOTE = "Menus in these tools change from time to time. If a step doesn't match what you see, the manual route always works.";
