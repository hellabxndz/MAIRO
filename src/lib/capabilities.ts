// What MAIRO can actually do today, with the code that does it.
//
// Every public claim — the landing page, the walkthrough, pricing, the FAQ —
// is meant to be drawn from here, and scripts/check-capabilities.ts fails if
// an entry's evidence is missing, a check it cites doesn't exist, or a public
// page carries a claim this list can't back (guarantees, testimonials,
// customer counts, savings figures).
//
// Four statuses, and the difference between them is what may be said:
//   working      — built, tested, safe to advertise as it stands.
//   partial      — works, with a stated condition (a setting, an approval,
//                  a provider key, or a live run not yet done). Advertise only
//                  with the condition attached.
//   demo         — sample data on a public page. Always labelled as such.
//   unavailable  — not built, or switched off. Never advertised; shown as
//                  "not available" where a customer might look for it.
//
// docs/CAPABILITIES.md is generated from this file (npm run capabilities:doc).

export type CapabilityStatus = "working" | "partial" | "demo" | "unavailable";

export type Capability = {
  id: string;
  area: "Plan" | "Campaigns" | "Creative" | "Tracking" | "Results" | "Control" | "Social" | "Billing" | "Account" | "Public site";
  name: string;
  status: CapabilityStatus;
  /** What it does, in a sentence a business owner would understand. */
  summary: string;
  /** For partial: exactly what has to be true for it to work. */
  condition?: string;
  /** Files that implement it, relative to the repo root. */
  evidence: string[];
  /** npm run check:<name> suites that exercise it. */
  checks: string[];
  /** A run against the real service, when there has been one. */
  verifiedLive?: string;
  /** The sentence a public page may use, or null when it must not be advertised. */
  claim: string | null;
};

export const CAPABILITIES: Capability[] = [
  // --- Plan -----------------------------------------------------------------
  {
    id: "free-plan",
    area: "Plan",
    name: "Free advertising plan",
    status: "working",
    summary: "From a short setup, MAIRO writes a plan: goal, campaign type, audience and why, budget and why, creative directions, website advice, tracking needs and a testing schedule.",
    evidence: ["src/lib/strategy/plan-logic.ts", "src/lib/strategy/store.ts", "src/app/plan/page.tsx", "src/components/strategy/plan-review.tsx"],
    checks: ["strategy-plan", "onboarding", "onboarding-db"],
    claim: "A free advertising plan for your business before you pay anything.",
  },
  {
    id: "plan-edit-approve",
    area: "Plan",
    name: "Change and approve the plan",
    status: "working",
    summary: "Edit any part of the plan by hand or by asking MAIRO; every version is kept and the approval is recorded with the version approved.",
    evidence: ["src/lib/strategy/plan-logic.ts", "src/lib/actions/strategy-actions.ts", "prisma/schema.prisma#StrategyPlanRevision"],
    checks: ["strategy-plan", "onboarding-db"],
    claim: "Change anything in your plan, then approve it.",
  },
  {
    id: "website-reading",
    area: "Plan",
    name: "Reading the business's website",
    status: "partial",
    summary: "Reads a few public pages of the business's own site, server-side, and shows what it found with the page it came from; anything it didn't find is marked unknown.",
    condition: "Turning the pages into business facts needs ANTHROPIC_API_KEY (set). Sites that build their text with JavaScript only, or block automated visits, can't be read.",
    evidence: ["src/lib/business/analyze.ts", "src/lib/campaigns/landing-probe.ts", "src/lib/net/safe-fetch.ts"],
    checks: ["business", "safe-fetch"],
    claim: "MAIRO reads your website and shows what it found — and what it couldn't.",
  },
  {
    id: "business-brain",
    area: "Plan",
    name: "Business Brain",
    status: "working",
    summary: "What MAIRO knows about the business, each fact with its source, editable and removable by the owner.",
    evidence: ["src/lib/brain", "src/app/dashboard/settings/business-brain"],
    checks: ["brain"],
    claim: "See and correct everything MAIRO knows about your business.",
  },
  {
    id: "onboarding-drafts",
    area: "Plan",
    name: "Setup saved as you go",
    status: "working",
    summary: "Every setup screen is saved; closing the tab and coming back opens where the owner stopped.",
    evidence: ["src/lib/onboarding/draft.ts", "src/app/onboarding/onboarding-form.tsx"],
    checks: ["onboarding", "onboarding-db"],
    claim: null,
  },

  // --- Campaigns ------------------------------------------------------------
  {
    id: "meta-campaigns",
    area: "Campaigns",
    name: "Build Facebook and Instagram campaigns",
    status: "working",
    summary: "Builds the campaign, ad set and ad in the business's own Meta ad account, switched off until the owner approves the launch.",
    evidence: ["src/lib/ad-platforms/meta", "src/lib/campaigns/launch.ts", "src/lib/campaigns/plan.ts"],
    checks: ["meta-contract", "ads", "campaign-wizard"],
    verifiedLive: "10 October 2026: launched at $1/day on a live ad account, approved by Meta, paused from MAIRO.",
    claim: "MAIRO builds the campaign in your own Meta ad account — Facebook and Instagram.",
  },
  {
    id: "launch-approval",
    area: "Campaigns",
    name: "Launch only after the owner approves",
    status: "working",
    summary: "A campaign can't spend until a person approves the launch with the budget shown; the approval is recorded.",
    evidence: ["src/lib/campaigns/auto-launch.ts", "src/lib/billing/execution.ts", "src/lib/onboarding/prelaunch.ts"],
    checks: ["payment-gate", "decision-claim", "readiness"],
    claim: "Nothing goes live until you approve it, with the budget shown.",
  },
  {
    id: "pause",
    area: "Campaigns",
    name: "Pause from MAIRO",
    status: "working",
    summary: "Pauses a campaign on Meta and shows it as paused only once Meta confirms. Never blocked by billing.",
    evidence: ["src/lib/ad-platforms/registry.ts", "src/lib/billing/running-campaigns.ts"],
    checks: ["trust-db", "payment-gate"],
    verifiedLive: "10 October 2026: paused from MAIRO, confirmed Off in Ads Manager.",
    claim: "Pause any campaign from MAIRO, with or without a subscription.",
  },
  {
    id: "lead-forms",
    area: "Campaigns",
    name: "Lead forms",
    status: "working",
    summary: "A form MAIRO hosts for the business, and Meta instant forms created on the business's Page; answers land in one Leads list.",
    evidence: ["src/app/f", "src/lib/leads/forms.ts", "src/lib/leads/meta-form.ts", "src/lib/meta/page-token.ts"],
    checks: ["leads", "page-token"],
    claim: "Collect enquiries with a form MAIRO writes for you.",
  },
  {
    id: "existing-posts",
    area: "Campaigns",
    name: "Advertise an existing Facebook post",
    status: "partial",
    summary: "Lists the Page's own posts with pictures so one can be run as the ad.",
    condition: "Listing posts verified live on 12 October 2026; running one as an ad has not yet been run live.",
    evidence: ["src/lib/meta/sales-sources.ts", "src/lib/meta/page-token.ts"],
    checks: ["page-token"],
    claim: "Use a Facebook post that already did well as your ad.",
  },
  {
    id: "scheduled-launch",
    area: "Campaigns",
    name: "Scheduled starts",
    status: "partial",
    summary: "A campaign booked to start later starts on schedule.",
    condition: "On the Hobby plan the scheduler runs once a day, so a start can be up to a day late unless the owner opens MAIRO.",
    evidence: ["src/lib/campaigns/schedule.ts", "src/app/api/cron/launch/route.ts"],
    checks: ["schedule"],
    claim: null,
  },
  {
    id: "tiktok",
    area: "Campaigns",
    name: "TikTok ads",
    status: "unavailable",
    summary: "Retired. MAIRO manages Meta advertising only.",
    evidence: ["NEXT.md#tiktok-retired"],
    checks: [],
    claim: null,
  },
  {
    id: "google-ads",
    area: "Campaigns",
    name: "Google Ads",
    status: "unavailable",
    summary: "Not built.",
    evidence: ["src/lib/pricing/compare.ts#other-ads"],
    checks: ["pricing"],
    claim: null,
  },

  // --- Creative -------------------------------------------------------------
  {
    id: "ad-copy",
    area: "Creative",
    name: "Ad text",
    status: "partial",
    summary: "Writes ad text from confirmed business facts — three different angles, each with a hook, body, call to action and why it might work.",
    condition: "Needs ANTHROPIC_API_KEY (set). Without it, MAIRO offers the owner's own text and plain templates, and says so.",
    evidence: ["src/lib/campaigns/ad-copy.ts", "src/lib/creative-studio/angles.ts"],
    checks: ["creative-studio", "brand"],
    claim: "Three different ad angles written from what you've confirmed about your business.",
  },
  {
    id: "ai-images",
    area: "Creative",
    name: "AI pictures",
    status: "partial",
    summary: "Makes and edits ad pictures in the Creative Studio, metered by monthly credits, with failed attempts refunded.",
    condition: "Needs an image provider key (OPENAI_API_KEY or GEMINI image settings) on the deployment; /aios/setup shows whether it's set.",
    evidence: ["src/lib/creative-studio/pipeline.ts", "src/lib/creative-studio/credits.ts", "src/lib/ai/openai-image.ts", "src/lib/ai/image.ts"],
    checks: ["creative-studio"],
    claim: "AI pictures for your ads, within your plan's monthly credits.",
  },
  {
    id: "uploads",
    area: "Creative",
    name: "Your own pictures and videos",
    status: "working",
    summary: "Upload pictures and videos; stored privately per business and used as they are, logo and product untouched.",
    evidence: ["src/lib/storage", "src/lib/campaigns/media-rules.ts"],
    checks: ["ads", "creative-studio"],
    claim: "Use your own photos and videos.",
  },
  {
    id: "brand-profile",
    area: "Creative",
    name: "Brand profile",
    status: "working",
    summary: "Logo, colours, tone, approved pictures, current offers and claims the business never wants made — used by every writer and checked before an ad is saved.",
    evidence: ["src/lib/brand/profile.ts", "src/app/dashboard/creative-studio/brand"],
    checks: ["brand"],
    claim: "Your brand rules — colours, tone and claims you never want made — applied to every ad.",
  },
  {
    id: "placement-previews",
    area: "Creative",
    name: "Placement previews",
    status: "working",
    summary: "Shows an ad in square (feed), 4:5 (feed) and 9:16 (Stories and Reels) with the areas Meta's buttons cover marked.",
    evidence: ["src/components/creative/placement-preview.tsx", "src/lib/creative-studio/placements.ts"],
    checks: ["brand"],
    claim: "See your ad as it will look in the feed, Stories and Reels.",
  },
  {
    id: "creative-experiments",
    area: "Creative",
    name: "Creative tests",
    status: "working",
    summary: "A test records its hypothesis, the one thing that differs, the exact creative versions, the campaign and the measurement period; a winner is only named with enough evidence.",
    evidence: ["src/lib/creative-studio/experiments.ts", "prisma/schema.prisma#CreativeExperiment"],
    checks: ["experiments"],
    claim: null,
  },
  {
    id: "ai-video",
    area: "Creative",
    name: "AI-generated video",
    status: "unavailable",
    summary: "No video generation provider is configured. Uploaded videos work.",
    evidence: ["src/lib/creative-studio/providers.ts"],
    checks: [],
    claim: null,
  },

  // --- Tracking -------------------------------------------------------------
  {
    id: "pixel-gtm",
    area: "Tracking",
    name: "Meta pixel through Google Tag Manager",
    status: "partial",
    summary: "A ready-made Tag Manager container to import; the one-click direct connection is also built.",
    condition: "The direct connection depends on Google's approval of MAIRO's Tag Manager access; importing the container works for everyone.",
    evidence: ["src/lib/tracking/gtm.ts", "src/lib/tracking/gtm-api"],
    checks: ["gtm", "tracking"],
    claim: "Set up your Meta pixel with a ready-made Google Tag Manager container.",
  },
  {
    id: "shopify-orders",
    area: "Tracking",
    name: "Shopify orders",
    status: "working",
    summary: "Counts real orders from a webhook the store adds, deduplicated, and passes them to Meta with hashed customer details.",
    evidence: ["src/lib/tracking/orders.ts", "src/app/api/orders"],
    checks: ["tracking"],
    claim: "Count real orders from your Shopify store.",
  },
  {
    id: "lead-outcomes",
    area: "Tracking",
    name: "Lead outcomes",
    status: "working",
    summary: "Mark each lead New, Contacted, Qualified, Booked, Won or Lost — by hand, from Meta forms, or from a checked CSV — with every change kept.",
    evidence: ["src/lib/leads/outcomes.ts", "src/lib/leads/csv-import.ts", "src/app/dashboard/leads"],
    checks: ["lead-outcomes", "lead-import"],
    claim: "Follow every lead from enquiry to booking to paying customer.",
  },

  // --- Results --------------------------------------------------------------
  {
    id: "results",
    area: "Results",
    name: "Results that separate reported from confirmed",
    status: "working",
    summary: "What Meta reports, what MAIRO counts and what the owner confirmed are kept apart and labelled; missing data is shown as missing, never as zero.",
    evidence: ["src/lib/results", "src/app/dashboard/page.tsx"],
    checks: ["results", "results-db", "owner-dashboard"],
    claim: "Results that keep what Meta reports apart from what you confirmed.",
  },
  {
    id: "coach",
    area: "Results",
    name: "Performance Coach",
    status: "working",
    summary: "Finds the step where leads drop out (lead → qualified → booked → customer) and says what might explain it, with what's missing.",
    evidence: ["src/lib/coach"],
    checks: ["coach", "coach-db"],
    claim: "Shows where leads drop out between the ad and a paying customer.",
  },
  {
    id: "reports",
    area: "Results",
    name: "Daily Brief, weekly report, monthly results",
    status: "working",
    summary: "Written from the business's own records: spend, confirmed outcomes, changes made and the next test.",
    evidence: ["src/lib/reports", "src/app/dashboard/reports"],
    checks: ["weekly-report", "reports", "team"],
    claim: "A weekly report on spend, confirmed results and what to try next.",
  },
  {
    id: "next-actions",
    area: "Results",
    name: "Up to three next actions",
    status: "working",
    summary: "At most three recommendations, tracking and stale data checked first; each with its evidence, uncertainty and an approve button. \"Keep collecting data\" when there isn't enough yet.",
    evidence: ["src/lib/actions-engine/next-actions.ts", "src/lib/decisions"],
    checks: ["next-actions", "decisions", "decision-claim"],
    claim: "Up to three next steps, each with the evidence behind it — and none when there isn't enough data yet.",
  },

  // --- Control --------------------------------------------------------------
  {
    id: "automation-levels",
    area: "Control",
    name: "Manual, AI Assist, Full Autopilot",
    status: "partial",
    summary: "Manual: MAIRO only recommends. AI Assist and Full Autopilot make a listed set of changes inside the owner's limits, never raising the total budget or launching.",
    condition: "The rules are tested against constructed figures; the first real week of decisions should be watched before customers switch on automation (NEXT.md item 9).",
    evidence: ["src/lib/automation/levels.ts", "src/lib/decisions"],
    checks: ["automation", "decisions"],
    claim: "Choose how much MAIRO may change on its own — or nothing at all.",
  },
  {
    id: "spend-protection",
    area: "Control",
    name: "Spend Protection and pacing",
    status: "working",
    summary: "Caps that warn, or pause a campaign if the owner chooses; month-to-date pacing against the plan; an emergency pause for everything. Meta's figures arrive late and Meta may spend over a daily budget on a single day, so MAIRO can't promise an absolute ceiling.",
    evidence: ["src/lib/protection", "src/lib/budget/pacing.ts"],
    checks: ["budget", "pacing"],
    claim: "Spending caps, pacing and a pause-everything button.",
  },
  {
    id: "approval-center",
    area: "Control",
    name: "Approval Center",
    status: "working",
    summary: "Everything waiting for a yes, with who proposed it, the evidence and what it does to spending. A change shows as done only after Meta confirms it.",
    evidence: ["src/lib/approvals/queue.ts", "src/app/dashboard/decisions"],
    checks: ["command-center", "decision-claim"],
    claim: "Every change that matters waits for your approval.",
  },

  // --- Social ---------------------------------------------------------------
  {
    id: "social-manager",
    area: "Social",
    name: "Social Manager (Scale)",
    status: "partial",
    summary: "Plans and writes organic Instagram and Facebook posts; publishing only what the owner approves.",
    condition: "Publishing waits for Meta's approval of MAIRO's posting permissions (round 2 of App Review). Scale plan only.",
    evidence: ["src/lib/social", "src/lib/social/publishing-status.ts"],
    checks: ["social-manager", "social-scheduler"],
    claim: "On Scale: social posts planned and written for you; publishing once Meta approves MAIRO's posting access.",
  },

  // --- Billing --------------------------------------------------------------
  {
    id: "subscriptions",
    area: "Billing",
    name: "Subscriptions through Stripe",
    status: "working",
    summary: "Starter $149.99 (7-day free trial, card at checkout), Growth $239.99, Scale $499.99 a month. Ad spend is paid to Meta, separately.",
    evidence: ["src/lib/plans.ts", "src/lib/actions/billing-actions.ts", "src/app/api/stripe/webhook/route.ts"],
    checks: ["payment-gate", "entitlements", "pricing", "trust-db"],
    verifiedLive: "A live Starter trial checkout came back through the webhook (NEXT.md item 8); billing enforced since 10 October 2026.",
    claim: "Plans from $149.99 a month; Starter starts with a 7-day free trial.",
  },
  {
    id: "freelancer-plans",
    area: "Billing",
    name: "Studio and Agency plans",
    status: "unavailable",
    summary: "Built in the product, but no Stripe prices exist, so they show as not available yet.",
    evidence: ["src/lib/plans.ts#FREELANCER_PLANS"],
    checks: ["entitlements"],
    claim: null,
  },

  // --- Account --------------------------------------------------------------
  {
    id: "google-sign-in",
    area: "Account",
    name: "Sign in with Google",
    status: "partial",
    summary: "Shown only when the Google OAuth client is configured.",
    condition: "Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the deployment.",
    evidence: ["src/lib/google-sign-in.ts", "src/components/google-button.tsx"],
    checks: ["google"],
    claim: null,
  },
  {
    id: "sms-alerts",
    area: "Account",
    name: "Text alerts",
    status: "partial",
    summary: "Texts the owner about things that need them, if they turn it on.",
    condition: "Needs Twilio settings on the deployment.",
    evidence: ["src/lib/sms/send.ts"],
    checks: ["notifications"],
    claim: null,
  },
  {
    id: "account-deletion",
    area: "Account",
    name: "Self-serve account deletion",
    status: "working",
    summary: "Deletes the account and its data; cancels the subscription first and names campaigns still running.",
    evidence: ["src/lib/account/close.ts", "src/app/data-deletion/page.tsx"],
    checks: ["trust-db"],
    claim: "Delete your account and data yourself, any time.",
  },

  // --- Public site ----------------------------------------------------------
  {
    id: "walkthrough",
    area: "Public site",
    name: "Product walkthrough",
    status: "demo",
    summary: "An interactive walkthrough and a 60-second video of the owner journey, built from MAIRO's own components and rules on a fictional business. Labelled \"Product demo — sample data\".",
    evidence: ["src/components/walkthrough", "public/walkthrough"],
    checks: ["walkthrough"],
    claim: null,
  },
  {
    id: "case-studies",
    area: "Public site",
    name: "Customer case studies",
    status: "unavailable",
    summary: "Supported (with recorded permission, dates, measurement period and attribution note), but none are published: there's no real customer evidence yet.",
    evidence: ["src/lib/case-studies.ts", "prisma/schema.prisma#CaseStudy"],
    checks: ["case-studies"],
    claim: null,
  },
];

export function capability(id: string): Capability {
  const c = CAPABILITIES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown capability "${id}". Add it to src/lib/capabilities.ts with its evidence first.`);
  return c;
}

/**
 * The public sentence for a capability. Throws for anything that isn't
 * working or partial, or has no approved claim — so a page can't advertise
 * what the inventory says isn't there.
 */
export function claim(id: string): string {
  const c = capability(id);
  if (c.status !== "working" && c.status !== "partial") throw new Error(`"${id}" is ${c.status} and can't be advertised.`);
  if (!c.claim) throw new Error(`"${id}" has no approved public claim.`);
  return c.claim;
}

/** Words no public page may carry: promises nobody can keep, and evidence MAIRO doesn't have. */
export const BANNED_CLAIMS: { pattern: RegExp; why: string }[] = [
  { pattern: /\bguarantee(d|s)?\b(?![^.]*\b(no|not|can't|cannot|doesn't|never)\b)/i, why: "a guarantee of results" },
  { pattern: /\btestimonial/i, why: "testimonials (none are real yet)" },
  { pattern: /★★★★|\b\d(\.\d)?\s*\/\s*5 stars?\b|\brated \d/i, why: "ratings" },
  { pattern: /\b\d[\d,]*\+?\s+(happy |satisfied )?(customers|businesses|clients|users) (use|trust|love|rely)/i, why: "a customer count" },
  { pattern: /\bsave (up to )?\d+%|\b\d+% (cheaper|less|more (leads|sales))|\b\d+x (more|roas|return)/i, why: "a savings or performance figure" },
  { pattern: /\btrusted by\b/i, why: "a social-proof claim" },
];
