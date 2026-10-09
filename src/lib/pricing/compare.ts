// What each plan does for a business, said as outcomes — and built from the
// same numbers and flags the product enforces, so the pricing page can't
// promise more than a plan unlocks.
//
// Every "yes/no" below is read from DEFAULT_ENTITLEMENTS (the flags the
// server checks), every automation line from automation/levels.ts (the list
// the decision engine obeys), and every limit from the entitlement numbers.
// If a plan changes, the page changes with it.

import { metaPostingApproved } from "@/lib/social/publishing-status";
import { PLANS, type Plan } from "@/lib/plans";
import { DEFAULT_ENTITLEMENTS, type Entitlements } from "@/lib/entitlements";
import { ALWAYS_NEEDS_APPROVAL, actionInfo, automaticActions, levelInfo } from "@/lib/automation/levels";
import { DEFAULT_COSTS } from "@/lib/creative-studio/costs";

export type BusinessTier = "STARTER" | "GROWTH" | "SCALE";
export const BUSINESS_TIERS: BusinessTier[] = ["STARTER", "GROWTH", "SCALE"];

export type Cell = { kind: "yes"; note?: string } | { kind: "no" } | { kind: "text"; text: string; note?: string };
export type Row = { key: string; label: string; help?: string; cells: Record<BusinessTier, Cell> };
export type Group = { key: string; title: string; rows: Row[] };

const ent = (t: BusinessTier): Entitlements => DEFAULT_ENTITLEMENTS[t];
const plan = (t: BusinessTier): Plan => PLANS.find((p) => p.tier === t)!;
const yes = (note?: string): Cell => ({ kind: "yes", ...(note ? { note } : {}) });
const no: Cell = { kind: "no" };
const text = (t: string, note?: string): Cell => ({ kind: "text", text: t, ...(note ? { note } : {}) });
const each = (f: (t: BusinessTier) => Cell): Record<BusinessTier, Cell> => ({ STARTER: f("STARTER"), GROWTH: f("GROWTH"), SCALE: f("SCALE") });

export const pictures = (credits: number) => Math.floor(credits / DEFAULT_COSTS.standard);
const campaigns = (n: number) => (Number.isFinite(n) ? `Up to ${n} at a time` : "Unlimited");
const prioritySupport = (t: BusinessTier) => plan(t).features.some((f) => /priority support/i.test(f));

/** Automation modes a plan may switch on — the same flags the settings screen and server check. */
export function automationModes(t: BusinessTier): ("MANUAL" | "ASSISTED" | "AUTOPILOT")[] {
  const e = ent(t);
  return ["MANUAL", ...(e.auto_optimize ? (["ASSISTED"] as const) : []), ...(e.autopilot ? (["AUTOPILOT"] as const) : [])];
}

const actionList = (level: "ASSISTED" | "AUTOPILOT") =>
  automaticActions(level)
    .map((a) => a.label.toLowerCase())
    .join(", ");

/** The one-paragraph story of each plan: what MAIRO does for the business. */
export type PlanStory = {
  tier: BusinessTier;
  name: string;
  price: number;
  trialDays: number;
  forWho: string;
  outcome: string;
  highlights: string[];
  modes: string[];
  featured: boolean;
};

const OUTCOME: Record<BusinessTier, string> = {
  STARTER: "MAIRO plans, builds and checks your Facebook and Instagram ads every day, and tells you what to change. Nothing changes without your yes.",
  GROWTH: "Everything in Starter — and if you switch on AI Assist, MAIRO handles routine fixes for you inside your limits, so you only decide the bigger calls.",
  SCALE: "Everything in Growth, plus Full Autopilot for your ads and MAIRO Social Manager for your own Instagram and Facebook posts.",
};

export function planStories(): PlanStory[] {
  return BUSINESS_TIERS.map((t) => {
    const p = plan(t);
    const e = ent(t);
    const highlights = [
      Number.isFinite(e.campaign_limit) ? `Up to ${e.campaign_limit} campaigns at a time` : "Unlimited campaigns",
      `${e.studio_credits_monthly} AI image credits a month (about ${pictures(e.studio_credits_monthly)} pictures)`,
      ...(e.autopilot ? ["Full Autopilot available"] : e.auto_optimize ? ["AI Assist available"] : ["You approve every change"]),
      ...(e.advanced_analytics ? ["Every ad's results side by side"] : ["Results in plain English"]),
      ...(e.social_posting ? ["MAIRO Social Manager"] : []),
      ...(prioritySupport(t) ? ["Priority support"] : []),
    ];
    return {
      tier: t,
      name: p.name,
      price: p.priceMonthly,
      trialDays: p.trialDays ?? 0,
      forWho: p.spendGuidance,
      outcome: OUTCOME[t],
      highlights,
      modes: automationModes(t).map((l) => levelInfo(l).label),
      featured: Boolean(p.featured),
    };
  });
}

/** Included in every plan — the work MAIRO's AI team does, whichever plan. */
export const EVERY_PLAN: { title: string; body: string }[] = [
  { title: "A free advertising plan first", body: "Goal, audience, budget and ad ideas for your business — change it with the AI assistant, then approve it." },
  { title: "Campaigns built in your Meta ad account", body: "Facebook and Instagram campaigns, built switched off for your review. You can see every one in Meta Ads Manager." },
  { title: "Ad text and images", body: "AI-written ad text with versions to choose from, AI images, or your own pictures, videos and past posts." },
  { title: "A check before anything launches", body: "Every campaign is reviewed before launch, and you see the budget, audience, ads and costs before you approve it." },
  { title: "Daily checks and recommendations", body: "Your AI team reads your results every day and explains what it would change, with the numbers behind it." },
  { title: "Spend Protection", body: "Spending limits that warn you — or, if you choose, pause a campaign. It never raises a budget." },
  { title: "Reports in plain English", body: "A Daily Brief, a weekly report and monthly results — what Meta reports kept apart from what you confirmed." },
  { title: "The Performance Coach", body: "Follows leads past the click to bookings and customers, and says what's missing when it can't tell." },
];

export function comparison(): Group[] {
  return [
    {
      key: "automation",
      title: "What MAIRO may do on its own",
      rows: [
        { key: "manual", label: levelInfo("MANUAL").label, help: "MAIRO recommends. You approve every change.", cells: each(() => yes()) },
        { key: "assisted", label: levelInfo("ASSISTED").label, help: `When you switch it on: ${actionList("ASSISTED")}. Never raises your total.`, cells: each((t) => (ent(t).auto_optimize ? yes("Optional") : no)) },
        { key: "autopilot", label: levelInfo("AUTOPILOT").label, help: `When you switch it on: everything in AI Assist, plus ${actionInfo("adjust-audience").label.toLowerCase()}. Never raises your total.`, cells: each((t) => (ent(t).autopilot ? yes("Optional") : no)) },
      ],
    },
    {
      key: "limits",
      title: "How much you can run",
      rows: [
        { key: "campaigns", label: "Campaigns", help: "Live or waiting at once. Archived campaigns don't count.", cells: each((t) => text(campaigns(ent(t).campaign_limit))) },
        { key: "credits", label: "AI image credits", help: `Each month. A standard picture uses ${DEFAULT_COSTS.standard} credits.`, cells: each((t) => text(`${ent(t).studio_credits_monthly} a month`, `about ${pictures(ent(t).studio_credits_monthly)} pictures`)) },
        { key: "creatives", label: "Creative requests", help: "Each month, on the Creatives page: an ad idea with up to two pictures.", cells: each((t) => text(`${ent(t).creative_limit} a month`)) },
      ],
    },
    {
      key: "reports",
      title: "Reports and recommendations",
      rows: [
        { key: "brief", label: "Daily Brief, weekly report, monthly results", cells: each(() => yes()) },
        { key: "recs", label: "Recommendations with the evidence, in your Approval Center", cells: each(() => yes()) },
        { key: "per-ad", label: "Every ad's results side by side", help: "Creative-level figures in Analytics.", cells: each((t) => (ent(t).advanced_analytics ? yes() : no)) },
      ],
    },
    {
      key: "social",
      title: "Your own social media",
      rows: [
        {
          key: "social",
          label: "MAIRO Social Manager",
          help: "Strategy, content calendar and posts for your own Instagram and Facebook — organic posts, not ads. Publishing needs Meta's approval of MAIRO's posting access.",
          cells: each((t) => (ent(t).social_posting ? yes("Publishing needs Meta's approval") : no)),
        },
      ],
    },
    {
      key: "support",
      title: "Support",
      rows: [{ key: "support", label: "Support", cells: each((t) => text(prioritySupport(t) ? "Priority" : "Standard")) }],
    },
  ];
}

/** The four things that always wait for the owner, on every plan and at every automation level. */
export function alwaysYours(): { label: string; detail: string }[] {
  return ALWAYS_NEEDS_APPROVAL.map(actionInfo).map((a) => ({ label: a.label, detail: a.detail }));
}

// --- Integrations, said exactly as they are -----------------------------------------

export type IntegrationStatus = "full" | "limited" | "pending" | "tracking" | "billing" | "unsupported";

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  full: "Fully supported",
  limited: "Limited for now",
  pending: "Waiting for Meta's approval",
  tracking: "For tracking only",
  billing: "For billing only",
  unsupported: "Not supported",
};

export type Integration = { key: string; name: string; status: IntegrationStatus; what: string; limits: string | null };

/**
 * Every service the site mentions, with what it is actually used for. MAIRO
 * manages advertising on Meta only; everything else here measures results or
 * takes payment.
 */
export const INTEGRATIONS: Integration[] = [
  {
    key: "meta",
    name: "Meta (Facebook ads)",
    status: "full",
    what: "Builds, launches, pauses and reads your campaigns in your own Meta ad account, with your approval.",
    limits: null,
  },
  {
    key: "instagram-ads",
    name: "Instagram ads",
    status: "full",
    what: "Your campaigns run on Instagram as well as Facebook, through the same Meta ad account.",
    limits: null,
  },
  {
    key: "social-posting",
    name: "Instagram and Facebook posting",
    // Built, but customers can't use it until Meta approves the posting
    // permissions (see lib/social/publishing-status.ts).
    status: metaPostingApproved() ? "limited" : "pending",
    what: "Scale's Social Manager plans and writes your organic posts and can publish the ones you approve.",
    limits: "Publishing needs Meta's approval of MAIRO's posting permissions. Until Meta grants it, you can plan and write posts, but MAIRO can't publish them for you.",
  },
  {
    key: "shopify",
    name: "Shopify",
    status: "tracking",
    what: "Counts real orders from your store (a webhook you add in Shopify) and reads your public product list.",
    limits: "Not a Shopify app: MAIRO doesn't manage your store, products or checkout.",
  },
  {
    key: "gtm",
    name: "Google Tag Manager",
    status: "tracking",
    what: "Sets up your Meta pixel and conversion tags: a ready-made container you import, or a direct connection.",
    limits: "Importing the ready-made container works for everyone. The one-click direct connection depends on Google's approval of MAIRO and may not be available on your account yet.",
  },
  {
    key: "stripe",
    name: "Stripe",
    status: "billing",
    what: "Takes payment for your MAIRO subscription. MAIRO never sees your card.",
    limits: "Not used for your ad spend — Meta charges your ad account directly.",
  },
  {
    key: "other-ads",
    name: "Google Ads, TikTok and other ad networks",
    status: "unsupported",
    what: "MAIRO manages advertising on Meta only.",
    limits: null,
  },
];

// --- Money and control, in one place -------------------------------------------------
//
// What the landing page, FAQ and Terms say about money, approvals, pausing,
// cancelling and disconnecting. Each line is what the code does today:
// launches need a recorded approval (campaigns/auto-launch.ts), pausing is
// never gated by billing (ad-platforms/registry.ts PAID_WRITES), a never-paid
// subscription that ends pauses campaigns (billing/stop-unpaid.ts), a paid one
// that ends locks building and changing but leaves running campaigns running,
// and disconnecting deletes MAIRO's access token (actions/meta-actions.ts).

export const MONEY_AND_CONTROL: { key: string; title: string; body: string }[] = [
  {
    key: "budget",
    title: "How your ad budget works",
    body: "You choose the budget, and you see it before you approve each campaign. MAIRO never raises your total budget or launches a new campaign without your approval — on any plan, at any automation level.",
  },
  {
    key: "who-pays",
    title: "Which account pays Meta",
    body: "Your own Meta ad account. Meta charges the payment method on that account directly. Your MAIRO subscription is a separate bill, paid through Stripe, and never includes ad spend.",
  },
  {
    key: "automation",
    title: "What MAIRO can and can't automate",
    body: "In Manual, nothing changes without you. AI Assist and Full Autopilot are optional and only make the changes listed for them, inside the limits you set. Launching, raising your total budget, spending past your ceiling and connecting a new ad account always wait for you.",
  },
  {
    key: "approvals",
    title: "How approvals work",
    body: "Everything that needs your yes waits in your Approval Center, with who proposed it, why, the evidence and what it does to your spending. A change is shown as done only after Meta confirms it.",
  },
  {
    key: "performance",
    title: "What performance information you get",
    body: "What Meta reports — spend, reach, clicks and results — labelled as Meta's figures, plus the leads, bookings and customers you confirm. Meta's figures can take a few hours to arrive and change for a day or two.",
  },
  {
    key: "pause",
    title: "How to pause",
    body: "Pause any campaign from Campaigns in MAIRO — that always works, even without a subscription — or in Meta Ads Manager. Spend Protection can pause for you if you set it to.",
  },
  {
    key: "ending",
    title: "If your subscription ends",
    body: "Cancelling MAIRO doesn't cancel your Meta advertising. MAIRO stops building, changing and launching campaigns. Campaigns already running stay in your Meta account and keep spending at the budgets you approved until you pause them — before you cancel, MAIRO lists them so you can pause them, and pausing still works afterwards. If a free trial ends without a successful payment, MAIRO pauses your campaigns for you. Your plan and settings are kept.",
  },
  {
    key: "disconnect",
    title: "How to disconnect",
    body: "Press Disconnect on the Meta page in MAIRO, or remove MAIRO in Facebook → Settings & Privacy → Settings → Business Integrations. Disconnecting doesn't pause running campaigns, so pause them first if you want them to stop.",
  },
];
