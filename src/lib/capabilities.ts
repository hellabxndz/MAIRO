// What MAIRO can actually do today, with the code that does it.
//
// The capability matrix. Every public claim — the landing page, the free
// tools, the walkthrough, pricing, the FAQ, help — is meant to be drawn from
// here, and scripts/check-capabilities.ts fails if an entry's evidence is
// missing, a check it cites doesn't exist, or a public page carries a claim
// this list can't back (guarantees, testimonials, customer counts, savings
// figures).
//
// Statuses come from the code, not from what was asked for. A feature that was
// requested but isn't built is "unavailable" here until it is.
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

import { TOOLS, type Tool } from "@/lib/tools/registry";

export type CapabilityStatus = "working" | "partial" | "demo" | "unavailable";

export type Capability = {
  id: string;
  area: "Plan" | "Campaigns" | "Creative" | "Tracking" | "Results" | "Control" | "Social" | "Billing" | "Account" | "Public site" | "Free tools";
  name: string;
  status: CapabilityStatus;
  /** What it does, in a sentence a business owner would understand. */
  summary: string;
  /** For partial: exactly what has to be true for it to work. */
  condition?: string;
  /** Where a customer uses it. */
  routes: string[];
  /** Files that implement it, relative to the repo root. */
  evidence: string[];
  /** Integrations, settings or approvals it still needs — empty when none. */
  needs: string[];
  /** npm run check:<name> suites that exercise it. */
  checks: string[];
  /** What has to be shown before it can be called working (or what was). */
  verify: string;
  /** A run against the real service, when there has been one. */
  verifiedLive?: string;
  /** The sentence a public page may use, or null when it must not be advertised. */
  claim: string | null;
  /**
   * For partial: the limit in words a business owner can act on, shown beside
   * the claim on public pages. A partial capability without one isn't listed
   * publicly — its limit is a deployment setting, not something to explain.
   */
  publicNote?: string;
};

const CORE: Capability[] = [
  // --- Plan -----------------------------------------------------------------
  {
    id: "free-plan",
    area: "Plan",
    name: "Free advertising plan",
    status: "working",
    summary: "From a short setup, MAIRO writes a plan: goal, campaign type, audience and why, budget and why, three creative directions, landing-page issues, tracking needs and a testing schedule — with what it had to assume listed apart from what the owner said.",
    routes: ["/onboarding", "/plan"],
    evidence: ["src/lib/strategy/plan-logic.ts", "src/lib/strategy/plan-guide.ts", "src/lib/strategy/store.ts", "src/app/plan/page.tsx", "src/components/strategy/plan-guide.tsx"],
    needs: [],
    checks: ["strategy-plan", "plan-guide", "onboarding", "onboarding-db"],
    verify: "Browser journey (desktop and phone): sign-up → setup → plan with every section → approve; the free plan can't reach a launch button.",
    claim: "A free advertising plan for your business before you pay anything.",
  },
  {
    id: "plan-edit-approve",
    area: "Plan",
    name: "Change and approve the plan",
    status: "working",
    summary: "Edit any part of the plan by hand or by asking MAIRO; every version is kept and the approval is recorded with the version approved.",
    routes: ["/plan"],
    evidence: ["src/lib/strategy/plan-logic.ts", "src/lib/actions/strategy-actions.ts", "prisma/schema.prisma#StrategyPlanRevision"],
    needs: [],
    checks: ["strategy-plan", "onboarding-db"],
    verify: "Approval persists across reloads and is tied to the plan version.",
    claim: "Change anything in your plan, then approve it.",
  },
  {
    id: "website-reading",
    area: "Plan",
    name: "Reading the business's website",
    status: "partial",
    summary: "Reads a few public pages of the business's own site, server-side, through a fetcher that refuses private addresses and checks every redirect; shows what it found with the pages read, and lets the owner confirm, fix or remove each fact.",
    condition: "Turning the pages into business facts needs ANTHROPIC_API_KEY. Sites that build their text with JavaScript only, or block automated visits, can't be read — the owner's answers are used instead.",
    routes: ["/onboarding", "/dashboard/settings/business-brain"],
    evidence: ["src/lib/business/analyze.ts", "src/lib/campaigns/landing-probe.ts", "src/lib/net/safe-fetch.ts", "src/lib/onboarding/setup.ts"],
    needs: ["ANTHROPIC_API_KEY"],
    checks: ["business", "safe-fetch"],
    verify: "Private, local and malformed addresses refused before any request; an unreachable site carries on with the owner's answers (browser-checked).",
    claim: "MAIRO reads your website and shows what it found — and what it couldn't.",
    publicNote: "Sites built entirely with JavaScript, or that block automated visits, can't be read — you describe the business instead.",
  },
  {
    id: "campaign-preview",
    area: "Plan",
    name: "Campaign preview before sign-up",
    status: "partial",
    summary: "A visitor gives their website (or describes the business); MAIRO reads the public pages, shows each fact with where it was found, asks about anything missing, and drafts a first campaign — channel, objective, destination, audience, an example budget, three ad directions with one recommended, the tracking it needs and the steps before launch. Saving it is a free account; the facts are offered again in setup.",
    condition: "Sites that build their text with JavaScript only, or block automated visits, can't be read — the visitor describes the business instead. Not yet run against live public websites from the build environment (fixture sites only).",
    routes: ["/preview"],
    evidence: ["src/app/preview/page.tsx", "src/components/preview/preview-flow.tsx", "src/lib/preview/build.ts", "src/app/api/tools/scan/route.ts", "src/lib/website/scan.ts"],
    needs: [],
    checks: ["preview", "website", "safe-fetch"],
    verify: "Facts only from the site or the visitor, gaps asked, three directions with one recommended, no forecasts (check:preview); the journey from the hero to sign-up with type and website carried, the failure and manual paths, and the example browser-checked.",
    claim: "Preview a first campaign built from your own website — free, before you sign up.",
    publicNote: "Sites built entirely with JavaScript, or that block automated visits, can't be read — you describe the business instead.",
  },
  {
    id: "business-brain",
    area: "Plan",
    name: "Business Brain",
    status: "working",
    summary: "What MAIRO knows about the business, each fact with its source, editable and removable by the owner.",
    routes: ["/dashboard/settings/business-brain"],
    evidence: ["src/lib/brain/store.ts", "src/lib/business/brain.ts", "src/app/dashboard/settings/business-brain"],
    needs: [],
    checks: ["brain"],
    verify: "Owner corrections win over the website and are kept in history.",
    claim: "See and correct everything MAIRO knows about your business.",
  },
  {
    id: "onboarding-drafts",
    area: "Plan",
    name: "Setup saved as you go",
    status: "working",
    summary: "Every setup screen is saved; closing the tab and coming back opens where the owner stopped. A business type picked before sign-up is carried in.",
    routes: ["/onboarding", "/sign-up"],
    evidence: ["src/lib/onboarding/draft.ts", "src/app/onboarding/onboarding-form.tsx", "src/lib/onboarding/business-types.ts"],
    needs: [],
    checks: ["onboarding", "onboarding-db"],
    verify: "Reload resumes on the same screen with answers kept, including \"not sure\" (browser-checked).",
    claim: null,
  },

  // --- Campaigns ------------------------------------------------------------
  {
    id: "meta-campaigns",
    area: "Campaigns",
    name: "Build Facebook and Instagram campaigns",
    status: "working",
    summary: "Builds the campaign, ad set and ad in the business's own Meta ad account, switched off until the owner approves the launch.",
    routes: ["/dashboard/create", "/dashboard/launch", "/dashboard/campaigns"],
    evidence: ["src/lib/ad-platforms/meta", "src/lib/campaigns/launch.ts", "src/lib/campaigns/plan.ts"],
    needs: [],
    checks: ["meta-contract", "ads", "campaign-wizard"],
    verify: "Contract tests against simulated Meta; one live launch.",
    verifiedLive: "10 October 2026: launched at $1/day on a live ad account, approved by Meta, paused from MAIRO.",
    claim: "MAIRO builds the campaign in your own Meta ad account — Facebook and Instagram.",
  },
  {
    id: "launch-approval",
    area: "Campaigns",
    name: "Launch only after the owner approves",
    status: "working",
    summary: "A campaign can't spend until a person approves the launch with the budget shown; the approval is recorded. A free account can't launch.",
    routes: ["/dashboard/launch", "/plan/activate"],
    evidence: ["src/lib/campaigns/auto-launch.ts", "src/lib/billing/execution.ts", "src/lib/onboarding/prelaunch.ts"],
    needs: [],
    checks: ["payment-gate", "decision-claim", "readiness"],
    verify: "Free account redirected away from launch (browser-checked); repeated approvals don't launch twice.",
    claim: "Nothing goes live until you approve it, with the budget shown.",
  },
  {
    id: "pause",
    area: "Campaigns",
    name: "Pause from MAIRO",
    status: "working",
    summary: "Pauses a campaign on Meta and shows it as paused only once Meta confirms. Never blocked by billing.",
    routes: ["/dashboard/campaigns"],
    evidence: ["src/lib/ad-platforms/registry.ts", "src/lib/billing/running-campaigns.ts"],
    needs: [],
    checks: ["trust-db", "payment-gate"],
    verify: "Paused state shown only after Meta's confirmation.",
    verifiedLive: "10 October 2026: paused from MAIRO, confirmed Off in Ads Manager.",
    claim: "Pause any campaign from MAIRO, with or without a subscription.",
  },
  {
    id: "lead-forms",
    area: "Campaigns",
    name: "Lead forms",
    status: "working",
    summary: "A form MAIRO hosts for the business, and Meta instant forms created on the business's Page; answers land in one Leads list.",
    routes: ["/dashboard/leads", "/f/[slug]"],
    evidence: ["src/app/f", "src/lib/leads/forms.ts", "src/lib/leads/meta-form.ts", "src/lib/meta/page-token.ts"],
    needs: [],
    checks: ["leads", "page-token"],
    verify: "Instant form created and leads downloaded with the Page's own token.",
    claim: "Collect enquiries with a form MAIRO writes for you.",
  },
  {
    id: "existing-posts",
    area: "Campaigns",
    name: "Advertise an existing Facebook post",
    status: "partial",
    summary: "Lists the Page's own posts with pictures so one can be run as the ad.",
    condition: "Listing posts verified live on 12 October 2026; running one as an ad has not yet been run live.",
    routes: ["/dashboard/create"],
    evidence: ["src/lib/meta/sales-sources.ts", "src/lib/meta/page-token.ts"],
    needs: ["A live run of a post as an ad"],
    checks: ["page-token"],
    verify: "A real post run as an ad on a live account, then paused.",
    claim: "Use a Facebook post that already did well as your ad.",
    publicNote: "Choosing a post works today; running one as an ad is new and hasn't been used by a customer yet.",
  },
  {
    id: "scheduled-launch",
    area: "Campaigns",
    name: "Scheduled starts",
    status: "partial",
    summary: "A campaign booked to start later starts on schedule.",
    condition: "On the Hobby plan the scheduler runs once a day, so a start can be up to a day late unless the owner opens MAIRO.",
    routes: ["/dashboard/create"],
    evidence: ["src/lib/campaigns/schedule.ts", "src/app/api/cron/launch/route.ts"],
    needs: ["A more frequent cron (Vercel Pro) for on-time starts"],
    checks: ["schedule"],
    verify: "Cron run starts only approved, due campaigns.",
    claim: null,
  },
  {
    id: "tiktok",
    area: "Campaigns",
    name: "TikTok ads",
    status: "unavailable",
    summary: "Retired. MAIRO manages Meta advertising only.",
    routes: [],
    evidence: ["NEXT.md#TikTok (retired)"],
    needs: [],
    checks: [],
    verify: "Not offered anywhere in the product.",
    claim: null,
  },
  {
    id: "google-ads",
    area: "Campaigns",
    name: "Google Ads",
    status: "unavailable",
    summary: "Not built.",
    routes: [],
    evidence: ["src/lib/pricing/compare.ts#other-ads"],
    needs: [],
    checks: ["pricing"],
    verify: "Not offered anywhere in the product.",
    claim: null,
  },

  // --- Creative -------------------------------------------------------------
  {
    id: "ad-copy",
    area: "Creative",
    name: "Ad text",
    status: "partial",
    summary: "Suggests ad text options, each with the angle it leans on, and checks the words the way Meta will (length, banned personal-attribute wording).",
    condition: "Written suggestions need ANTHROPIC_API_KEY; without it MAIRO offers plain templates from the owner's answers and says so.",
    routes: ["/dashboard/create"],
    evidence: ["src/lib/campaigns/ad-copy.ts", "src/lib/meta/creative-copy.ts"],
    needs: ["ANTHROPIC_API_KEY"],
    checks: ["campaign-wizard", "ads"],
    verify: "Copy rules match what the server refuses at launch.",
    claim: "Ad text written from what you've told MAIRO, checked before Meta sees it.",
  },
  {
    id: "ai-images",
    area: "Creative",
    name: "AI pictures",
    status: "partial",
    summary: "Makes and edits ad pictures in the Creative Studio, metered by monthly credits, with failed attempts refunded.",
    condition: "Needs OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN on the deployment; /aios/setup shows whether they're set.",
    routes: ["/dashboard/creative-studio"],
    evidence: ["src/lib/creative-studio/pipeline.ts", "src/lib/creative-studio/credits.ts", "src/lib/ai/openai-image.ts"],
    needs: ["OPENAI_API_KEY", "BLOB_READ_WRITE_TOKEN"],
    checks: ["creative-studio"],
    verify: "Credits charged once per request and refunded on failure.",
    claim: "AI pictures for your ads, within your plan's monthly credits.",
  },
  {
    id: "uploads",
    area: "Creative",
    name: "Your own pictures and videos",
    status: "partial",
    summary: "Upload pictures and videos into the business's own folder and use them as they are, logo and product untouched.",
    condition: "Needs BLOB_READ_WRITE_TOKEN. Files are stored at unguessable, unlisted addresses (Meta has to fetch them to run the ad), not behind a sign-in.",
    routes: ["/dashboard/create"],
    evidence: ["src/app/api/uploads/ad-media/route.ts", "src/lib/storage/blob.ts", "src/lib/campaigns/media-rules.ts"],
    needs: ["BLOB_READ_WRITE_TOKEN"],
    checks: ["ads", "creative-studio"],
    verify: "Upload tokens only issued for the signed-in business's own folder, allowed types and size.",
    claim: "Use your own photos and videos.",
  },
  {
    id: "brand-profile",
    area: "Creative",
    name: "Brand details",
    status: "partial",
    summary: "Logo, colours, tone and claims to avoid are kept in the Business Brain and used by the writers.",
    condition: "Kept as Business Brain facts; a dedicated brand profile with approved pictures and a pre-save check is not built yet.",
    routes: ["/dashboard/settings/business-brain"],
    evidence: ["src/lib/business/brain.ts", "src/lib/brain/store.ts"],
    needs: ["Brand profile screen and pre-save brand check"],
    checks: ["brain"],
    verify: "Writers receive the owner's avoid-claims list.",
    claim: null,
  },
  {
    id: "placement-previews",
    area: "Creative",
    name: "Meta's own ad previews",
    status: "partial",
    summary: "Shows the ad as Meta renders it in the feed, Stories and Reels before anything is created.",
    condition: "Needs a connected Meta ad account — the preview is drawn by Meta.",
    routes: ["/dashboard/create", "/dashboard/creatives/suggested"],
    evidence: ["src/lib/meta/previews.ts", "src/app/dashboard/create/[service]/ad-preview.tsx", "src/lib/actions/suggested-ads-actions.ts"],
    needs: ["Connected Meta ad account"],
    checks: ["ads"],
    verify: "Preview requests create nothing in the ad account.",
    claim: null,
  },
  {
    id: "creative-experiments",
    area: "Creative",
    name: "Creative tests",
    status: "unavailable",
    summary: "Once two suggested ads are approved, MAIRO writes down a proposed test — the question and the exact versions it would compare. Running it and naming a winner aren't built; the page says so.",
    routes: [],
    evidence: ["prisma/schema.prisma#CreativeExperiment", "src/lib/suggested-ads/store.ts"],
    needs: ["Experiment workflow and evidence thresholds"],
    checks: ["suggested-ads"],
    verify: "No winner named on thin evidence; results tied to exact published versions.",
    claim: null,
  },
  {
    id: "suggested-ads",
    area: "Creative",
    name: "Suggested ads after connecting Meta",
    status: "partial",
    summary: "Once Meta is connected and the business profile is confirmed, MAIRO suggests three ad directions written only from confirmed facts, with one recommended as the first test and why. Each can become a real picture after its cost is shown, be rewritten (every version kept), or use the owner's own video; approval is bound to the exact words and picture or video version, and continuing opens the campaign builder with that ad. Nothing is published or spent.",
    condition: "Making the picture needs a paid plan, AI credits and the image provider switched on; using an uploaded video needs a paid plan and storage. Not yet run against a live Meta account and the live image provider together.",
    routes: ["/dashboard/creatives/suggested"],
    evidence: ["src/lib/suggested-ads/directions.ts", "src/lib/suggested-ads/store.ts", "src/lib/actions/suggested-ads-actions.ts", "src/app/dashboard/creatives/suggested/suggested-ads.tsx"],
    needs: ["Connected Meta ad account", "Confirmed business profile"],
    checks: ["suggested-ads"],
    verify: "Directions from confirmed facts only, one recommended, avoided words never used, no invented figures; revisions kept; approval withdrawn by any change; every record scoped to its business (check:suggested-ads). Live picture generation from this page not yet run.",
    claim: "After you connect Meta, MAIRO suggests three ads from what you've confirmed, with one marked as the best first test.",
    publicNote: "You approve each ad before it's used; making a picture uses AI credits.",
  },
  {
    id: "video-editing",
    area: "Creative",
    name: "Editing an uploaded video",
    status: "partial",
    summary: "On an owner's own video: start and end, captions at times and a crop, with timestamped suggestions from the video's length and shape. Each save is a new version and the uploaded file is never changed. The edits are a preview — they aren't rendered into the file, so an ad plays the original, and the owner confirms that before approving.",
    condition: "Edits are previewed, not written into the video file — that needs a video rendering worker.",
    routes: ["/dashboard/creatives/suggested"],
    evidence: ["src/lib/suggested-ads/video.ts", "src/app/dashboard/creatives/suggested/video-editor.tsx"],
    needs: ["A video rendering worker"],
    checks: ["suggested-ads"],
    verify: "Original never overwritten; edits clamped to the video; suggestions timestamped; every edit not in the file named (check:suggested-ads).",
    claim: null,
  },
  {
    id: "ai-video",
    area: "Creative",
    name: "AI-generated video",
    status: "unavailable",
    summary: "No video generation provider is configured. Uploaded videos work.",
    routes: [],
    evidence: ["src/lib/creative-studio/format-info.ts"],
    needs: ["A video generation provider"],
    checks: [],
    verify: "Never advertised until a provider produces a real file.",
    claim: null,
  },

  // --- Tracking -------------------------------------------------------------
  {
    id: "pixel",
    area: "Tracking",
    name: "Meta pixel: choose, install, verify",
    status: "partial",
    summary: "Lists the pixels in the connected ad account with who owns each and recommends the one worth reusing; the owner picks one (or types an ID Meta then confirms) or asks MAIRO to create one — once, safely retried, reported only with an ID Meta confirmed. Install steps by website platform; checks the website for the pixel and Meta's event counts for the event the campaign needs, keeping not detected, not seen and missing permission apart from failures; consent setting applied to server-side orders; a readiness summary for the campaign.",
    condition: "Needs a connected Meta account with ads_management. Installing is the owner's step (or Tag Manager's). Meta's pixel stats endpoint and the ownership fields have been exercised against a stubbed Meta only, not yet a live account.",
    routes: ["/dashboard/tracking"],
    evidence: ["src/lib/tracking/setup.ts", "src/lib/tracking/state.ts", "src/lib/tracking/meta-pixel.ts", "src/app/dashboard/tracking/tracking-setup.tsx", "src/lib/tracking/orders.ts"],
    needs: ["Connected Meta ad account", "A live run against a real ad account"],
    checks: ["tracking", "tracking-setup"],
    verify: "Stubbed-Meta suite: choice and ownership, explicit selection, idempotent creation (double click, lost reply, no id), stage transitions, check results, consent on orders, isolation.",
    claim: "Choose your existing Meta pixel or create one in your own account.",
    publicNote: "Putting the pixel on your website is still a step for you or whoever manages your site — MAIRO walks you through it.",
  },
  {
    id: "pixel-gtm",
    area: "Tracking",
    name: "Meta pixel through Google Tag Manager",
    status: "partial",
    summary: "A ready-made Tag Manager container to import; the one-click direct connection is also built.",
    condition: "The direct connection depends on Google's approval of MAIRO's Tag Manager access; importing the container works for everyone.",
    routes: ["/dashboard/tracking"],
    evidence: ["src/lib/tracking/gtm.ts", "src/lib/tracking/gtm-api"],
    needs: ["Google verification of the Tag Manager scope"],
    checks: ["gtm", "tracking"],
    verify: "Container imports cleanly; direct publish only with the owner's Google consent.",
    claim: "Set up your Meta pixel with a ready-made Google Tag Manager container.",
    publicNote: "Importing the ready-made container works today; the one-click connection waits on Google's approval.",
  },
  {
    id: "shopify-orders",
    area: "Tracking",
    name: "Shopify orders",
    status: "working",
    summary: "Counts real orders from a webhook the store adds, deduplicated, and passes them to Meta's Conversions API with hashed customer details.",
    routes: ["/dashboard/tracking"],
    evidence: ["src/lib/tracking/orders.ts", "src/app/api/orders"],
    needs: [],
    checks: ["tracking"],
    verify: "Repeated webhooks count once; customer details hashed before leaving MAIRO.",
    claim: "Count real orders from your Shopify store.",
  },
  {
    id: "lead-outcomes",
    area: "Tracking",
    name: "Lead outcomes",
    status: "working",
    summary: "Mark each lead New, Contacted, Qualified, Booked, Estimate sent, Won, Lost or Spam; reported, qualified, booked and won are kept apart.",
    routes: ["/dashboard/leads"],
    evidence: ["src/lib/leads/outcomes.ts", "src/app/dashboard/leads"],
    needs: [],
    checks: ["lead-outcomes", "lead-report"],
    verify: "Counts never mix platform conversions with owner-confirmed outcomes.",
    claim: "Follow every lead from enquiry to booking to paying customer.",
  },
  {
    id: "lead-import",
    area: "Tracking",
    name: "Lead import and change history",
    status: "unavailable",
    summary: "CSV import, manual entry, duplicate detection and a history of every change. The tables exist; the workflow isn't built.",
    routes: [],
    evidence: ["prisma/schema.prisma#LeadEvent"],
    needs: ["Import and history workflow"],
    checks: [],
    verify: "Validated rows, duplicates merged by contact, every change recorded.",
    claim: null,
  },

  // --- Results --------------------------------------------------------------
  {
    id: "results",
    area: "Results",
    name: "Results that separate reported from confirmed",
    status: "working",
    summary: "What Meta reports, what MAIRO counts and what the owner confirmed are kept apart and labelled; missing data is shown as missing, never as zero.",
    routes: ["/dashboard", "/dashboard/analytics"],
    evidence: ["src/lib/results/model.ts", "src/app/dashboard/page.tsx"],
    needs: [],
    checks: ["results", "results-db"],
    verify: "Null figures render as unavailable with their source.",
    claim: "Results that keep what Meta reports apart from what you confirmed.",
  },
  {
    id: "coach",
    area: "Results",
    name: "Performance Coach",
    status: "working",
    summary: "Finds the step where leads drop out (lead → qualified → booked → customer) and says what might explain it, with what's missing.",
    routes: ["/dashboard/coach"],
    evidence: ["src/lib/coach/diagnose.ts", "src/lib/coach/funnel.ts"],
    needs: [],
    checks: ["coach", "coach-db"],
    verify: "No diagnosis without enough data; failed tracking first.",
    claim: "Shows where leads drop out between the ad and a paying customer.",
  },
  {
    id: "reports",
    area: "Results",
    name: "Daily Brief, weekly report, monthly results",
    status: "working",
    summary: "Written from the business's own records: spend, confirmed outcomes, changes made and the next test.",
    routes: ["/dashboard/reports", "/dashboard/reports/monthly"],
    evidence: ["src/lib/reports/weekly.ts", "src/lib/reports/monthly.ts", "src/app/dashboard/reports"],
    needs: [],
    checks: ["weekly-report", "reports", "team"],
    verify: "Only recorded data; empty weeks say so.",
    claim: "A weekly report on spend, confirmed results and what to try next.",
  },
  {
    id: "recommendations",
    area: "Results",
    name: "Recommendations with approval",
    status: "working",
    summary: "The Decision Engine and Coach propose changes with their evidence; each waits for approval, and a change shows as done only after Meta accepts it. Claims are leased so an approval can't run twice.",
    routes: ["/dashboard/decisions", "/dashboard/coach"],
    evidence: ["src/lib/decisions/apply.ts", "src/lib/decisions/rules.ts", "src/lib/approvals/queue.ts"],
    needs: [],
    checks: ["decisions", "decision-claim", "command-center"],
    verify: "Repeated approvals execute once; failures recorded as failed.",
    claim: "Every change that matters waits for your approval.",
  },

  // --- Control --------------------------------------------------------------
  {
    id: "automation-levels",
    area: "Control",
    name: "Manual, AI Assist, Full Autopilot",
    status: "partial",
    summary: "Manual: MAIRO only recommends. AI Assist and Full Autopilot make a listed set of changes inside the owner's limits, never raising the total budget or launching.",
    condition: "The rules are tested against constructed figures; the first real week of decisions should be watched before customers switch on automation (NEXT.md item 9).",
    routes: ["/dashboard/settings"],
    evidence: ["src/lib/automation/levels.ts", "src/lib/decisions/guardrails.ts"],
    needs: ["A watched week of real decisions"],
    checks: ["automation", "decisions"],
    verify: "No level can raise total budget or launch.",
    claim: "Choose how much MAIRO may change on its own — or nothing at all.",
    publicNote: "New: MAIRO suggests watching the first week of its decisions before you switch automation on.",
  },
  {
    id: "spend-protection",
    area: "Control",
    name: "Spend Protection",
    status: "working",
    summary: "A stop-loss and a monthly cap that warn, or pause a campaign if the owner chooses. Meta's figures arrive late and Meta may spend over a daily budget on a single day, so MAIRO can't promise an absolute ceiling.",
    routes: ["/dashboard/settings"],
    evidence: ["src/lib/protection/rules.ts", "src/lib/protection/run.ts"],
    needs: [],
    checks: ["budget"],
    verify: "Caps evaluated nightly and on each Overview visit.",
    claim: "Spending caps that warn you, or pause a campaign if you choose.",
  },

  // --- Social ---------------------------------------------------------------
  {
    id: "social-manager",
    area: "Social",
    name: "Social Manager (Scale)",
    status: "partial",
    summary: "Plans and writes organic Instagram and Facebook posts; publishing only what the owner approves.",
    condition: "Publishing waits for Meta's approval of MAIRO's posting permissions (round 2 of App Review). Scale plan only.",
    routes: ["/dashboard/social"],
    evidence: ["src/lib/social", "src/lib/social/publishing-status.ts"],
    needs: ["Meta App Review: posting permissions"],
    checks: ["social-manager", "social-scheduler"],
    verify: "Scale-only; nothing published without approval.",
    claim: "On Scale: social posts planned and written for you; publishing once Meta approves MAIRO's posting access.",
  },

  // --- Billing --------------------------------------------------------------
  {
    id: "subscriptions",
    area: "Billing",
    name: "Subscriptions through Stripe",
    status: "working",
    summary: "Starter $149.99 (7-day free trial, card at checkout), Growth $239.99, Scale $499.99 a month. Ad spend is paid to Meta, separately.",
    routes: ["/plan/activate", "/dashboard/billing"],
    evidence: ["src/lib/plans.ts", "src/lib/actions/billing-actions.ts", "src/app/api/stripe/webhook/route.ts"],
    needs: [],
    checks: ["payment-gate", "entitlements", "pricing", "trust-db"],
    verify: "Live checkout returned through the webhook; entitlements follow the subscription.",
    verifiedLive: "A live Starter trial checkout came back through the webhook (NEXT.md item 8); billing enforced since 10 October 2026.",
    claim: "Plans from $149.99 a month; Starter starts with a 7-day free trial.",
  },
  {
    id: "freelancer-plans",
    area: "Billing",
    name: "Studio and Agency plans",
    status: "unavailable",
    summary: "Built in the product, but no Stripe prices exist, so they show as not available yet.",
    routes: ["/clients/billing"],
    evidence: ["src/lib/plans.ts#FREELANCER_PLANS"],
    needs: ["Stripe prices"],
    checks: ["entitlements"],
    verify: "Shown as not available.",
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
    routes: ["/sign-in", "/sign-up"],
    evidence: ["src/lib/google-sign-in.ts", "src/components/google-button.tsx"],
    needs: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    checks: ["google"],
    verify: "Button hidden when not configured.",
    claim: null,
  },
  {
    id: "sms-alerts",
    area: "Account",
    name: "Text alerts",
    status: "partial",
    summary: "Texts the owner about things that need them, if they turn it on.",
    condition: "Needs Twilio settings on the deployment.",
    routes: ["/dashboard/notifications"],
    evidence: ["src/lib/sms/send.ts"],
    needs: ["Twilio settings"],
    checks: ["notifications"],
    verify: "Nothing sent unless switched on.",
    claim: null,
  },
  {
    id: "account-deletion",
    area: "Account",
    name: "Self-serve account deletion",
    status: "working",
    summary: "Deletes the account and its data; cancels the subscription first and names campaigns still running.",
    routes: ["/dashboard/account", "/data-deletion"],
    evidence: ["src/lib/account/close.ts", "src/app/data-deletion/page.tsx"],
    needs: [],
    checks: ["trust-db"],
    verify: "Subscription cancelled before data removed.",
    claim: "Delete your account and data yourself, any time.",
  },

  // --- Public site ----------------------------------------------------------
  {
    id: "product-preview",
    area: "Public site",
    name: "Landing story and product demos",
    status: "demo",
    summary: "The landing page's 20-second animated story — a website becoming a profile, three ad directions, placement previews, an owner approval and a results view — on three invented businesses, with chapters, pause, replay and a still version for reduced motion; plus interactive views of the dashboard and Coach. Every view is labelled as an example with sample data.",
    routes: ["/", "/landing/classic"],
    evidence: ["src/components/hero-story/hero-story.tsx", "src/components/hero-story/stage.tsx", "src/lib/demo/timeline.ts", "src/lib/demo/examples.ts", "src/components/landing/product-preview.tsx", "src/components/landing/coach-demo.tsx", "src/lib/coach/example.ts"],
    needs: [],
    checks: ["capabilities", "preview"],
    verify: "Every view carries the example label; no figure presented as a customer's result; timeline bounds, scenes and captions pinned by check:preview; 390/768/1440, keyboard and reduced motion browser-checked.",
    claim: null,
  },
  {
    id: "walkthrough",
    area: "Public site",
    name: "60-second walkthrough and videos",
    status: "demo",
    summary: "A 60-second interactive walkthrough of the owner journey on a sample business — website and goal, facts and gaps, plan, ads, approval, results — with chapters, captions on by default, a position slider, keyboard control and a still version for reduced motion; plus muted MP4 renders of it and of the landing story, with posters and WebVTT captions, made by video/render.mjs from the same components. No voice-over yet.",
    routes: ["/"],
    evidence: ["src/components/walkthrough/walkthrough-player.tsx", "src/components/walkthrough/walkthrough-stage.tsx", "src/lib/demo/walkthrough.ts", "src/lib/demo/media.ts", "video/render.mjs"],
    needs: ["A voice provider, if a narrated version is wanted"],
    checks: ["preview"],
    verify: "Storyboard timing, captions and layout bounds pinned by check:preview, which also checks every listed video file, poster and captions file exists as rendered; player controls, keyboard and reduced motion browser-checked.",
    claim: null,
  },
  {
    id: "case-studies",
    area: "Public site",
    name: "Customer case studies",
    status: "unavailable",
    summary: "The table for permission-based case studies exists, but there's no real customer evidence yet, so none are shown.",
    routes: [],
    evidence: ["prisma/schema.prisma#CaseStudy"],
    needs: ["A customer's written permission and measured results"],
    checks: [],
    verify: "Only published with recorded consent, dates, measurement period and limitations.",
    claim: null,
  },
];

/** Each free tool is a capability too, with its status from the tools registry. */
function toolCapability(t: Tool): Capability {
  return {
    id: `tool:${t.slug}`,
    area: "Free tools",
    name: t.name,
    status: t.status,
    summary: t.summary,
    ...(t.status === "partial" ? { condition: t.condition } : {}),
    routes: t.status === "unavailable" ? [] : [`/tools/${t.slug}`],
    evidence: t.evidence,
    needs: t.needs,
    checks: t.checks,
    verify: t.verify,
    claim: t.status === "working" || t.status === "partial" ? t.summary : null,
  };
}

export const CAPABILITIES: Capability[] = [...CORE, ...TOOLS.map(toolCapability)];

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
  // A guarantee, unless it's denied ("doesn't guarantee", "no guarantees") or asked ("Can MAIRO guarantee results?").
  { pattern: /(?<!(?:\bno|\bnot|n't|\bnever|\bcannot)\s(?:\w+\s){0,2})\bguarantee(d|s)?\b(?![^.?]*(\?|\b(no|not|never|can't|cannot|doesn't)\b))/i, why: "a guarantee of results" },
  { pattern: /\btestimonial/i, why: "testimonials (none are real yet)" },
  { pattern: /★★★★|\b\d(\.\d)?\s*\/\s*5 stars?\b|\brated \d/i, why: "ratings" },
  { pattern: /\b\d[\d,]*\+?\s+(happy |satisfied )?(customers|businesses|clients|users) (use|trust|love|rely)/i, why: "a customer count" },
  { pattern: /\bsave (up to )?\d+%|\b\d+% (cheaper|less|more (leads|sales))|\b\d+x (more|roas|return)/i, why: "a savings or performance figure" },
  { pattern: /\btrusted by\b/i, why: "a social-proof claim" },
  { pattern: /\bbetter than (larven|madgicx|adcreative|revealbot|adespresso)\b/i, why: "an unsupported competitor comparison" },
];
