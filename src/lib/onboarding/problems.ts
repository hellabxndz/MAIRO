// What went wrong during setup, said so an owner who has never run an ad can
// act on it.
//
// Every explanation answers three things: what happened, that nothing was
// lost or spent, and the one thing to do next. The raw message from Meta or
// Stripe is kept as `technical` for support, never as the headline — "(#100)
// Invalid parameter" is a complete sentence to Meta and a dead end to
// everyone else.
//
// Pure: no database, no network. The screens and the tests share it.

import { LEGAL } from "@/lib/legal";

export type Fix = { label: string; href: string; external?: boolean };
export type Problem = {
  code: string;
  title: string;
  message: string;
  /** What is safe, so nobody starts over: "Your plan and answers are saved." */
  kept: string;
  fix: Fix | null;
  /** Extra ways out, after the main fix. */
  also?: Fix[];
  /** The original wording, for support. Never the headline. */
  technical?: string | null;
};

const SUPPORT: Fix = { label: "Contact support", href: `mailto:${LEGAL.contactEmail}` };

export const KEPT = "Your answers, plan and progress are saved.";
export const NOTHING_SPENT = "Nothing was launched or charged.";

/** Where "connect again" goes, returning to the step they were on. */
export function connectHref(returnTo: string, opts: { rerequest?: boolean } = {}): string {
  return `/api/meta/connect?returnTo=${encodeURIComponent(returnTo)}${opts.rerequest ? "&rerequest=1" : ""}`;
}

// --- Connecting Meta -------------------------------------------------------------

export const META_PERMISSION_PLAIN: Record<string, string> = {
  ads_management: "create and manage your ads",
  pages_show_list: "see your Facebook Pages",
  pages_read_engagement: "read your Page's name and Instagram link",
  business_management: "see the ad accounts in your Business Manager",
};

/** The permissions a connection can't work without. The rest are nice to have. */
export const REQUIRED_PERMISSIONS = ["ads_management", "pages_show_list"] as const;

export type MetaConnectCode =
  | "denied"
  | "permissions"
  | "no_ad_account"
  | "no_page"
  | "link_expired"
  | "wrong_account"
  | "setup"
  | "unavailable"
  | "unknown";

/**
 * Sorts what came back from Meta's login (or what went wrong after it) into
 * one of the cases above. `error`/`errorReason`/`description` are the query
 * parameters Meta sends back; `message` is an error thrown after the login.
 */
export function classifyMetaConnect(input: { error?: string | null; errorReason?: string | null; description?: string | null; message?: string | null }): MetaConnectCode {
  const reason = `${input.error ?? ""} ${input.errorReason ?? ""}`;
  const text = `${input.description ?? ""} ${input.message ?? ""}`;
  if (/user_denied|access_denied/i.test(reason) || /permissions error|user denied|cancel/i.test(input.description ?? "")) return "denied";
  if (/client secret|app not active|not currently accessible|isn't available|app is in development|redirect|url is blocked|invalid scope|uri/i.test(text)) return "setup";
  if (/oauth state|state from meta|missing code/i.test(text)) return "link_expired";
  if (/doesn't match your account/i.test(text)) return "wrong_account";
  if (/no meta ad accounts|no ad accounts/i.test(text)) return "no_ad_account";
  if (/timeout|timed out|ECONN|ENOTFOUND|fetch failed|temporarily|unavailable|service|\(#2\)|\(#4\)|\(#17\)|rate limit/i.test(text)) return "unavailable";
  if (!text.trim() && !reason.trim()) return "unknown";
  return "unknown";
}

export function explainMetaConnect(code: MetaConnectCode, ctx: { returnTo: string; missing?: string[]; technical?: string | null }): Problem {
  const again: Fix = { label: "Connect again", href: connectHref(ctx.returnTo) };
  const technical = ctx.technical ?? null;
  switch (code) {
    case "denied":
      return {
        code,
        title: "The Facebook connection wasn't finished",
        message: "The Facebook window was closed, or access wasn't allowed. Nothing changed in your Meta account.",
        kept: KEPT,
        fix: again,
        technical,
      };
    case "permissions": {
      const missing = (ctx.missing ?? []).map((p) => META_PERMISSION_PLAIN[p] ?? p);
      return {
        code,
        title: "MAIRO needs a little more access",
        message: `When you connected, these were switched off: ${missing.length ? missing.join("; ") : "some of what MAIRO asks for"}. Without them MAIRO can't build your campaign. Connect again and leave every option switched on — you can remove MAIRO from Facebook at any time.`,
        kept: KEPT,
        fix: { label: "Connect again and allow access", href: connectHref(ctx.returnTo, { rerequest: true }) },
        technical,
      };
    }
    case "no_ad_account":
      return {
        code,
        title: "This Facebook login has no Meta ad account yet",
        message: "Ads run inside a Meta ad account, which is free to create. Make one in Meta Business Settings (about two minutes), then come back and connect again.",
        kept: KEPT,
        fix: { label: "Create an ad account on Meta", href: "https://business.facebook.com/settings/ad-accounts", external: true },
        also: [again],
        technical,
      };
    case "no_page":
      return {
        code,
        title: "MAIRO couldn't find a Facebook Page",
        message: "Ads on Facebook and Instagram appear under a Facebook Page — your business's name and picture. Create a Page, or when you connect, make sure your Page is ticked.",
        kept: KEPT,
        fix: { label: "Create a Facebook Page", href: "https://www.facebook.com/pages/create", external: true },
        also: [{ label: "Connect again", href: connectHref(ctx.returnTo, { rerequest: true }) }],
        technical,
      };
    case "link_expired":
      return {
        code,
        title: "That connection link expired",
        message: "For your security, each Facebook connection works once and only for 10 minutes. Start it again — it takes a few seconds.",
        kept: KEPT,
        fix: again,
        technical,
      };
    case "wrong_account":
      return {
        code,
        title: "That connection was for a different MAIRO account",
        message: "You may be signed in to MAIRO with another business open. Check which business you're working on, then connect again.",
        kept: KEPT,
        fix: again,
        technical,
      };
    case "setup":
      return {
        code,
        title: "MAIRO's connection to Meta isn't working right now",
        message: "This is a problem on MAIRO's side, not something you did. Nothing changed in your Meta account. Try again later, or contact support and we'll fix it.",
        kept: KEPT,
        fix: again,
        also: [SUPPORT],
        technical,
      };
    case "unavailable":
      return {
        code,
        title: "Meta didn't respond",
        message: "Meta was slow or briefly unavailable. Nothing changed. Try again in a minute.",
        kept: KEPT,
        fix: again,
        technical,
      };
    default:
      return {
        code: "unknown",
        title: "Something went wrong connecting to Meta",
        message: "Nothing was changed or spent. Try again; if it keeps happening, contact support.",
        kept: KEPT,
        fix: again,
        also: [SUPPORT],
        technical,
      };
  }
}

/** A connection that worked once but can't be used now. */
export function explainConnectionState(state: { status: string; expiresAt?: Date | null; hasPage: boolean; accountStatus?: number | null }, ctx: { returnTo: string; now?: Date }): Problem | null {
  const now = ctx.now ?? new Date();
  const expired = state.status === "TOKEN_EXPIRED" || (state.expiresAt != null && state.expiresAt.getTime() < now.getTime());
  if (expired) {
    return {
      code: "expired",
      title: "Your Meta connection has expired",
      message: "Meta asks for the connection to be renewed every so often. Reconnect — it takes a few seconds, and your plan, campaign and settings are all kept.",
      kept: KEPT,
      fix: { label: "Reconnect Meta", href: connectHref(ctx.returnTo) },
    };
  }
  if (state.status === "ERROR") {
    return {
      code: "connection_error",
      title: "Meta stopped accepting MAIRO's connection",
      message: "This usually means the password changed or access was removed in Facebook settings. Reconnect to fix it — nothing else is lost.",
      kept: KEPT,
      fix: { label: "Reconnect Meta", href: connectHref(ctx.returnTo, { rerequest: true }) },
    };
  }
  if (state.status !== "CONNECTED") return null;
  if (!state.hasPage) return explainMetaConnect("no_page", { returnTo: ctx.returnTo });
  const account = explainAdAccountStatus(state.accountStatus ?? null);
  return account;
}

/** Meta's account_status for an ad account; 1 is the only one that can spend. */
export function explainAdAccountStatus(status: number | null): Problem | null {
  if (status == null || status === 1) return null;
  const billing: Fix = { label: "Open Meta billing", href: "https://business.facebook.com/billing_hub", external: true };
  const quality: Fix = { label: "Open Account Quality on Meta", href: "https://business.facebook.com/business-support-home", external: true };
  if (status === 3) {
    return { code: "account_unsettled", title: "Your ad account has an unpaid balance", message: "Meta won't run new ads until the balance is paid. Settle it in Meta billing, then come back — nothing here is lost.", kept: KEPT, fix: billing };
  }
  if (status === 2 || status === 101) {
    return { code: "account_disabled", title: "Meta has disabled or closed this ad account", message: "Ads can't run from it. Ask Meta to review it, or connect a different ad account.", kept: KEPT, fix: quality };
  }
  return { code: "account_review", title: "Meta is reviewing this ad account", message: "Meta sometimes checks new or changed accounts. Ads can't start until it finishes; MAIRO keeps everything ready.", kept: KEPT, fix: quality };
}

// --- Building and launching ------------------------------------------------------

/** What Meta said when building or switching on a campaign, in plain words. */
export function explainCampaignError(raw: string | null | undefined, ctx: { campaignHref?: string; returnTo?: string } = {}): Problem {
  const text = (raw ?? "").trim();
  const edit: Fix = { label: "Change the campaign", href: ctx.campaignHref ?? "/dashboard/launch" };
  const back = ctx.returnTo ?? "/dashboard/launch";
  const base = { kept: `${NOTHING_SPENT} ${KEPT}`, technical: text || null };
  if (/token|session has expired|error validating access token|\(#190\)|code[":\s]+190/i.test(text)) {
    return { ...base, ...explainConnectionState({ status: "TOKEN_EXPIRED", hasPage: true }, { returnTo: back })!, kept: base.kept, technical: base.technical };
  }
  if (/payment|funding|billing|unsettled|no valid payment|credit card|card/i.test(text)) {
    return { ...base, code: "funding", title: "Meta can't charge your ad account yet", message: "Add or fix the payment method on your Meta ad account. Meta charges it directly for your ads — MAIRO never sees your card.", fix: { label: "Open Meta billing", href: "https://business.facebook.com/billing_hub", external: true } };
  }
  if (/\bpage\b|page_id|pages_manage_ads|instagram.*account/i.test(text)) {
    return { ...base, code: "page", title: "There's a problem with your Facebook Page", message: "The ad needs a Facebook Page you manage. Check which Page is chosen on your Meta settings, or reconnect and tick it.", fix: { label: "Check your Page", href: "/dashboard/meta" } };
  }
  if (/permission|\(#200\)|\(#10\)|\(#3\)|not authorized|ads_management|does not have the capability/i.test(text)) {
    return { ...base, code: "permissions", title: "MAIRO doesn't have permission for that", message: "Some access was switched off when you connected. Connect again and leave every option switched on.", fix: { label: "Connect again and allow access", href: connectHref(back, { rerequest: true }) } };
  }
  if (/special ad categor|housing|employment|credit|social issues|politic/i.test(text)) {
    return { ...base, code: "special_category", title: "This kind of ad needs a special category", message: "Meta has extra rules for ads about housing, jobs, credit or social issues, including who can be targeted. Choose the category in the campaign, and MAIRO adjusts the audience to match.", fix: edit };
  }
  if (/budget|minimum|at least|too low/i.test(text)) {
    return { ...base, code: "budget", title: "The budget is below Meta's minimum", message: "Meta needs a slightly higher daily budget for this kind of campaign. Raise it a little — you approve the final amount before anything spends.", fix: edit };
  }
  if (/target|location|\bgeo|audience|\bages?\b|radius/i.test(text)) {
    return { ...base, code: "audience", title: "Meta couldn't use that audience", message: "The location or audience may be too narrow, or not allowed for this ad. Widen the area or loosen the audience, then build again.", fix: edit };
  }
  if (/image|video|creative|aspect|asset|thumbnail|media/i.test(text)) {
    return { ...base, code: "creative", title: "Meta couldn't use the ad's picture or video", message: "Try a different image or video — a clear, well-lit picture at least 1080 pixels wide works best.", fix: edit };
  }
  if (/policy|disapproved|rejected|community standards|prohibited/i.test(text)) {
    return { ...base, code: "policy", title: "Meta didn't approve the ad", message: "Meta's review flagged something in the ad's words or picture. Change it and MAIRO sends it for review again. Nothing is spent on an ad that isn't approved.", fix: edit };
  }
  if (/rate limit|too many calls|\(#17\)|\(#4\)|\(#613\)|temporarily|unavailable|timeout|timed out|ECONN|fetch failed|unknown error|please retry|try again later/i.test(text)) {
    return { ...base, code: "unavailable", title: "Meta was busy", message: "Meta didn't finish the request just now. Try again in a minute — MAIRO picks up where it stopped.", fix: { label: "Try again", href: back } };
  }
  if (/already (active|launched|being built|created)/i.test(text)) {
    return { ...base, code: "duplicate", title: "This was already done", message: "MAIRO already has this in hand, so it wasn't done twice.", fix: { label: "See where things are", href: back } };
  }
  if (!text) {
    return { ...base, code: "unexpected", title: "Something unexpected went wrong", message: "Try again in a moment. If it keeps happening, contact support.", fix: { label: "Try again", href: back } };
  }
  return { ...base, code: "invalid", title: "Meta didn't accept part of the campaign", message: "One of the campaign's settings isn't allowed by Meta. Check the campaign, change what's highlighted, and build again — or ask MAIRO what to change.", fix: edit, also: [{ label: "Ask MAIRO", href: "/dashboard/agents" }] };
}

// --- Paying for MAIRO -------------------------------------------------------------

export const PAYMENT_FAILED_STATES = ["incomplete", "incomplete_expired", "past_due", "unpaid", "canceled"] as const;

/** A subscription that didn't start or stopped, or a checkout left half-way. */
export function explainSubscription(status: string | null | undefined, opts: { checkoutCancelled?: boolean; paid?: boolean } = {}): Problem | null {
  const fix: Fix = { label: "Choose a plan", href: "/plan/activate?skip=1#plans" };
  const kept = "Your answers, approved plan and connected account are saved.";
  if (opts.paid) return null;
  if (status === "incomplete") {
    return { code: "card_declined", title: "Your card wasn't accepted", message: "Stripe couldn't take the first payment, so nothing was charged. Try another card, or check with your bank and try again.", kept, fix: { label: "Try again", href: "/plan/activate?skip=1#plans" } };
  }
  if (status === "incomplete_expired") {
    return { code: "payment_expired", title: "The payment wasn't completed in time", message: "Nothing was charged. Start the payment again whenever you're ready.", kept, fix };
  }
  if (status === "past_due" || status === "unpaid") {
    return { code: "payment_failed", title: "Your last MAIRO payment didn't go through", message: "MAIRO has paused anything paid until it's fixed. Update your card — nothing has been lost.", kept, fix: { label: "Update payment details", href: "/dashboard/billing" } };
  }
  if (status === "canceled") {
    return { code: "subscription_ended", title: "Your MAIRO subscription has ended", message: "Choose a plan to continue where you left off.", kept, fix };
  }
  if (opts.checkoutCancelled) {
    return { code: "checkout_cancelled", title: "Payment wasn't finished", message: "You left the payment page before finishing, so nothing was charged.", kept, fix };
  }
  return null;
}

export const UNEXPECTED: Problem = {
  code: "unexpected",
  title: "Something unexpected went wrong",
  message: "Try again in a moment. If it keeps happening, contact support.",
  kept: `${NOTHING_SPENT} ${KEPT}`,
  fix: null,
};

const CONNECT_CODES: MetaConnectCode[] = ["denied", "permissions", "no_ad_account", "no_page", "link_expired", "wrong_account", "setup", "unavailable", "unknown"];

/** The connection problem a page was sent back with (?metaError=…), if any. */
export function connectProblemFromParams(p: { metaError?: string | null; missing?: string | null; metaDetail?: string | null; acct?: string | null }, returnTo: string): Problem | null {
  if (p.metaError) {
    const code = (CONNECT_CODES as string[]).includes(p.metaError) ? (p.metaError as MetaConnectCode) : "unknown";
    return explainMetaConnect(code, { returnTo, missing: p.missing ? p.missing.split(",").filter(Boolean) : undefined, technical: p.metaDetail ?? null });
  }
  if (p.acct && /^\d+$/.test(p.acct)) return explainAdAccountStatus(Number(p.acct));
  return null;
}
