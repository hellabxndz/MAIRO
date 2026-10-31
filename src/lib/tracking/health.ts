import type { CheckStatus } from "./state";

// Is this business's tracking working? One answer, in the owner's words,
// from what Meta itself reported — never from what MAIRO set up or hoped.
//
// The daily monitor (monitor.ts) asks Meta for the Pixel's state and each
// chosen event's count, then hands the results here. Pure, so the rules can
// be read as a list and are pinned by scripts/check-tracking-health.ts.
//
// The rules that matter most:
//
//   - "working" needs evidence from Meta: the Pixel fired in the last few
//     days, and every event the owner chose arrived in the last week. A
//     Pixel that is merely selected, or code MAIRO found on the website, is
//     not "working".
//   - A check that couldn't reach Meta says so ("unknown"). It is never
//     turned into good news, and never into an alarm either.
//   - "Stopped" and "not yet" are told apart: an event that used to arrive
//     and no longer does is a problem; one that has never arrived on a new
//     setup is the next step.
//   - A shop can have a week without sales. When purchases stop but the
//     Pixel is still firing, the words say "if you made sales…" rather than
//     claiming tracking broke.

export type HealthStatus = "working" | "attention" | "broken" | "not_set_up" | "not_needed" | "unknown";

export type EventCheck = {
  event: string;
  status: CheckStatus;
  /** Meta's count in the window, when it gave one. */
  count: number | null;
  /** This event was verified at some earlier check: missing now means it stopped. */
  everVerified: boolean;
};

export type HealthInput = {
  now: Date;
  /** A Pixel is chosen in MAIRO. */
  hasPixel: boolean;
  /** The owner chose not to use a Pixel. */
  declined: boolean;
  /** From businessPixelNeed(), or "not_needed" when results come from Meta directly (lead forms). */
  need: "required_for_purchases" | "optional" | "not_needed";
  metaConnected: boolean;
  /** The Pixel is still shared with the connected ad account: true, false, or null when Meta couldn't be asked. */
  accessible: boolean | null;
  /** Meta's last_fired_time for the Pixel. */
  lastFiredAt: Date | null;
  /** The events the owner chose to track, each as Meta counted it. */
  events: EventCheck[];
  /** How many campaigns are live: a stopped Pixel matters more while money is being spent. */
  liveCampaigns: number;
};

export type Health = {
  status: HealthStatus;
  /** One line for Home. */
  headline: string;
  /** What Meta said, and what to do. */
  detail: string;
  fix: { label: string; href: string } | null;
};

/** The Pixel should have fired within this many days on a site with any traffic. */
export const STALE_DAYS = 3;
/** Event counts are read over this window (lib/tracking/setup.ts EVENT_WINDOW_DAYS). */
export const EVENT_WINDOW_DAYS = 7;

const SETUP = { label: "Set up tracking", href: "/dashboard/pixel" };
const FIX = { label: "See what to fix", href: "/dashboard/pixel" };
const RECONNECT = { label: "Reconnect Meta", href: "/dashboard/meta" };

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const LABEL: Record<string, string> = {
  Purchase: "purchase",
  AddToCart: "add-to-cart",
  InitiateCheckout: "checkout",
  ViewContent: "product-view",
  Lead: "lead",
  CompleteRegistration: "sign-up",
  Contact: "contact",
};
const label = (e: string) => LABEL[e] ?? e;

export function trackingHealth(i: HealthInput): Health {
  if (!i.hasPixel) {
    if (i.declined) return { status: "not_needed", headline: "Not using a Meta Pixel — your choice", detail: "Campaigns that need website tracking stay on hold. You can set up a Pixel at any time.", fix: { label: "Set up a Pixel", href: SETUP.href } };
    if (i.need === "not_needed") return { status: "not_needed", headline: "Your campaigns don't need website tracking", detail: "Results come from Meta directly (for example, Meta lead forms or messages).", fix: null };
    return { status: "not_set_up", headline: "Tracking isn't set up yet", detail: "Without a Meta Pixel, Meta can't see what people do on your website after they click an ad — so it can't find more people who buy.", fix: SETUP };
  }
  if (!i.metaConnected) {
    return { status: "broken", headline: "Meta is disconnected — tracking can't be checked", detail: "MAIRO needs your Meta connection to read your Pixel. Reconnect it and MAIRO checks again straight away.", fix: RECONNECT };
  }
  if (i.accessible === false) {
    return { status: "broken", headline: "MAIRO can't reach your Pixel", detail: "It isn't shared with your connected ad account any more. Share it again in Meta Business Settings, or choose another Pixel.", fix: FIX };
  }
  if (i.events.some((e) => e.status === "MISSING_PERMISSION")) {
    return { status: "broken", headline: "Meta stopped letting MAIRO read your Pixel", detail: "A permission was removed from MAIRO's access. Reconnect Meta and allow access to your Pixel.", fix: RECONNECT };
  }
  // Meta couldn't be asked: say so, and claim nothing either way.
  const failed = i.events.filter((e) => e.status === "FAILED" || e.status === "UNAVAILABLE");
  if (i.accessible === null && (i.events.length === 0 || failed.length === i.events.length)) {
    return { status: "unknown", headline: "MAIRO couldn't check your tracking today", detail: "Meta didn't answer. Nothing is assumed: MAIRO tries again on the next check.", fix: null };
  }

  const ageDays = i.lastFiredAt ? (i.now.getTime() - i.lastFiredAt.getTime()) / 864e5 : null;
  if (ageDays === null) {
    return {
      status: "attention",
      headline: "Your Pixel hasn't received any events yet",
      detail: "It's chosen in MAIRO, but Meta has never received anything from it — the code isn't on your website yet, or nobody has visited since it was added.",
      fix: { label: "Finish installing", href: SETUP.href },
    };
  }
  if (ageDays > STALE_DAYS) {
    return {
      status: "attention",
      headline: `Your Pixel stopped sending events on ${day(i.lastFiredAt!)}`,
      detail: `Meta hasn't received anything from your website since ${day(i.lastFiredAt!)}. A theme change, a new website or a removed plugin usually causes this.${i.liveCampaigns > 0 ? " Your live campaigns can't learn who converts until it's fixed." : ""}`,
      fix: FIX,
    };
  }

  const stopped = i.events.filter((e) => e.status === "NOT_SEEN" && e.everVerified);
  const notYet = i.events.filter((e) => (e.status === "NOT_SEEN" || e.status === "NOT_DETECTED") && !e.everVerified);
  const unknown = failed.map((e) => e.event);
  if (stopped.length) {
    const names = list(stopped.map((e) => label(e.event)));
    const purchaseOnly = stopped.length === 1 && stopped[0].event === "Purchase";
    return {
      status: "attention",
      headline: `No ${names} events in the last ${EVENT_WINDOW_DAYS} days`,
      detail: purchaseOnly
        ? `Your Pixel is still firing, but Meta received no purchases in the last ${EVENT_WINDOW_DAYS} days. If you made sales in that time, purchase tracking has stopped and needs fixing.`
        : `They used to arrive and haven't for ${EVENT_WINDOW_DAYS} days, while the rest of your Pixel still works — usually a changed checkout or form.`,
      fix: FIX,
    };
  }
  if (notYet.length) {
    return {
      status: "attention",
      headline: `Waiting for your first ${list(notYet.map((e) => label(e.event)))} event${notYet.length === 1 ? "" : "s"}`,
      detail: `Your Pixel is receiving page views, but Meta hasn't counted ${list(notYet.map((e) => label(e.event)))} events yet. Once one happens on your website, MAIRO confirms it.`,
      fix: { label: "Check the setup", href: SETUP.href },
    };
  }
  const counted = i.events.filter((e) => e.status === "VERIFIED");
  return {
    status: "working",
    headline: "Tracking is working",
    detail: counted.length
      ? `In the last ${EVENT_WINDOW_DAYS} days Meta received ${list(counted.map((e) => `${(e.count ?? 0).toLocaleString("en-US")} ${label(e.event)} event${e.count === 1 ? "" : "s"}`))}, and your Pixel last fired on ${day(i.lastFiredAt!)}.${unknown.length ? ` Meta didn't report ${list(unknown.map(label))} counts this time.` : ""}`
      : `Meta is receiving events from your Pixel (last on ${day(i.lastFiredAt!)}).`,
    fix: null,
  };
}

/** The verdicts that are a problem worth telling the owner about. */
export function isProblem(s: HealthStatus | null | undefined): boolean {
  return s === "attention" || s === "broken";
}

/** The monitor makes each notification's dedupe key from `situation` and the moment the verdict changed. */
export type Transition = { kind: "working" | "problem" | "recovered"; situation: string } | null;

/**
 * What changed between the stored verdict and today's, worth a notification.
 * "unknown" never changes anything: a day Meta didn't answer isn't news.
 */
export function transition(before: HealthStatus | null, after: HealthStatus, headlineBefore: string | null, headlineAfter: string): Transition {
  if (after === "unknown") return null;
  if (after === "working") {
    if (before === "working") return null;
    return { kind: isProblem(before) ? "recovered" : "working", situation: "working" };
  }
  if (isProblem(after)) {
    // A new problem, or a different one (e.g. purchases stopped, then the whole Pixel).
    if (before === after && headlineBefore === headlineAfter) return null;
    // Setting up for the first time isn't an alarm: "waiting for your first…" is the next step.
    if ((before === null || before === "not_set_up") && after === "attention" && /^(Waiting for|Your Pixel hasn't received)/.test(headlineAfter)) return null;
    return { kind: "problem", situation: `problem:${after}` };
  }
  return null;
}
