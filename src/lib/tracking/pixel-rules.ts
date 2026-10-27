// When MAIRO needs a Meta Pixel, and whether a campaign may launch without
// one. Pure: the setup page, the onboarding step, the pre-launch review and
// auto-launch all read the same answers. Pinned by scripts/check-pixel-setup.ts.
//
// The rules, from the business type, the campaign's objective and where the
// ad sends people — never from one onboarding answer alone:
//
//   Website purchases (an online shop, a sales campaign to its website)
//     A working Pixel is required before launch. Declining is allowed and
//     recorded, but a campaign that depends on measuring purchases then can't
//     launch: MAIRO won't present purchase measurement as configured when it
//     isn't. A campaign that doesn't claim purchases (website visits) can.
//
//   Leads, calls, messages, Meta's own forms
//     No Pixel needed: Meta counts calls, conversations and in-ad forms
//     itself, and leads can be measured by phone or a CRM. A Pixel is offered
//     for website leads, never required.
//
// "Working" means Meta has received events from the website (or MAIRO found
// the pixel's code on it) — not that a pixel was chosen or created.

import type { AdDestination, AdGoal } from "@/generated/prisma/enums";
import { nicheById, primaryAction } from "@/lib/tracking/niches";

export type PixelNeed = "required_for_purchases" | "recommended" | "not_needed";

export type PixelDecision = "use" | "declined" | null;

export type LeadMeasurement = "calls" | "meta_forms" | "crm" | "other";

export const LEAD_MEASUREMENT: Record<LeadMeasurement, { label: string; detail: string }> = {
  calls: { label: "Phone calls", detail: "Meta counts taps on the call button. Which calls became customers you can mark in Leads." },
  meta_forms: { label: "Forms inside the ad (Meta lead forms) or MAIRO's form", detail: "Every form sent is counted without a Pixel." },
  crm: { label: "My CRM or booking system", detail: "Recorded as how you measure leads. MAIRO doesn't connect to it yet — you can import or mark leads in Leads." },
  other: { label: "Another way", detail: "Recorded as your choice. MAIRO counts what Meta reports, and the leads you mark." },
};

export function leadMeasurementFrom(raw: string | null | undefined): LeadMeasurement | null {
  return raw && raw in LEAD_MEASUREMENT ? (raw as LeadMeasurement) : null;
}

export function pixelDecisionFrom(raw: string | null | undefined): PixelDecision {
  return raw === "use" || raw === "declined" ? raw : null;
}

/** Whether the business sells online — an online shop, or Purchase as the thing it's judged on. */
export function sellsOnline(nicheId: string): boolean {
  const niche = nicheById(nicheId);
  return niche.id === "ecommerce" || primaryAction(niche).metaEvent === "Purchase";
}

/** What one campaign needs, from the business type, its objective and its destination. */
export function campaignPixelNeed(input: { nicheId: string; objective: AdGoal | string; destination: AdDestination | string }): { need: PixelNeed; why: string } {
  if (input.destination !== "WEBSITE") {
    const by: Record<string, string> = {
      LEAD_FORM: "Forms are counted as they're sent — no Pixel needed.",
      PHONE_CALL: "Meta counts taps on the call button — no Pixel needed.",
      DIRECT_MESSAGE: "Meta counts conversations started — no Pixel needed.",
      POST_ENGAGEMENT: "Meta counts reactions and comments on the ad — no Pixel needed.",
      APP: "App installs are measured by Meta's app tools, not the website Pixel.",
    };
    return { need: "not_needed", why: by[input.destination] ?? "This campaign doesn't send people to your website." };
  }
  if (input.objective === "SALES" && sellsOnline(input.nicheId)) {
    return { need: "required_for_purchases", why: "This campaign is set up to get website purchases, so a working Pixel is needed to measure them and to optimise for them." };
  }
  if (input.objective === "SALES" || input.objective === "LEADS") {
    return { need: "recommended", why: "A Pixel lets Meta count enquiries or sign-ups on your website. Not required — calls, forms and leads you mark are counted either way." };
  }
  return { need: "recommended", why: "A Pixel lets MAIRO report what people did after visiting your website. Not required for this campaign." };
}

/** The business as a whole, for onboarding: does it need a Pixel before purchase campaigns? */
export function businessPixelNeed(input: { nicheId: string; goal: AdGoal | string | null }): "required_for_purchases" | "optional" {
  return sellsOnline(input.nicheId) || input.goal === "SALES" ? "required_for_purchases" : "optional";
}

export type PixelState = {
  decision: PixelDecision;
  /** A pixel chosen in MAIRO, and what's known about it. */
  pixel: {
    id: string;
    name: string;
    /** When Meta last received an event from it (Meta's last_fired_time). */
    lastFiredAt: Date | null;
    /** MAIRO's own read of the website found the pixel's code. */
    installDetected: boolean;
    /** The last access check failed: revoked, or no longer shared with this ad account. */
    accessLost: boolean;
    /** Confirmed against a different ad account than the one connected now. */
    otherAdAccount: boolean;
  } | null;
  /** Meta has received a Purchase event recently (the pixel's event stats). */
  purchaseVerified: boolean;
};

/** Selected in MAIRO is not the same as receiving events — kept apart everywhere. */
export type PixelStatus = "not_set_up" | "declined" | "access_lost" | "selected_not_receiving" | "receiving" | "purchases_verified";

export function pixelStatus(s: PixelState): PixelStatus {
  if (!s.pixel) return s.decision === "declined" ? "declined" : "not_set_up";
  if (s.pixel.accessLost || s.pixel.otherAdAccount) return "access_lost";
  if (s.purchaseVerified) return "purchases_verified";
  if (s.pixel.lastFiredAt || s.pixel.installDetected) return "receiving";
  return "selected_not_receiving";
}

export const PIXEL_STATUS_LABEL: Record<PixelStatus, string> = {
  not_set_up: "Not set up",
  declined: "Not connected — your choice",
  access_lost: "MAIRO can't reach this Pixel",
  selected_not_receiving: "Selected in MAIRO — not receiving website events yet",
  receiving: "Receiving website events",
  purchases_verified: "Receiving purchase events",
};

export type Fix = { label: string; href: string };
export type LaunchGate = { ok: true } | { ok: false; code: "no_pixel" | "declined" | "access_lost" | "not_receiving"; title: string; reason: string; fixes: Fix[] };

const SETUP: Fix = { label: "Set up your Meta Pixel", href: "/dashboard/pixel" };
// The wizard has no preset: the person picks "website visits" as the goal there.
const VISITS: Fix = { label: "Build a website-visits campaign instead", href: "/dashboard/create/meta" };

/**
 * Whether a campaign may launch, given what it needs and the Pixel's state.
 * Only a campaign that depends on website purchases is ever held.
 */
export function launchGate(need: PixelNeed, s: PixelState): LaunchGate {
  if (need !== "required_for_purchases") return { ok: true };
  const status = pixelStatus(s);
  switch (status) {
    case "receiving":
    case "purchases_verified":
      return { ok: true };
    case "declined":
      return {
        ok: false,
        code: "declined",
        title: "This campaign needs a Meta Pixel to measure purchases",
        reason:
          "You chose not to connect a Pixel, so MAIRO can't verify purchases on your website or optimise for them. This campaign is set up to get website purchases, so it won't launch as if purchases were being measured. Connect a Pixel, or run a campaign for website visits instead.",
        fixes: [SETUP, VISITS],
      };
    case "access_lost":
      return {
        ok: false,
        code: "access_lost",
        title: "MAIRO can't reach your Meta Pixel",
        reason: "Your Meta connection no longer has access to the Pixel you chose (access was removed, or you connected a different ad account). Re-check access or choose a Pixel this ad account can use.",
        fixes: [SETUP],
      };
    case "selected_not_receiving":
      return {
        ok: false,
        code: "not_receiving",
        title: "Your Pixel isn't receiving website events yet",
        reason:
          "A Pixel is chosen in MAIRO, but Meta hasn't received any events from your website and MAIRO didn't find its code there. Until it's installed, purchases can't be measured, so this purchase campaign won't launch. Install it, then run the check.",
        fixes: [{ label: "Install and check your Pixel", href: "/dashboard/pixel" }, VISITS],
      };
    default:
      return {
        ok: false,
        code: "no_pixel",
        title: "This campaign needs a Meta Pixel to measure purchases",
        reason: "It's set up to get website purchases. Without a Pixel on your website, Meta can't count purchases or learn who buys, so MAIRO won't launch it as a purchase campaign.",
        fixes: [SETUP, VISITS],
      };
  }
}
