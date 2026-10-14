import { PLANS } from "@/lib/plans";
import { DEFAULT_ENTITLEMENTS } from "@/lib/entitlements";
import { BUSINESS_TIERS, EVERY_PLAN, INTEGRATIONS, MONEY_AND_CONTROL, alwaysYours, automationLevels, pictures, pricingFacts } from "@/lib/pricing/compare";
import { capability } from "@/lib/capabilities";
import { INSTALL_ROUTES, STAGE_LABEL, STAGE_ORDER, type CheckStatus, type TrackingStage } from "@/lib/tracking/state";
import { RESERVATION_TIMEOUT_MS } from "@/lib/creative-studio/credits";
import { PHASES } from "@/lib/onboarding/progress";
import { LEAD_OUTCOMES } from "@/lib/leads/outcomes";
import { metaScopes } from "@/lib/meta/oauth";
import type { HelpCategory, HelpIndexEntry } from "@/lib/help/search";

export { HELP_CATEGORIES, searchHelp, type HelpCategory, type HelpIndexEntry } from "@/lib/help/search";

// The help center: answers to the questions people ask about MAIRO, written
// from the same modules the product runs on — the plan numbers and money
// facts the pricing page uses (pricing/compare.ts), the capability register
// (capabilities.ts), the tracking stages the setup screen shows, the credit
// ledger's own timeout, the Meta permissions this deployment asks for. When
// one of those changes, the answer changes with it.
//
// What isn't built isn't described as if it were: anything the capability
// register has as partial carries its stated limit, and nothing here
// promises a result.
//
// Server-only (it reads deployment settings); the search box gets the plain
// index from helpIndex().


export type HelpBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "terms"; items: { term: string; text: string }[] }
  | { kind: "note"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

/** A link out of an article. `app` links need a signed-in account. */
export type HelpLink = { label: string; href: string; app?: boolean };

export type HelpArticle = {
  slug: string;
  title: string;
  summary: string;
  category: HelpCategory;
  keywords: string[];
  blocks: HelpBlock[];
  links: HelpLink[];
  related: string[];
};

const money = (n: number) => (Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`);
const control = (key: string) => MONEY_AND_CONTROL.find((m) => m.key === key)!.body;
const fact = (key: string) => pricingFacts().find((f) => f.key === key)!.body;
const every = (title: string) => EVERY_PLAN.find((e) => e.title === title)!.body;
const integration = (key: string) => INTEGRATIONS.find((i) => i.key === key)!;
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** What each Meta permission is for, in words. A permission without an entry is listed by its name. */
const SCOPE_PURPOSE: Record<string, string> = {
  ads_management: "Build and change campaigns in the ad account you connect, and read their results.",
  ads_read: "Read the results of the campaigns in your ad account.",
  pages_show_list: "See the Facebook Pages you manage, so your ads can run from your Page.",
  pages_read_engagement: "Read your Page's details — including which Instagram account is linked to it, so your ads can run on Instagram.",
  business_management: "Find Pages that belong to a Meta business portfolio rather than to you personally — without it, Meta leaves them out.",
};

const STAGE_MEANS: Record<TrackingStage, string> = {
  no_asset: "Choose the pixel you already have, or ask MAIRO to create one in your own ad account.",
  asset_selected: "Pick how you'll install it — MAIRO shows the steps for your website's platform.",
  installation_pending: "Finish the installation steps, then run the check. MAIRO looks at your website and asks Meta.",
  installation_detected: "The pixel is on your site. Now complete the action your campaign is judged on yourself — an enquiry, a booking or a test order — and run the event check.",
  event_verification_pending: "MAIRO hasn't seen that event reach Meta yet. The check result says what to try next.",
  verified: "Meta is receiving the event your campaign is judged on, or your first campaign doesn't need one (a Meta lead form, say).",
};

const CHECK_MEANS: Record<CheckStatus, string> = {
  VERIFIED: "Seen, with a source MAIRO can point to: the pixel's code on your pages, or Meta's own event counts.",
  NOT_DETECTED: "The pixel's code wasn't found on the pages MAIRO read. Some platforms — Shopify, for one — run it where a page check can't see it; then MAIRO relies on Meta's counts instead.",
  NOT_SEEN: "Meta received none of that event in the period checked. Complete one yourself, then check again.",
  MISSING_PERMISSION: "Your Meta connection isn't allowed to ask. Connect Meta again and leave every permission switched on.",
  FAILED: "The check itself didn't work — a network or Meta error. It says nothing about your pixel; try again in a moment.",
};

function scopeTerms(): { term: string; text: string }[] {
  let scopes: string[];
  try {
    scopes = metaScopes();
  } catch {
    // A misconfigured deployment refuses to build the login; the help page shouldn't fail with it.
    scopes = [];
  }
  return scopes.map((s) => ({ term: s, text: SCOPE_PURPOSE[s] ?? "A permission this deployment asks for." }));
}

function planTable(): { head: string[]; rows: string[][] } {
  const plans = BUSINESS_TIERS.map((t) => PLANS.find((p) => p.tier === t)!);
  const ent = (t: (typeof BUSINESS_TIERS)[number]) => DEFAULT_ENTITLEMENTS[t];
  return {
    head: ["", ...plans.map((p) => p.name)],
    rows: [
      ["Price", ...plans.map((p) => `${money(p.priceMonthly)} a month`)],
      ["Free trial", ...plans.map((p) => (p.trialDays ? `${p.trialDays} days` : "None"))],
      ["Campaigns at once", ...BUSINESS_TIERS.map((t) => (Number.isFinite(ent(t).campaign_limit) ? String(ent(t).campaign_limit) : "Unlimited"))],
      ["AI image credits", ...BUSINESS_TIERS.map((t) => `${ent(t).studio_credits_monthly} a month (about ${pictures(ent(t).studio_credits_monthly)} pictures)`)],
      ["Creative requests", ...BUSINESS_TIERS.map((t) => `${ent(t).creative_limit} a month`)],
    ],
  };
}

export function helpArticles(): HelpArticle[] {
  const reading = capability("website-reading");
  const pixel = capability("pixel");
  const gtm = capability("pixel-gtm");
  const automation = capability("automation-levels");
  const social = integration("social-posting");
  const shopify = integration("shopify");
  const holdMinutes = Math.round(RESERVATION_TIMEOUT_MS / 60_000);
  const plans = BUSINESS_TIERS.map((t) => PLANS.find((p) => p.tier === t)!);

  return [
    {
      slug: "getting-started",
      title: "Getting started with MAIRO",
      summary: "From your free plan to your first campaign: what happens at each step, and what costs money.",
      category: "Getting started",
      keywords: ["start", "begin", "setup", "onboarding", "free plan", "ad plan generator", "strategy", "budget", "share plan", "save plan", "sign up", "account", "how it works", "first campaign"],
      blocks: [
        { kind: "p", text: "MAIRO works in two parts. The plan is free: tell MAIRO about your business and it shows you how it would advertise it. Running ads needs a subscription, your own Meta ad account and your approval." },
        { kind: "h", text: "1. Generate your free AI ad plan" },
        { kind: "p", text: "Give MAIRO four answers: your website (or a few words about the business if you don't have one), what you sell, your goal — online sales, leads, bookings, website traffic or brand awareness — and what you'd like to spend on Meta ads each month. MAIRO reads your public pages and fills in what you sell for you to check, then writes your plan: what it understood about your business (and where each fact came from), the Meta strategy it recommends, how your monthly budget would be divided, three ad concepts shown as they'd appear on Facebook and Instagram, what to fix on your website, and your first 30 days. The budget is what you'd pay Meta, not MAIRO's price, and nothing in the plan is a forecast. You don't need an account or a card to see it, and no ads are launched." },
        { kind: "note", text: reading.publicNote! },
        { kind: "p", text: "Change the budget or try another goal and the plan follows. Save it to come back to it on this device, share its private link, or download it as a PDF from your browser's print dialog. A saved plan that never joins an account is deleted after 30 days." },
        { kind: "h", text: "2. Put MAIRO to work" },
        { kind: "p", text: `Press Put MAIRO to Work and create a free account: your plan comes with it, and setup opens with your answers already filled in for you to confirm. Setup is saved as you go, so you can leave and pick up where you were on any device. It runs in stages: ${PHASES.map((p) => p.label).join(", ")}.` },
        { kind: "h", text: "3. Connect Meta and choose a plan" },
        { kind: "p", text: `To build real campaigns, connect the Meta ad account your business advertises from, and subscribe. ${fact("trial")}` },
        { kind: "h", text: "4. Approve, then launch" },
        { kind: "p", text: "MAIRO builds each campaign switched off and shows you the budget, the audience, the ads and where people go before you approve it. Nothing launches and nothing is spent until you do. After you approve, Meta reviews the ads; MAIRO shows a campaign as live only once Meta confirms it." },
      ],
      links: [
        { label: "Generate your free AI ad plan", href: "/preview" },
        { label: "Create a free account", href: "/sign-up" },
        { label: "Your first-campaign checklist", href: "/dashboard/launch", app: true },
      ],
      related: ["connect-meta", "approvals", "billing"],
    },
    {
      slug: "connect-meta",
      title: "Connecting your Meta ad account",
      summary: "What MAIRO asks Meta for, what it can and can't do with it, and how to disconnect.",
      category: "Getting started",
      keywords: ["meta", "facebook", "instagram", "connect", "ad account", "page", "permissions", "login", "disconnect", "business manager", "portfolio"],
      blocks: [
        { kind: "p", text: "MAIRO runs your ads in your own Meta ad account, so every campaign is also in Meta Ads Manager, where you can see it. You connect by signing in with the Facebook account that manages your business's ads." },
        { kind: "h", text: "What MAIRO asks Meta for" },
        { kind: "terms", items: scopeTerms() },
        { kind: "p", text: "If you switch one of these off in Facebook's dialog, MAIRO tells you which one and what it's for, so you can connect again with it on." },
        { kind: "h", text: "Which ad account and Page" },
        { kind: "p", text: "MAIRO picks an ad account your login can run ads from, and the first Facebook Page it finds as a starting point. The Meta connection page shows which were chosen and lets you change them. While MAIRO campaigns are running in one ad account, it won't quietly move you to another." },
        { kind: "p", text: "Connecting an ad account is always something you do yourself — MAIRO's automation never does it, at any level." },
        { kind: "h", text: "Instagram" },
        { kind: "p", text: `${integration("instagram-ads").what} Posting to your own Instagram and Facebook — not ads — is part of Scale's Social Manager and asks for its own permission, only when you turn it on. ${social.limits ?? ""}`.trim() },
        { kind: "h", text: "Disconnecting" },
        { kind: "p", text: control("disconnect") },
      ],
      links: [
        { label: "Meta connection", href: "/dashboard/meta", app: true },
        { label: "Privacy policy", href: "/privacy" },
        { label: "Data deletion", href: "/data-deletion" },
      ],
      related: ["getting-started", "website-tracking", "approvals"],
    },
    {
      slug: "website-tracking",
      title: "Website tracking and the Meta pixel",
      summary: "How MAIRO sets up and checks the Meta pixel, and what each check result means.",
      category: "Tracking and results",
      keywords: ["pixel", "dataset", "tracking", "conversion", "event", "purchase", "lead", "install", "verify", "shopify", "wordpress", "wix", "squarespace", "tag manager", "gtm", "website"],
      blocks: [
        { kind: "p", text: "The Meta pixel tells Meta when someone who saw your ad goes on to buy, book or get in touch on your website. Without it, Meta can't tell which ads led to a sale or an enquiry there — except enquiries made in Meta's own lead forms." },
        { kind: "p", text: `${pixel.claim} ${pixel.publicNote}` },
        { kind: "h", text: "The stages" },
        { kind: "terms", items: STAGE_ORDER.map((s) => ({ term: STAGE_LABEL[s], text: STAGE_MEANS[s] })) },
        { kind: "h", text: "What a check can say" },
        { kind: "terms", items: (["VERIFIED", "NOT_DETECTED", "NOT_SEEN", "MISSING_PERMISSION", "FAILED"] as CheckStatus[]).map((c) => ({ term: { VERIFIED: "Verified", NOT_DETECTED: "Not detected", NOT_SEEN: "Not seen", MISSING_PERMISSION: "Missing permission", FAILED: "Check failed" }[c], text: CHECK_MEANS[c] })) },
        { kind: "p", text: "Only a failed check is a failure. The others are answers, and each comes with its next step." },
        { kind: "h", text: "Installing it" },
        { kind: "p", text: "MAIRO shows the steps for the way you choose:" },
        { kind: "list", items: Object.values(INSTALL_ROUTES).map((r) => r.label) },
        { kind: "note", text: `${gtm.claim} ${gtm.publicNote}` },
        { kind: "h", text: "Shopify orders" },
        { kind: "p", text: `${shopify.what} ${shopify.limits}` },
      ],
      links: [
        { label: "Tracking setup", href: "/dashboard/tracking", app: true },
        { label: "Free advertising tools", href: "/tools" },
      ],
      related: ["results", "connect-meta"],
    },
    {
      slug: "failed-generation",
      title: "When a picture or video can't be made",
      summary: "What happens to your credits when making a picture fails, and what to do next.",
      category: "Creative",
      keywords: ["failed", "error", "generation", "picture", "image", "video", "credits", "refund", "didn't work", "couldn't be made", "try again"],
      blocks: [
        { kind: "p", text: "Making a picture uses an AI provider, and sometimes the provider fails, times out or refuses a request. When that happens MAIRO says so. It never shows a placeholder as if it were your picture, and it never counts a picture that wasn't made." },
        { kind: "h", text: "Your credits" },
        { kind: "p", text: `Credits are held while a picture is being made and spent only when it arrives. If it fails, the hold is released, so a failed picture costs nothing. If a request is cut off part-way — you close the page, say — the held credits come back within ${holdMinutes} minutes.` },
        { kind: "h", text: "What you'll see" },
        {
          kind: "list",
          items: [
            "“The picture couldn't be made, so no credits were used” — with the reason, when the provider gave one.",
            "“The last change couldn't be made, so no credits were used” — the version you had is kept.",
            "If making pictures isn't switched on for your account yet, MAIRO says that instead, and nothing is charged.",
          ],
        },
        { kind: "h", text: "What to do" },
        {
          kind: "list",
          items: [
            "Try again — many failures are temporary.",
            "Change the request: describe the picture differently, or ask MAIRO to rewrite the ad first.",
            "Use your own photo or video instead. It costs no credits.",
          ],
        },
        { kind: "h", text: "Videos you've uploaded" },
        { kind: "p", text: "An edited video is shown as ready only once the new file exists and has been checked; your original is always kept. If an edit can't be made, you keep the original and are told why. MAIRO doesn't make videos from scratch with AI." },
      ],
      links: [{ label: "Creative Studio", href: "/dashboard/creative-studio", app: true }],
      related: ["credits-and-usage"],
    },
    {
      slug: "credits-and-usage",
      title: "Credits, limits and what you pay for",
      summary: "Your subscription, your ad spend and your AI credits are three separate things. Here's each one.",
      category: "Billing and plans",
      keywords: ["credits", "usage", "limits", "allowance", "ad spend", "subscription", "cost", "price", "creative requests", "campaigns", "reset", "monthly"],
      blocks: [
        { kind: "p", text: "Three things are easy to mix up, so here they are side by side." },
        {
          kind: "terms",
          items: [
            { term: "Your MAIRO subscription", text: `A monthly price for MAIRO, paid by card through Stripe. ${integration("stripe").limits}` },
            { term: "Your ad spend", text: "What Meta charges for showing your ads. It's paid from your own Meta ad account straight to Meta, at the budgets you approve. It never passes through MAIRO." },
            { term: "AI image credits", text: "Part of your plan. They pay for pictures MAIRO's AI makes; your own photos and videos cost nothing." },
          ],
        },
        { kind: "h", text: "What each plan includes" },
        { kind: "table", ...planTable() },
        { kind: "h", text: "How credits are used" },
        { kind: "p", text: fact("credits") },
        { kind: "p", text: fact("limits") },
        { kind: "p", text: "The Creative Studio shows how many credits you have left this month, and the Creatives page shows your creative requests. A picture that fails costs nothing." },
      ],
      links: [
        { label: "Billing", href: "/dashboard/billing", app: true },
        { label: "Creative Studio", href: "/dashboard/creative-studio", app: true },
        { label: "Pricing", href: "/#pricing" },
      ],
      related: ["billing", "failed-generation"],
    },
    {
      slug: "approvals",
      title: "Approvals: what waits for you",
      summary: "What MAIRO may change on its own, what always waits for you, and how to pause.",
      category: "Ads and approvals",
      keywords: ["approve", "approval", "launch", "automation", "autopilot", "ai assist", "manual", "budget", "spend protection", "pause", "stop", "control"],
      blocks: [
        { kind: "p", text: control("approvals") },
        { kind: "h", text: "Always yours to decide" },
        { kind: "terms", items: alwaysYours().map((a) => ({ term: a.label, text: a.detail })) },
        { kind: "p", text: "That holds on every plan and at every automation level." },
        { kind: "h", text: "How much MAIRO may change on its own" },
        { kind: "terms", items: automationLevels().map((l) => ({ term: `${l.label} · ${l.plans}`, text: `${l.summary} ${l.level === "MANUAL" ? "" : `It may: ${l.does.map(lowerFirst).join(", ")}.`}`.trim() })) },
        { kind: "note", text: automation.publicNote! },
        { kind: "h", text: "Spend Protection" },
        { kind: "p", text: every("Spend Protection") },
        { kind: "h", text: "Pausing" },
        { kind: "p", text: control("pause") },
      ],
      links: [
        { label: "Approval Center", href: "/dashboard/decisions", app: true },
        { label: "Automation and Spend Protection settings", href: "/dashboard/settings", app: true },
      ],
      related: ["getting-started", "results"],
    },
    {
      slug: "results",
      title: "Reading your results",
      summary: "Where each number comes from, how leads are followed through, and why a figure can be empty.",
      category: "Tracking and results",
      keywords: ["results", "performance", "analytics", "report", "leads", "sales", "roas", "cost per lead", "meta reports", "confirmed", "empty", "missing", "coach"],
      blocks: [
        { kind: "p", text: control("performance") },
        { kind: "h", text: "Four kinds of figure" },
        {
          kind: "terms",
          items: [
            { term: "Meta reports", text: "Spend, reach, clicks and the results Meta attributes to your ads." },
            { term: "MAIRO counts", text: "Enquiries from your forms, minus spam and duplicates." },
            { term: "You mark", text: "Which leads were good, which booked and which became customers." },
            { term: "Confirmed", text: "Sale values you record, or orders your store reports." },
          ],
        },
        { kind: "h", text: "Following a lead through" },
        { kind: "p", text: "On the Leads page, mark what became of each person who got in touch:" },
        { kind: "terms", items: LEAD_OUTCOMES.map((o) => ({ term: o.label, text: o.hint })) },
        { kind: "p", text: "MAIRO never assumes a lead was good and never counts a lead as a sale; a lead nobody has marked stays a reported lead. Leads you add or import yourself are yours to follow up, but they're never counted as results of your ads." },
        { kind: "h", text: "Why a figure can be empty" },
        {
          kind: "list",
          items: [
            "Nothing has run yet. Results start once a campaign is live.",
            "It needs a source that isn't connected — for sales, a pixel Purchase event or your Shopify store; for customers, your marks on the Leads page.",
            "Meta's figures can take a few hours to arrive.",
          ],
        },
        { kind: "p", text: "In each case MAIRO shows the figure as missing and says why — it doesn't fill the gap with an estimate." },
        { kind: "h", text: "Reports and the Performance Coach" },
        { kind: "p", text: `${every("Reports in plain English")} ${every("The Performance Coach")}` },
        { kind: "p", text: "When the first enquiry from your ads arrives — or, without one, Meta reports your first purchase or booking — MAIRO tells you once, and says whether it counted that figure or Meta reported it." },
      ],
      links: [
        { label: "Performance", href: "/dashboard/analytics", app: true },
        { label: "Leads", href: "/dashboard/leads", app: true },
        { label: "Reports", href: "/dashboard/reports", app: true },
      ],
      related: ["website-tracking", "approvals"],
    },
    {
      slug: "billing",
      title: "Plans, billing and cancelling",
      summary: "Prices, the free trial, changing plan, and what happens to your campaigns if you cancel.",
      category: "Billing and plans",
      keywords: ["billing", "plan", "price", "pricing", "trial", "cancel", "cancellation", "card", "invoice", "stripe", "upgrade", "downgrade", "subscription", "delete account"],
      blocks: [
        { kind: "p", text: `${plans.map((p) => `${p.name} is ${money(p.priceMonthly)} a month`).join(", ")}. ${fact("trial")}` },
        { kind: "p", text: `${integration("stripe").what} Change plan, update your card or cancel from Billing in Settings, which opens Stripe's own billing page.` },
        { kind: "h", text: "Your ad spend" },
        { kind: "p", text: control("who-pays") },
        { kind: "h", text: "If you cancel" },
        { kind: "p", text: control("ending") },
        { kind: "p", text: capability("pause").claim! },
        { kind: "h", text: "Deleting your account" },
        { kind: "p", text: `${capability("account-deletion").claim} The data deletion page explains what's removed straight away, and the few copies outside the live service that take longer to disappear.` },
      ],
      links: [
        { label: "Billing", href: "/dashboard/billing", app: true },
        { label: "Pricing", href: "/#pricing" },
        { label: "Terms", href: "/terms" },
        { label: "Data deletion", href: "/data-deletion" },
      ],
      related: ["credits-and-usage", "approvals"],
    },
  ];
}

export function helpArticle(slug: string): HelpArticle | null {
  return helpArticles().find((a) => a.slug === slug) ?? null;
}

/** All the words in an article, for search. */
export function articleText(a: HelpArticle): string {
  const parts: string[] = [a.title, a.summary, a.category, ...a.keywords];
  for (const b of a.blocks) {
    if (b.kind === "p" || b.kind === "h" || b.kind === "note") parts.push(b.text);
    else if (b.kind === "list" || b.kind === "steps") parts.push(...b.items);
    else if (b.kind === "terms") for (const t of b.items) parts.push(t.term, t.text);
    else parts.push(...b.head, ...b.rows.flat());
  }
  return parts.join(" ");
}

export function helpIndex(): HelpIndexEntry[] {
  return helpArticles().map((a) => ({ slug: a.slug, title: a.title, summary: a.summary, category: a.category, keywords: a.keywords, text: articleText(a) }));
}
