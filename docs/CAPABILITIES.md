# MAIRO capability matrix

Generated from `src/lib/capabilities.ts` and `src/lib/tools/registry.ts` by `npm run capabilities:doc` — edit those, not this file.
Statuses come from the code and its checks, not from what was requested.
`npm run check:capabilities` fails if any evidence below is missing, a cited check doesn't exist,
or a public page makes a claim this inventory can't back.

| Status | Meaning |
| --- | --- |
| Working | Built and tested; safe to advertise as it stands. |
| Partially working | Works with the stated condition; advertise only with the condition attached. |
| Demo only | Sample data on a public page, always labelled. |
| Unavailable | Not built or switched off; never advertised. |

## Matrix

| Area | Capability | Status | Routes | Still needs | Checks |
| --- | --- | --- | --- | --- | --- |
| Plan | Free advertising plan | Working | `/onboarding`, `/plan` | — | `check:strategy-plan`, `check:plan-guide`, `check:calculators`, `check:onboarding`, `check:onboarding-db` |
| Plan | Change and approve the plan | Working | `/plan` | — | `check:strategy-plan`, `check:onboarding-db` |
| Plan | Reading the business's website | Partially working | `/onboarding`, `/dashboard/settings/business-brain` | ANTHROPIC_API_KEY | `check:business`, `check:safe-fetch` |
| Plan | Free AI Meta ad strategy generator (before sign-up) | Partially working | `/`, `/preview`, `/s/[token]`, `/plan/start` | — | `check:strategy`, `check:plan-writing`, `check:refine`, `check:report`, `check:saved-plan`, `check:preview`, `check:consult`, `check:website`, `check:safe-fetch` |
| Plan | Reading a public Instagram profile | Partially working | `/preview`, `/` | — | `check:instagram`, `check:safe-fetch` |
| Plan | Business Brain | Working | `/dashboard/settings/business-brain` | — | `check:brain` |
| Plan | Setup in nine phases, saved as you go | Working | `/onboarding`, `/sign-up` | — | `check:onboarding`, `check:onboarding-db` |
| Campaigns | Build Facebook and Instagram campaigns | Working | `/dashboard/create`, `/dashboard/launch`, `/dashboard/campaigns` | — | `check:meta-contract`, `check:ads`, `check:campaign-wizard` |
| Campaigns | Meta API updates and integration health (internal) | Partially working | `/aios/meta-intelligence` | — | `check:meta-reliability`, `check:meta-contract`, `check:meta-intelligence` |
| Campaigns | Launch only after the owner approves | Working | `/dashboard/launch`, `/plan/activate` | — | `check:payment-gate`, `check:decision-claim`, `check:readiness` |
| Campaigns | Pause from MAIRO | Working | `/dashboard/campaigns` | — | `check:trust-db`, `check:payment-gate`, `check:pause-everything-db` |
| Campaigns | Lead forms | Working | `/dashboard/leads`, `/f/[slug]` | — | `check:leads`, `check:page-token` |
| Campaigns | Advertise an existing Facebook post | Partially working | `/dashboard/create` | A live run of a post as an ad | `check:page-token` |
| Campaigns | Scheduled starts | Partially working | `/dashboard/create` | A more frequent cron (Vercel Pro) for on-time starts | `check:schedule` |
| Campaigns | TikTok ads | Unavailable | — | — | — |
| Campaigns | Google Ads | Unavailable | — | — | `check:pricing` |
| Creative | Ad text | Partially working | `/dashboard/create` | ANTHROPIC_API_KEY | `check:campaign-wizard`, `check:ads` |
| Creative | AI pictures | Partially working | `/dashboard/creative-studio` | OPENAI_API_KEY; BLOB_READ_WRITE_TOKEN | `check:creative-studio` |
| Creative | Your own pictures and videos | Partially working | `/dashboard/create`, `/dashboard/creatives/suggested` | BLOB_READ_WRITE_TOKEN | `check:ads`, `check:creative-studio`, `check:suggested-ads` |
| Creative | Brand details and brand check | Partially working | `/dashboard/settings/business-brain`, `/dashboard/create`, `/dashboard/creatives/suggested` | Approved asset library | `check:brand`, `check:brain`, `check:suggested-ads` |
| Creative | Meta's own ad previews | Partially working | `/dashboard/create`, `/dashboard/creatives/suggested` | Connected Meta ad account | `check:ads` |
| Creative | Creative tests | Partially working | `/dashboard/creatives/suggested`, `/dashboard/decisions` | A live test on a real ad account | `check:experiments`, `check:suggested-ads`, `check:decisions` |
| Creative | Suggested ads after connecting Meta | Partially working | `/dashboard/creatives/suggested` | Connected Meta ad account; Confirmed business profile | `check:suggested-ads`, `check:creative-readiness` |
| Creative | Creative readiness check | Working | `/dashboard/creatives/suggested` | — | `check:creative-readiness` |
| Creative | Previews in six formats | Working | `/dashboard/creatives/suggested` | — | `check:creative-readiness` |
| Creative | Ask MAIRO to rewrite an ad | Partially working | `/dashboard/creatives/suggested` | ANTHROPIC_API_KEY | `check:creative-readiness` |
| Creative | Change a suggested ad's picture | Partially working | `/dashboard/creatives/suggested` | OPENAI_API_KEY; Blob storage | `check:creative-readiness`, `check:creative-studio` |
| Creative | Creative Library | Working | `/dashboard/creatives` | — | `check:creative-readiness` |
| Creative | Editing an uploaded video | Partially working | `/dashboard/creatives/suggested` | ffmpeg on the server (ffmpeg-static install script); BLOB_READ_WRITE_TOKEN | `check:suggested-ads`, `check:video-render` |
| Creative | AI-generated video | Unavailable | — | A video generation provider | — |
| Tracking | Meta pixel: choose, install, verify | Partially working | `/dashboard/tracking` | Connected Meta ad account; A live run against a real ad account | `check:tracking`, `check:tracking-setup` |
| Tracking | Meta Pixel in setup, and the purchase-launch rule | Partially working | `/dashboard/pixel`, `/dashboard/launch`, `/dashboard/settings` | Connected Meta ad account; A live run against a real ad account | `check:pixel-setup` |
| Tracking | Meta pixel through Google Tag Manager | Partially working | `/dashboard/tracking` | Google verification of the Tag Manager scope | `check:gtm`, `check:tracking` |
| Tracking | Shopify orders | Working | `/dashboard/tracking` | — | `check:tracking` |
| Tracking | Lead outcomes | Working | `/dashboard/leads` | — | `check:lead-outcomes`, `check:lead-report` |
| Tracking | Lead import and change history | Working | `/dashboard/leads` | — | `check:lead-import`, `check:lead-outcomes` |
| Results | Results that separate reported from confirmed | Working | `/dashboard`, `/dashboard/analytics` | — | `check:results`, `check:results-db` |
| Results | Performance Coach | Working | `/dashboard/coach` | — | `check:coach`, `check:coach-db` |
| Results | Daily Brief, weekly report, monthly results | Working | `/dashboard/reports`, `/dashboard/reports/monthly` | — | `check:weekly-report`, `check:reports`, `check:team` |
| Results | Recommendations with approval | Working | `/dashboard/decisions`, `/dashboard/coach` | — | `check:decisions`, `check:decision-claim`, `check:command-center` |
| Control | Manual, AI Assist, Full Autopilot | Partially working | `/dashboard/settings` | A watched week of real decisions | `check:automation`, `check:decisions` |
| Control | Spend Protection | Working | `/dashboard/settings` | — | `check:budget` |
| Social | Social Manager (discontinued) | Unavailable | `/dashboard/social` | — | `check:social-manager`, `check:social-scheduler`, `check:ads` |
| Billing | Subscriptions through Stripe | Working | `/pricing`, `/plan/activate`, `/dashboard/billing`, `/dashboard/billing/change` | — | `check:payment-gate`, `check:entitlements`, `check:pricing`, `check:trust-db` |
| Billing | Studio and Agency plans | Unavailable | `/clients/billing` | Stripe prices | `check:entitlements` |
| Account | Team members and roles | Working | `/dashboard/settings/team`, `/invite/[token]` | — | `check:members`, `check:trust-db` |
| Account | Up to 3 businesses on MAIRO Scale | Working | `/dashboard/settings/businesses`, `/dashboard/billing/change` | — | `check:plans-v2` |
| Account | Multi-step approvals | Unavailable | — | An approval chain model and its review screens | — |
| Account | Several brands under one account, with their own budgets and reporting across them | Unavailable | — | A parent organization for brands, cross-brand budgets and combined reports with per-brand labels | — |
| Account | Sign in with Google | Partially working | `/sign-in`, `/sign-up` | GOOGLE_CLIENT_ID; GOOGLE_CLIENT_SECRET | `check:google` |
| Account | Password reset by email | Partially working | `/forgot-password`, `/reset-password` | RESEND_API_KEY; EMAIL_FROM | `check:password-reset` |
| Account | Text alerts | Partially working | `/dashboard/notifications` | Twilio settings | `check:notifications` |
| Account | Self-serve account deletion | Working | `/dashboard/account`, `/data-deletion` | — | `check:trust-db` |
| Public site | Homepage product clips, film and demos | Demo only | `/`, `/landing/classic` | Screen recordings of a real person using MAIRO in a demo account, to sit beside the component renders; Licensed voice-over and music for the film | `check:capabilities`, `check:preview`, `check:clips` |
| Public site | The MAIRO demo (73-second walkthrough) and videos | Demo only | `/landing/classic` | A licensed British female voice recording of the script; Licensed background music | `check:preview` |
| Public site | Help center with search | Working | `/help`, `/help/[slug]`, `/dashboard/guide`, `/dashboard/guide/[slug]` | — | `check:help` |
| Public site | Pages for online stores, local services and appointment businesses | Demo only | `/solutions/[slug]` | — | `check:solutions` |
| Public site | Customer case studies | Unavailable | — | A customer's written permission and measured results | — |
| Free tools | Break-even ROAS calculator | Working | `/tools/break-even-roas` | — | `check:calculators` |
| Free tools | Margin and markup calculator | Working | `/tools/margin-markup` | — | `check:calculators` |
| Free tools | Ad return scenario calculator | Working | `/tools/ad-roi` | — | `check:calculators` |
| Free tools | Customer lifetime contribution calculator | Working | `/tools/customer-lifetime-value` | — | `check:calculators` |
| Free tools | Monthly operating profit calculator | Working | `/tools/monthly-profit` | — | `check:calculators` |
| Free tools | Cost-per-lead and booking calculator | Working | `/tools/service-lead-economics` | — | `check:calculators` |
| Free tools | Ad budget scenario planner | Working | `/tools/budget-planner` | — | `check:calculators` |
| Free tools | Shopify plan and fee comparison | Partially working | `/tools/shopify-fees` | Confirm the default rates against shopify.com/pricing | `check:calculators` |
| Free tools | Ad hook generator | Working | `/tools/hook-generator` | — | `check:calculators` |
| Free tools | Creative brief and first-test planner | Working | `/tools/creative-brief` | — | `check:calculators` |
| Free tools | Offer clarity checker | Working | `/tools/offer-clarity` | — | `check:calculators` |
| Free tools | Ad examples by goal | Working | `/tools/ad-examples` | — | `check:calculators` |
| Free tools | Product and offer readiness checklist | Working | `/tools/offer-readiness` | — | `check:calculators` |
| Free tools | Competitor ad research (guided) | Working | `/tools/competitor-ads` | — | `check:calculators` |
| Free tools | Competitor website comparison | Working | `/tools/competitor-website` | — | `check:website`, `check:safe-fetch` |
| Free tools | Landing page audit | Working | `/tools/landing-page-audit` | — | `check:website`, `check:safe-fetch` |
| Free tools | Shopify app detector | Working | `/tools/shopify-app-detector` | — | `check:website`, `check:safe-fetch` |
| Free tools | Shopify theme detector | Working | `/tools/shopify-theme-detector` | — | `check:website`, `check:safe-fetch` |
| Free tools | Tracking readiness checker | Working | `/tools/tracking-readiness` | — | `check:website`, `check:safe-fetch` |
| Free tools | UTM link builder | Working | `/tools/utm-builder` | — | `check:calculators` |

## Working (43)

### Free advertising plan

*Plan* · `free-plan`

From a short setup, MAIRO writes a plan: goal, campaign type, audience and why, budget and why, three creative directions, landing-page issues, tracking needs and a testing schedule — with what it had to assume listed apart from what the owner said. A break-even from the free calculators, once the owner chooses to use it, becomes one of the plan's facts and the line its first test is judged against; without one, the plan says it's judging by cost alone.

**Routes:** `/onboarding`, `/plan`

**Verification:** Browser journey (desktop and phone): sign-up → setup → plan with every section → approve; the free plan can't reach a launch button. Calculator numbers: offered in setup and on the plan, used only when pressed, refused if they don't add up, never carried from example numbers, removable (check:calculators, check:plan-guide, browser-checked).

**Evidence:** `src/lib/strategy/plan-logic.ts`, `src/lib/strategy/plan-guide.ts`, `src/lib/strategy/store.ts`, `src/app/plan/page.tsx`, `src/components/strategy/plan-guide.tsx`, `src/lib/calc/assumptions.ts`, `src/components/strategy/plan-numbers.tsx`

**Checks:** `check:strategy-plan`, `check:plan-guide`, `check:calculators`, `check:onboarding`, `check:onboarding-db`

**Public claim:** “A free advertising plan for your business before you pay anything.”

### Change and approve the plan

*Plan* · `plan-edit-approve`

Edit any part of the plan by hand or by asking MAIRO; every version is kept and the approval is recorded with the version approved.

**Routes:** `/plan`

**Verification:** Approval persists across reloads and is tied to the plan version.

**Evidence:** `src/lib/strategy/plan-logic.ts`, `src/lib/actions/strategy-actions.ts`, `prisma/schema.prisma#StrategyPlanRevision`

**Checks:** `check:strategy-plan`, `check:onboarding-db`

**Public claim:** “Change anything in your plan, then approve it.”

### Business Brain

*Plan* · `business-brain`

What MAIRO knows about the business, each fact with its source, editable and removable by the owner.

**Routes:** `/dashboard/settings/business-brain`

**Verification:** Owner corrections win over the website and are kept in history.

**Evidence:** `src/lib/brain/store.ts`, `src/lib/business/brain.ts`, `src/app/dashboard/settings/business-brain`

**Checks:** `check:brain`

**Public claim:** “See and correct everything MAIRO knows about your business.”

### Setup in nine phases, saved as you go

*Plan* · `onboarding-drafts`

Setup is shown as nine phases — business, goal, strategy, free plan, creatives, video, account and payment, approval and launch, next steps — read from the records, with the next step and a button to continue it. The three ad directions come before any account setup: after approving the free plan, the owner sees their first ads before being asked to connect Meta or pay. The owner's own onboarding answers are kept in the Business Brain as confirmed. Every setup screen is saved; closing the tab and coming back opens where the owner stopped. A business type picked before sign-up is carried in.

**Routes:** `/onboarding`, `/sign-up`

**Verification:** Steps, phases and the creatives-before-account order pinned by check:onboarding and check:onboarding-db; reload resumes on the same screen with answers kept, including "not sure"; a new account reaches its first ads with no Meta account connected (browser-checked).

**Evidence:** `src/lib/onboarding/draft.ts`, `src/app/onboarding/onboarding-form.tsx`, `src/lib/onboarding/business-types.ts`

**Checks:** `check:onboarding`, `check:onboarding-db`

**Public claim:** none — not advertised

### Build Facebook and Instagram campaigns

*Campaigns* · `meta-campaigns`

Builds the campaign, ad set and ad in the business's own Meta ad account, switched off until the owner approves the launch.

**Routes:** `/dashboard/create`, `/dashboard/launch`, `/dashboard/campaigns`

**Verification:** Contract tests against simulated Meta; one live launch.

**Verified live:** 10 October 2026: launched at $1/day on a live ad account, approved by Meta, paused from MAIRO.

**Evidence:** `src/lib/ad-platforms/meta`, `src/lib/campaigns/launch.ts`, `src/lib/campaigns/plan.ts`

**Checks:** `check:meta-contract`, `check:ads`, `check:campaign-wizard`

**Public claim:** “MAIRO builds the campaign in your own Meta ad account — Facebook and Instagram.”

### Launch only after the owner approves

*Campaigns* · `launch-approval`

A campaign can't spend until a person approves the launch with the budget shown; the approval is recorded. A free account can't launch.

**Routes:** `/dashboard/launch`, `/plan/activate`

**Verification:** Free account redirected away from launch (browser-checked); repeated approvals don't launch twice.

**Evidence:** `src/lib/campaigns/auto-launch.ts`, `src/lib/billing/execution.ts`, `src/lib/onboarding/prelaunch.ts`

**Checks:** `check:payment-gate`, `check:decision-claim`, `check:readiness`

**Public claim:** “Nothing goes live until you approve it, with the budget shown.”

### Pause from MAIRO

*Campaigns* · `pause`

Pauses a campaign on Meta and shows it as paused only once Meta confirms. Pause everything, on Campaigns, does the same for every campaign running or waiting on Meta at once, reports each one (paused, or Meta's refusal), and holds automatic launches so nothing switches itself back on. Never blocked by billing.

**Routes:** `/dashboard/campaigns`

**Verification:** Paused state shown only after Meta's confirmation; Pause everything checked against a pretend Meta that refuses one campaign (the rest are paused, the refused one is reported and left as it was, launches held, each outcome logged, role-gated not billing-gated). The single pause verified live; Pause everything not yet run against live Meta.

**Verified live:** 10 October 2026: paused from MAIRO, confirmed Off in Ads Manager.

**Evidence:** `src/lib/ad-platforms/registry.ts`, `src/lib/billing/running-campaigns.ts`, `src/lib/protection/run.ts#pauseEverything`, `src/app/dashboard/campaigns/pause-everything.tsx`

**Checks:** `check:trust-db`, `check:payment-gate`, `check:pause-everything-db`

**Public claim:** “Pause any campaign from MAIRO, with or without a subscription.”

### Lead forms

*Campaigns* · `lead-forms`

A form MAIRO hosts for the business, and Meta instant forms created on the business's Page; answers land in one Leads list.

**Routes:** `/dashboard/leads`, `/f/[slug]`

**Verification:** Instant form created and leads downloaded with the Page's own token.

**Evidence:** `src/app/f`, `src/lib/leads/forms.ts`, `src/lib/leads/meta-form.ts`, `src/lib/meta/page-token.ts`

**Checks:** `check:leads`, `check:page-token`

**Public claim:** “Collect enquiries with a form MAIRO writes for you.”

### Creative readiness check

*Creative* · `creative-readiness`

Every suggested ad gets a readiness score out of 100 from seven areas — message, offer, brand, button, format, landing page and tracking — each saying what MAIRO looked at and what would make it better. Something to fix before running caps the score. "Improve this ad" makes the fixes MAIRO can make from confirmed facts (a shorter opening line, the button for the goal, the confirmed offer) as a new version that can be undone. It's labelled as a heuristic for avoidable weaknesses, never a prediction of results.

**Routes:** `/dashboard/creatives/suggested`

**Verification:** Each area's rules, areas that don't apply left out of the score, the cap when something must be fixed, and fixes that use only confirmed facts (check:creative-readiness); shown, applied and recorded as MAIRO's fix in a local browser run.

**Evidence:** `src/lib/creative/readiness.ts`, `src/app/dashboard/creatives/suggested/readiness-panel.tsx`, `src/lib/actions/suggested-ads-actions.ts`

**Checks:** `check:creative-readiness`

**Public claim:** “Each suggested ad gets a readiness check before it runs — a check for avoidable weaknesses, not a prediction of results.”

### Previews in six formats

*Creative* · `format-previews`

A suggested ad can be seen as MAIRO's mock-up in the Instagram feed, Facebook feed, Stories, Reels, as a square and as 9:16. Each says what it shows: the owner's picture or video and its version, or an illustration of the layout when nothing is made yet. Meta's own preview sits beside it for pictures.

**Routes:** `/dashboard/creatives/suggested`

**Verification:** Every format labelled illustrative when there's no picture, and with the picture's version when there is (check:creative-readiness, local browser run at 1280 and 390 wide).

**Evidence:** `src/app/dashboard/creatives/suggested/placements.tsx`, `src/app/dashboard/creatives/suggested/review-dialog.tsx`

**Checks:** `check:creative-readiness`

**Public claim:** none — not advertised

### Creative Library

*Creative* · `creative-library`

Every creative in one searchable list — suggested by MAIRO, made in Creative Studio, uploaded, and ads that ran — filtered by drafts, approved and launched, with how many versions each has kept. Results appear only for ads Meta reported figures for.

**Routes:** `/dashboard/creatives`

**Verification:** One business's creatives only, by source and stage, no results without Meta figures (check:creative-readiness); filters and search in a local browser run.

**Evidence:** `src/lib/creatives/library.ts`, `src/lib/creatives/library-view.ts`, `src/app/dashboard/creatives/library-client.tsx`

**Checks:** `check:creative-readiness`

**Public claim:** none — not advertised

### Shopify orders

*Tracking* · `shopify-orders`

Counts real orders from a webhook the store adds, deduplicated, and passes them to Meta's Conversions API with hashed customer details.

**Routes:** `/dashboard/tracking`

**Verification:** Repeated webhooks count once; customer details hashed before leaving MAIRO.

**Evidence:** `src/lib/tracking/orders.ts`, `src/app/api/orders`

**Checks:** `check:tracking`

**Public claim:** “Count real orders from your Shopify store.”

### Lead outcomes

*Tracking* · `lead-outcomes`

Mark each lead New, Contacted, Qualified, Booked, Estimate sent, Won, Lost or Spam; reported, qualified, booked and won are kept apart.

**Routes:** `/dashboard/leads`

**Verification:** Counts never mix platform conversions with owner-confirmed outcomes.

**Evidence:** `src/lib/leads/outcomes.ts`, `src/app/dashboard/leads`

**Checks:** `check:lead-outcomes`, `check:lead-report`

**Public claim:** “Follow every lead from enquiry to booking to paying customer.”

### Lead import and change history

*Tracking* · `lead-import`

Add a lead by hand, or import a spreadsheet of the ones the business already has: every row checked with the reason it's refused, the same person merged rather than duplicated (a stage set in MAIRO is never moved backwards), and every change kept in the lead's history — without contact details or note text in it. Added and imported leads are followed up like any other, and never counted as results of ads.

**Routes:** `/dashboard/leads`

**Verification:** CSV edge cases, refusals with reasons, in-file and existing duplicates, re-import adds no one, history without personal details, isolation, imports excluded from ad results (check:lead-import); the preview, import, manual add, duplicate refusal and history browser-checked at desktop and phone width.

**Evidence:** `src/lib/leads/import.ts`, `src/lib/leads/history.ts`, `src/app/dashboard/leads/lead-intake.tsx`, `src/lib/leads/outcomes.ts`

**Checks:** `check:lead-import`, `check:lead-outcomes`

**Public claim:** “Bring in the leads you already have, and see every change to each one.”

### Results that separate reported from confirmed

*Results* · `results`

What Meta reports, what MAIRO counts and what the owner confirmed are kept apart and labelled; missing data is shown as missing, never as zero.

**Routes:** `/dashboard`, `/dashboard/analytics`

**Verification:** Null figures render as unavailable with their source.

**Evidence:** `src/lib/results/model.ts`, `src/app/dashboard/page.tsx`

**Checks:** `check:results`, `check:results-db`

**Public claim:** “Results that keep what Meta reports apart from what you confirmed.”

### Performance Coach

*Results* · `coach`

Finds the step where leads drop out (lead → qualified → booked → customer) and says what might explain it, with what's missing.

**Routes:** `/dashboard/coach`

**Verification:** No diagnosis without enough data; failed tracking first.

**Evidence:** `src/lib/coach/diagnose.ts`, `src/lib/coach/funnel.ts`

**Checks:** `check:coach`, `check:coach-db`

**Public claim:** “Shows where leads drop out between the ad and a paying customer.”

### Daily Brief, weekly report, monthly results

*Results* · `reports`

Written from the business's own records: spend, confirmed outcomes, changes made and the next test.

**Routes:** `/dashboard/reports`, `/dashboard/reports/monthly`

**Verification:** Only recorded data; empty weeks say so.

**Evidence:** `src/lib/reports/weekly.ts`, `src/lib/reports/monthly.ts`, `src/app/dashboard/reports`

**Checks:** `check:weekly-report`, `check:reports`, `check:team`

**Public claim:** “A weekly report on spend, confirmed results and what to try next.”

### Recommendations with approval

*Results* · `recommendations`

The Decision Engine and Coach propose changes with their evidence; each waits for approval, and a change shows as done only after Meta accepts it. Claims are leased so an approval can't run twice.

**Routes:** `/dashboard/decisions`, `/dashboard/coach`

**Verification:** Repeated approvals execute once; failures recorded as failed.

**Evidence:** `src/lib/decisions/apply.ts`, `src/lib/decisions/rules.ts`, `src/lib/approvals/queue.ts`

**Checks:** `check:decisions`, `check:decision-claim`, `check:command-center`

**Public claim:** “Every change that matters waits for your approval.”

### Spend Protection

*Control* · `spend-protection`

A stop-loss and a monthly cap that warn, or pause a campaign if the owner chooses. Meta's figures arrive late and Meta may spend over a daily budget on a single day, so MAIRO can't promise an absolute ceiling.

**Routes:** `/dashboard/settings`

**Verification:** Caps evaluated nightly and on each Overview visit.

**Evidence:** `src/lib/protection/rules.ts`, `src/lib/protection/run.ts`

**Checks:** `check:budget`

**Public claim:** “Spending caps that warn you, or pause a campaign if you choose.”

### Subscriptions through Stripe

*Billing* · `subscriptions`

MAIRO Pro $139.99 (7-day free trial, card at checkout) and MAIRO Scale $299.99 a month. Earlier plans (Starter, Growth, the $499.99 Scale, Studio, Agency) keep working for their subscribers and can't be bought. Ad spend is paid to Meta, separately.

**Routes:** `/pricing`, `/plan/activate`, `/dashboard/billing`, `/dashboard/billing/change`

**Verification:** Live checkout returned through the webhook; entitlements follow the subscription.

**Verified live:** A live trial checkout on the earlier Starter plan came back through the webhook (NEXT.md item 8); billing enforced since 10 October 2026. Pro and Scale checkouts need their Stripe prices (STRIPE_PRICE_PRO, STRIPE_PRICE_SCALE_V2) and haven't been bought live yet.

**Evidence:** `src/lib/plans.ts`, `src/lib/entitlements.ts`, `src/lib/actions/billing-actions.ts`, `src/lib/billing/checkout.ts`, `src/lib/billing/confirm-checkout.ts`, `src/lib/stripe/apply-subscription.ts`, `src/app/api/stripe/webhook/route.ts`, `src/app/dashboard/billing/change/page.tsx`

**Checks:** `check:payment-gate`, `check:entitlements`, `check:pricing`, `check:trust-db`

**Public claim:** “MAIRO Pro $139.99 a month with a 7-day free trial; MAIRO Scale $299.99 a month.”

### Team members and roles

*Account* · `team-roles`

Invite people to a business with one of six roles — Owner, Administrator, Marketing Manager, Creative Editor, Analyst or Viewer — and change or remove them. The role is checked on the server for every change: only owners, administrators and marketing managers change budgets or approve launches; only owners and administrators manage the team or connect and disconnect advertising accounts; only owners handle billing. The assistant only offers the changes the person's role allows. Every team change is in the team's audit log. Someone on several teams switches between their businesses, and a removed person loses access on their next request. MAIRO makes the invitation link; the owner sends it — MAIRO doesn't email anyone. Team members are part of MAIRO Scale (and the earlier plans): on MAIRO Pro the owner works alone, and invitations are refused on the server (member_limit); a plan change never removes anyone already on a team.

**Routes:** `/dashboard/settings/team`, `/invite/[token]`

**Verification:** Role matrix pinned; every server action that changes something checks the role (static check); invitations hashed, single-use, address-bound, expiring; last owner kept; cross-business isolation; removal ends access; assistant tools by role (check:members). Browser: invite, join, roles, refusals, switching.

**Evidence:** `src/lib/members/roles.ts`, `src/lib/members/authorize.ts`, `src/lib/members/store.ts`, `src/lib/members/workspace.ts`, `src/lib/actions/team-actions.ts`, `src/app/dashboard/settings/team/page.tsx`, `src/app/(auth)/invite/[token]/page.tsx`, `src/components/mairo/workspace-switcher.tsx`

**Checks:** `check:members`, `check:trust-db`

**Public claim:** “Invite your team, each with a role that decides what they can change.”

### Up to 3 businesses on MAIRO Scale

*Account* · `scale-businesses`

A MAIRO Scale owner adds up to two more businesses or brands under the same subscription, each with its own Meta ad account, campaigns, ads, results and team, and switches between them. The added businesses copy the paying business's plan (written on creation, by the Stripe webhook on every change, and by the daily review as a backstop). When the plan no longer covers one — a move to Pro, or the subscription ending — building, changing and launching stop there, but its running campaigns keep running until the owner pauses them, and nothing is deleted. Removing one is refused while anything runs on Meta.

**Routes:** `/dashboard/settings/businesses`, `/dashboard/billing/change`

**Verification:** check:plans-v2 — allowance by plan, sync on upgrade, downgrade and cancellation, oldest-first coverage, freelancer clients untouched.

**Evidence:** `src/lib/brands.ts`, `src/lib/actions/brand-actions.ts`, `src/app/dashboard/settings/businesses/page.tsx`, `src/lib/stripe/apply-subscription.ts`

**Checks:** `check:plans-v2`

**Public claim:** “MAIRO Scale covers up to three Meta ad accounts, one per business or brand.”

### Self-serve account deletion

*Account* · `account-deletion`

Deletes the account and its data; cancels the subscription first and names campaigns still running.

**Routes:** `/dashboard/account`, `/data-deletion`

**Verification:** Subscription cancelled before data removed.

**Evidence:** `src/lib/account/close.ts`, `src/app/data-deletion/page.tsx`

**Checks:** `check:trust-db`

**Public claim:** “Delete your account and data yourself, any time.”

### Help center with search

*Public site* · `help-center`

Eight articles — getting started, connecting Meta, website tracking, when a picture can't be made, credits and usage, approvals, results, billing — written from the same modules the product runs on (plan numbers, money facts, capability limits, tracking stages, the credit ledger's hold), with search as you type. Public at /help and inside the dashboard at /dashboard/guide, linked from the billing, Creative Studio, tracking, approvals, performance and Meta screens. Contact is the configured support address and in-app Feedback.

**Routes:** `/help`, `/help/[slug]`, `/dashboard/guide`, `/dashboard/guide/[slug]`

**Verification:** check:help pins every article's numbers to the plans, entitlements and credit ledger, the money and approval wording to the pricing page's, the partial capabilities' limits, the links and related articles, the search results for the usual questions and every in-app help link; the pages browser-checked public and signed in.

**Evidence:** `src/lib/help/articles.ts`, `src/lib/help/search.ts`, `src/components/help/help-search.tsx`, `src/components/help/help-article.tsx`, `src/app/help/page.tsx`, `src/app/dashboard/guide/page.tsx`

**Checks:** `check:help`

**Public claim:** “Plain answers about how MAIRO works, in a help center you can search.”

### Break-even ROAS calculator

*Free tools* · `tool:break-even-roas`

The return on ad spend you need before ads stop losing money on each sale — before fixed costs.

**Routes:** `/tools/break-even-roas`

**Verification:** $100 sale with $60 variable costs gives $40 contribution and 2.5x break-even ROAS.

**Evidence:** `src/components/tools/break-even-roas.tsx`, `src/lib/calc/economics.ts`

**Checks:** `check:calculators`

**Public claim:** “The return on ad spend you need before ads stop losing money on each sale — before fixed costs.”

### Margin and markup calculator

*Free tools* · `tool:margin-markup`

Turn a cost and a price into margin and markup — and see why they're different numbers.

**Routes:** `/tools/margin-markup`

**Verification:** Margin divides by price, markup by cost; zero and negative inputs explained.

**Evidence:** `src/components/tools/margin-markup.tsx`, `src/lib/calc/economics.ts`

**Checks:** `check:calculators`

**Public claim:** “Turn a cost and a price into margin and markup — and see why they're different numbers.”

### Ad return scenario calculator

*Free tools* · `tool:ad-roi`

Model clicks, orders or jobs, and what's left after ad spend, from your own cost-per-click and conversion assumptions.

**Routes:** `/tools/ad-roi`

**Verification:** Modeled clicks = budget / CPC; orders = clicks × rate; contribution after ad spend = orders × contribution − spend.

**Evidence:** `src/components/tools/ad-roi.tsx`, `src/lib/calc/economics.ts`

**Checks:** `check:calculators`

**Public claim:** “Model clicks, orders or jobs, and what's left after ad spend, from your own cost-per-click and conversion assumptions.”

### Customer lifetime contribution calculator

*Free tools* · `tool:customer-lifetime-value`

What a customer contributes over a time horizon you choose, from their purchases and your margin — and the most you could pay to win one.

**Routes:** `/tools/customer-lifetime-value`

**Verification:** Contribution-based, explicit horizon; affordable acquisition cost keeps the reserve you set.

**Evidence:** `src/components/tools/customer-lifetime-value.tsx`, `src/lib/calc/economics.ts`

**Checks:** `check:calculators`

**Public claim:** “What a customer contributes over a time horizon you choose, from their purchases and your margin — and the most you could pay to win one.”

### Monthly operating profit calculator

*Free tools* · `tool:monthly-profit`

Sales, variable costs, ad spend, fixed costs and software fees in one month — what's left, and what wasn't counted.

**Routes:** `/tools/monthly-profit`

**Verification:** Every cost line shown; never called net profit when taxes and other costs are excluded.

**Evidence:** `src/components/tools/monthly-profit.tsx`, `src/lib/calc/economics.ts`

**Checks:** `check:calculators`

**Public claim:** “Sales, variable costs, ad spend, fixed costs and software fees in one month — what's left, and what wasn't counted.”

### Cost-per-lead and booking calculator

*Free tools* · `tool:service-lead-economics`

For service businesses: the most you can pay per lead, from your job value, costs and how many leads book and buy.

**Routes:** `/tools/service-lead-economics`

**Verification:** $400 contribution and 20% lead-to-sale gives $80 break-even CPL; a $100 reserve gives $60.

**Evidence:** `src/components/tools/service-lead-economics.tsx`, `src/lib/calc/economics.ts`

**Checks:** `check:calculators`

**Public claim:** “For service businesses: the most you can pay per lead, from your job value, costs and how many leads book and buy.”

### Ad budget scenario planner

*Free tools* · `tool:budget-planner`

See what a daily budget can realistically test, how long learning takes at that level, and three scenarios from your own assumptions.

**Routes:** `/tools/budget-planner`

**Verification:** Uses the plan's own budget thresholds; scenarios labelled as scenarios.

**Evidence:** `src/components/tools/budget-planner.tsx`, `src/lib/calc/budget.ts`

**Checks:** `check:calculators`

**Public claim:** “See what a daily budget can realistically test, how long learning takes at that level, and three scenarios from your own assumptions.”

### Ad hook generator

*Free tools* · `tool:hook-generator`

Opening lines for your ads from different angles — the problem, the result, an objection, the offer — built only from what you enter.

**Routes:** `/tools/hook-generator`

**Verification:** Each hook from a different angle; nothing claimed that wasn't entered.

**Evidence:** `src/components/tools/hook-generator.tsx`, `src/lib/creative/hooks.ts`

**Checks:** `check:calculators`

**Public claim:** “Opening lines for your ads from different angles — the problem, the result, an objection, the offer — built only from what you enter.”

### Creative brief and first-test planner

*Free tools* · `tool:creative-brief`

A one-page brief for your first ad and a simple first test: one thing changed, what to measure, and when to decide.

**Routes:** `/tools/creative-brief`

**Verification:** One variable per test; decision rule stated before the test.

**Evidence:** `src/components/tools/creative-brief.tsx`, `src/lib/creative/brief.ts`

**Checks:** `check:calculators`

**Public claim:** “A one-page brief for your first ad and a simple first test: one thing changed, what to measure, and when to decide.”

### Offer clarity checker

*Free tools* · `tool:offer-clarity`

Paste your headline or offer and see which questions a stranger would still have — who it's for, what they get, what it costs, what to do next.

**Routes:** `/tools/offer-clarity`

**Verification:** Each finding quotes the text it's about; a rubric, not a conversion forecast.

**Evidence:** `src/components/tools/offer-clarity.tsx`, `src/lib/creative/offer-clarity.ts`

**Checks:** `check:calculators`

**Public claim:** “Paste your headline or offer and see which questions a stranger would still have — who it's for, what they get, what it costs, what to do next.”

### Ad examples by goal

*Free tools* · `tool:ad-examples`

Original example ads written by MAIRO, organised by goal, format and business type — what each is trying to do and why.

**Routes:** `/tools/ad-examples`

**Verification:** Every example is MAIRO's own and labelled as an example, not a real business's ad.

**Evidence:** `src/components/tools/ad-examples.tsx`, `src/lib/tools/ad-examples.ts`

**Checks:** `check:calculators`

**Public claim:** “Original example ads written by MAIRO, organised by goal, format and business type — what each is trying to do and why.”

### Product and offer readiness checklist

*Free tools* · `tool:offer-readiness`

Is this product or service ready to advertise? A checklist of margin, proof, delivery and page basics — not a prediction that it will sell.

**Routes:** `/tools/offer-readiness`

**Verification:** Checklist score explained as a checklist, never as a likelihood of success.

**Evidence:** `src/components/tools/offer-readiness.tsx`, `src/lib/tools/readiness.ts`

**Checks:** `check:calculators`

**Public claim:** “Is this product or service ready to advertise? A checklist of margin, proof, delivery and page basics — not a prediction that it will sell.”

### Competitor ad research (guided)

*Free tools* · `tool:competitor-ads`

A guided search of Meta's public Ad Library for a competitor, with a template for noting what you see — and what it can't tell you.

**Routes:** `/tools/competitor-ads`

**Verification:** Clearly a guided search, not automated research; no spend or performance inferred.

**Evidence:** `src/components/tools/competitor-ads.tsx`, `src/lib/tools/ad-library.ts`

**Checks:** `check:calculators`

**Public claim:** “A guided search of Meta's public Ad Library for a competitor, with a template for noting what you see — and what it can't tell you.”

### Competitor website comparison

*Free tools* · `tool:competitor-website`

Compare public pages side by side: offer, positioning, calls to action, prices shown and brand presentation.

**Routes:** `/tools/competitor-website`

**Verification:** Only what's on the public pages, with the page it came from; no traffic or revenue invented.

**Evidence:** `src/components/tools/competitor-website.tsx`, `src/lib/website/scan.ts`, `src/app/api/tools/scan/route.ts`

**Checks:** `check:website`, `check:safe-fetch`

**Public claim:** “Compare public pages side by side: offer, positioning, calls to action, prices shown and brand presentation.”

### Landing page audit

*Free tools* · `tool:landing-page-audit`

What a visitor from an ad would find on your page: the three changes that matter most, each with the evidence, then the full list.

**Routes:** `/tools/landing-page-audit`

**Verification:** SSRF-safe fetch; every finding cites the page; unmeasured things say "Not checked".

**Evidence:** `src/components/tools/landing-page-audit.tsx`, `src/lib/website/scan.ts`, `src/app/api/tools/scan/route.ts`

**Checks:** `check:website`, `check:safe-fetch`

**Public claim:** “What a visitor from an ad would find on your page: the three changes that matter most, each with the evidence, then the full list.”

### Shopify app detector

*Free tools* · `tool:shopify-app-detector`

Which apps a Shopify store shows publicly, with the evidence for each and what a public scan can't see.

**Routes:** `/tools/shopify-app-detector`

**Verification:** Evidence per detection; "not detected" never presented as "not installed".

**Evidence:** `src/components/tools/shopify-app-detector.tsx`, `src/lib/website/scan.ts`, `src/app/api/tools/scan/route.ts`

**Checks:** `check:website`, `check:safe-fetch`

**Public claim:** “Which apps a Shopify store shows publicly, with the evidence for each and what a public scan can't see.”

### Shopify theme detector

*Free tools* · `tool:shopify-theme-detector`

The theme a Shopify store uses, when it's publicly visible, with the evidence.

**Routes:** `/tools/shopify-theme-detector`

**Verification:** Evidence shown; unknown when the theme isn't visible.

**Evidence:** `src/components/tools/shopify-theme-detector.tsx`, `src/lib/website/scan.ts`, `src/app/api/tools/scan/route.ts`

**Checks:** `check:website`, `check:safe-fetch`

**Public claim:** “The theme a Shopify store uses, when it's publicly visible, with the evidence.”

### Tracking readiness checker

*Free tools* · `tool:tracking-readiness`

Checks a page for the Meta pixel, Tag Manager and a consent banner, and says what that does and doesn't prove.

**Routes:** `/tools/tracking-readiness`

**Verification:** A detected script is never reported as working events.

**Evidence:** `src/components/tools/tracking-readiness.tsx`, `src/lib/website/scan.ts`, `src/app/api/tools/scan/route.ts`

**Checks:** `check:website`, `check:safe-fetch`

**Public claim:** “Checks a page for the Meta pixel, Tag Manager and a consent banner, and says what that does and doesn't prove.”

### UTM link builder

*Free tools* · `tool:utm-builder`

Build tagged links for your ads so your analytics can tell which ad sent each visitor — with Meta's dynamic values when you want them.

**Routes:** `/tools/utm-builder`

**Verification:** Valid URL out; existing query kept; values encoded.

**Evidence:** `src/components/tools/utm-builder.tsx`, `src/lib/calc/utm.ts`

**Checks:** `check:calculators`

**Public claim:** “Build tagged links for your ads so your analytics can tell which ad sent each visitor — with Meta's dynamic values when you want them.”

## Partially working (24)

### Reading the business's website

*Plan* · `website-reading`

Reads a few public pages of the business's own site, server-side, through a fetcher that refuses private addresses and checks every redirect; shows what it found with the pages read, and lets the owner confirm, fix or remove each fact.

**Condition:** Turning the pages into business facts needs ANTHROPIC_API_KEY. Sites that build their text with JavaScript only, or block automated visits, can't be read — the owner's answers are used instead.

**Routes:** `/onboarding`, `/dashboard/settings/business-brain`

**Still needs:** ANTHROPIC_API_KEY

**Verification:** Private, local and malformed addresses refused before any request; an unreachable site carries on with the owner's answers (browser-checked).

**Evidence:** `src/lib/business/analyze.ts`, `src/lib/campaigns/landing-probe.ts`, `src/lib/net/safe-fetch.ts`, `src/lib/onboarding/setup.ts`

**Checks:** `check:business`, `check:safe-fetch`

**Public claim:** “MAIRO reads your website and shows what it found — and what it couldn't.”

### Free AI Meta ad strategy generator (before sign-up)

*Plan* · `campaign-preview`

The homepage's hero starts it as a short conversation — the website or, without one, a sentence; then MAIRO says what it read and asks what it sells, the goal and the monthly budget — and hands the answers to /preview through session storage. /preview: four answers — the website (or, without one, the business's name), what it sells (filled in from the website reading for the visitor to check), the goal (online sales, leads, bookings, website traffic or brand awareness) and the monthly Meta ad budget ($300–$5,000+ or a custom amount, said to be Meta spend, not MAIRO's price). Six stages, each ticked when its real work finishes: the website reading on MAIRO's server, then the opportunities, strategy and budget split worked out from the facts, then the ad concepts written by MAIRO's AI and checked, then the plan. The report: A — the business, each fact marked as from the website or from the visitor, MAIRO's suggestions labelled as suggestions; B — the Meta strategy for the goal (objective, what Meta optimises for, audience, placements, messaging, structure, why); C — the visitor's budget divided by rules that follow the goal, budget and tracking, adding up exactly, with daily amounts and why retargeting or testing is or isn't there; D — three concepts in Facebook and Instagram feed previews, the visual labelled as a concept, one recommended to test first with the reason; E — what the website reading saw (pages, pixel, checkout, form, booking) and its findings, or no technical claims when no site was read; F — the first 30 days as planned actions. Under the plan's summary MAIRO asks “Do you like your plan? What would you change?”: the owner answers in their own words (or taps a suggestion) and MAIRO changes the budget, the goal or the facts (where they advertise, who it's for, the offer) in place — read by MAIRO's AI, or by its rules when the AI is off, each reply saying which; only figures and wording the owner wrote are kept, a guarantee never is, and the reply lists what changed and what it couldn't. A goal or fact change rewrites the concepts. “I like it — get started” (there and at the end): save, sign-up or sign-in, the plan claimed by the new business, then the quick start (/plan/start) — one question (where a tap on an ad goes), MAIRO writes the strategy, the owner approves what they're shown — then choosing a MAIRO plan (/plan/activate) and connecting Meta. Explore Plans stays. Change the budget or goal, edit answers, save (kept in this browser; on the server only when Save, Share or Activate Your AI Advertising Team is pressed), share a private link, download as PDF through the browser's print. The earlier free-plan flow stays for example plans and description links, and for old Instagram links. Nothing is spent, launched or charged.

**Condition:** The ad concepts and the "what makes it appealing" points are written by MAIRO's AI only with ANTHROPIC_API_KEY set, up to 6 plans an hour per visitor and 300 a day across everyone ("What would you change?" read by the AI up to 8 times an hour per visitor and 400 a day, then by MAIRO's rules); otherwise, or if the AI doesn't answer, they come from MAIRO's ad templates and the plan says so. Sites that build their text with JavaScript only, or block automated visits, can't be read — the plan is built from what the visitor typed. No pictures are made for the concepts. Not yet run against live public websites or the live AI model from the build environment (fixture sites and a labelled local fixture only). The privacy wording on saved and shared plans needs legal review.

**Routes:** `/`, `/preview`, `/s/[token]`, `/plan/start`

**Verification:** Facts only from the site or the visitor, each with its source; plans that change with the business, goal and budget; budget splits that add up and explain themselves; no forecasts or claims MAIRO can't back; AI writing checked and labelled, templates when it's off, limited per visitor; saved plans claimed by one business only, expired after 30 days (check:strategy, check:plan-writing, check:report, check:saved-plan). Browser: an online shop, a local service and a lead-generation business from fixture sites and one with no website, at 1440, 768 and 390, by keyboard and with reduced motion; budget and goal changes; save, share, the shared link, download; "What would you change?" changing the budget, goal and area in place; I like it — get started into sign-up, the quick start, approval and the plan choice.

**Evidence:** `src/components/home/hero-starter.tsx`, `src/components/plan-generator/plan-generator.tsx`, `src/components/plan-generator/plan-report.tsx`, `src/lib/preview/report.ts`, `src/lib/preview/answers.ts`, `src/lib/preview/strategy.ts`, `src/lib/ai/ad-plan.ts`, `src/lib/preview/plan-writing.ts`, `src/app/api/tools/ad-plan/route.ts`, `src/app/api/free-plan/route.ts`, `src/lib/preview/refine.ts`, `src/lib/ai/plan-refine.ts`, `src/app/api/free-plan/refine/route.ts`, `src/app/plan/start/page.tsx`, `src/lib/actions/start-actions.ts`, `src/lib/onboarding/intake.ts`, `src/lib/preview/saved-plan-store.ts`, `src/lib/preview/pending-plan.ts`, `src/app/s/[token]/page.tsx`, `src/app/api/tools/scan/route.ts`, `src/lib/website/scan.ts`, `src/components/preview/preview-flow.tsx`

**Checks:** `check:strategy`, `check:plan-writing`, `check:refine`, `check:report`, `check:saved-plan`, `check:preview`, `check:consult`, `check:website`, `check:safe-fetch`

**Public claim:** “Generate a free AI ad plan for your business — strategy, budget split, three ad concepts and your first 30 days — before you spend a dollar.”

### Reading a public Instagram profile

*Plan* · `instagram-reading`

For the free plan: with one request through the same guarded fetcher as the website reader, MAIRO reads what Instagram shows anyone who opens the profile without signing in — the profile name, the bio and the link in the bio — and shows each as "From your Instagram" for the visitor to confirm or change. It reads no posts, followers, insights or ad performance, stores nothing, and counts against the same free limits as a website reading.

**Condition:** No longer offered as a way to start a free plan (the homepage and /preview start from a website or a description); only old ?instagram= links still use it. Instagram often shows a signed-out visitor a login page instead of the profile, and never shows private profiles; MAIRO says so and the visitor describes the business. Not yet run against live Instagram from the build environment (fixture profiles only). Reading public profile pages should be reviewed against Instagram's terms before it's relied on.

**Routes:** `/preview`, `/`

**Verification:** Usernames and profile links normalised, reserved paths refused, the bio and link read from a signed-out profile page, a login wall or missing profile handled honestly, follower counts never read, nothing stored (check:instagram); fixture profile → confirm → read the bio link → plan, and the login-wall profile → describe instead (browser-checked).

**Evidence:** `src/lib/website/instagram.ts`, `src/app/api/tools/instagram/route.ts`, `src/lib/preview/build.ts#factsFromInstagram`

**Checks:** `check:instagram`, `check:safe-fetch`

**Public claim:** none — not advertised

### Meta API updates and integration health (internal)

*Campaigns* · `meta-updates`

Reads Meta's official Graph and Marketing API changelogs and version pages daily, records when each was last read successfully, files changes as updates classified informational / potentially breaking / confirmed (by a person) to affect MAIRO, maps them to the MAIRO features that use them, and routes fixes through tests and an administrator's approval — never applied automatically. Reads retry Meta-side failures with backoff; writes never retry. When Meta fails one kind of action for everyone, only that action is paused and customers are told what's unavailable.

**Condition:** The changelog pages are read as public HTML; Meta can change their layout, which the freshness check surfaces as a failed or stale read. Outage detection needs real traffic to count; it has been exercised against a stubbed Meta only.

**Routes:** `/aios/meta-intelligence`

**Verification:** Freshness from successful reads only; impact confirmed only by a person; whose problem an error is; reads-only retries; pausing only the failing action in auto-launch, approvals and building; recommendations on unverified purchase data held from raising spend; no token or business data in the admin summary.

**Evidence:** `src/lib/meta-intelligence/impact.ts`, `src/lib/meta-intelligence/health.ts`, `src/lib/meta-intelligence/errors/classify.ts`, `src/lib/meta-intelligence/operations/rules.ts`, `src/lib/meta/client.ts`

**Checks:** `check:meta-reliability`, `check:meta-contract`, `check:meta-intelligence`

**Public claim:** none — not advertised

### Advertise an existing Facebook post

*Campaigns* · `existing-posts`

Lists the Page's own posts with pictures so one can be run as the ad.

**Condition:** Listing posts verified live on 12 October 2026; running one as an ad has not yet been run live.

**Routes:** `/dashboard/create`

**Still needs:** A live run of a post as an ad

**Verification:** A real post run as an ad on a live account, then paused.

**Evidence:** `src/lib/meta/sales-sources.ts`, `src/lib/meta/page-token.ts`

**Checks:** `check:page-token`

**Public claim:** “Use a Facebook post that already did well as your ad.”

### Scheduled starts

*Campaigns* · `scheduled-launch`

A campaign booked to start later starts on schedule.

**Condition:** On the Hobby plan the scheduler runs once a day, so a start can be up to a day late unless the owner opens MAIRO.

**Routes:** `/dashboard/create`

**Still needs:** A more frequent cron (Vercel Pro) for on-time starts

**Verification:** Cron run starts only approved, due campaigns.

**Evidence:** `src/lib/campaigns/schedule.ts`, `src/app/api/cron/launch/route.ts`

**Checks:** `check:schedule`

**Public claim:** none — not advertised

### Ad text

*Creative* · `ad-copy`

Suggests ad text options, each with the angle it leans on, and checks the words the way Meta will (length, banned personal-attribute wording).

**Condition:** Written suggestions need ANTHROPIC_API_KEY; without it MAIRO offers plain templates from the owner's answers and says so.

**Routes:** `/dashboard/create`

**Still needs:** ANTHROPIC_API_KEY

**Verification:** Copy rules match what the server refuses at launch.

**Evidence:** `src/lib/campaigns/ad-copy.ts`, `src/lib/meta/creative-copy.ts`

**Checks:** `check:campaign-wizard`, `check:ads`

**Public claim:** “Ad text written from what you've told MAIRO, checked before Meta sees it.”

### AI pictures

*Creative* · `ai-images`

Makes and edits ad pictures in the Creative Studio, metered by monthly credits, with failed attempts refunded.

**Condition:** Needs OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN on the deployment; /aios/setup shows whether they're set.

**Routes:** `/dashboard/creative-studio`

**Still needs:** OPENAI_API_KEY; BLOB_READ_WRITE_TOKEN

**Verification:** Credits charged once per request and refunded on failure.

**Evidence:** `src/lib/creative-studio/pipeline.ts`, `src/lib/creative-studio/credits.ts`, `src/lib/ai/openai-image.ts`

**Checks:** `check:creative-studio`

**Public claim:** “AI pictures for your ads, within your plan's monthly credits.”

### Your own pictures and videos

*Creative* · `uploads`

Upload pictures and videos into the business's own folder and use them as they are, logo and product untouched — in the campaign builder, and as the picture or video of a suggested ad (stored as uploaded, no model call).

**Condition:** Needs BLOB_READ_WRITE_TOKEN and, for suggested ads, a paid plan (checked on the server). Files are stored at unguessable, unlisted addresses (Meta has to fetch them to run the ad), not behind a sign-in.

**Routes:** `/dashboard/create`, `/dashboard/creatives/suggested`

**Still needs:** BLOB_READ_WRITE_TOKEN

**Verification:** Upload tokens only issued for the signed-in business's own folder, allowed types and size; a suggested ad's own photo is stored exactly as uploaded, approvable, and refused for another business (check:suggested-ads). Upload into live blob storage not run from the build environment.

**Evidence:** `src/app/api/uploads/ad-media/route.ts`, `src/lib/storage/blob.ts`, `src/lib/campaigns/media-rules.ts`, `src/lib/suggested-ads/store.ts`, `src/lib/actions/suggested-ads-actions.ts`

**Checks:** `check:ads`, `check:creative-studio`, `check:suggested-ads`

**Public claim:** “Use your own photos and videos.”

### Brand details and brand check

*Creative* · `brand-profile`

Logo, colours, tone, words you like and claims to avoid are kept in the Business Brain's Brand section, each confirmable. Every ad's words are checked against them while they're written and again at launch: words to avoid stop the ad; offers, prices and claims the owner hasn't confirmed are flagged.

**Condition:** Brand facts live in the Business Brain; a library of approved pictures and logo files isn't built yet.

**Routes:** `/dashboard/settings/business-brain`, `/dashboard/create`, `/dashboard/creatives/suggested`

**Still needs:** Approved asset library

**Verification:** Avoided words block in the builder and at launch; unconfirmed offers and claims flagged; confirmed offers, current promotions and confirmed proof never flagged (check:brand).

**Evidence:** `src/lib/brain/brand-check.ts`, `src/lib/brain/store.ts`, `src/lib/campaigns/campaign-ads-input.ts`, `src/app/dashboard/create/[service]/copy-editor.tsx`

**Checks:** `check:brand`, `check:brain`, `check:suggested-ads`

**Public claim:** none — not advertised

### Meta's own ad previews

*Creative* · `placement-previews`

Shows the ad as Meta renders it in the feed, Stories and Reels before anything is created.

**Condition:** Needs a connected Meta ad account — the preview is drawn by Meta.

**Routes:** `/dashboard/create`, `/dashboard/creatives/suggested`

**Still needs:** Connected Meta ad account

**Verification:** Preview requests create nothing in the ad account.

**Evidence:** `src/lib/meta/previews.ts`, `src/app/dashboard/create/[service]/ad-preview.tsx`, `src/lib/actions/suggested-ads-actions.ts`

**Checks:** `check:ads`

**Public claim:** none — not advertised

### Creative tests

*Creative* · `creative-experiments`

Once two suggested ads are approved, MAIRO proposes a fair test: the same picture or video, budget and audience, with only the words different. The owner approves it, MAIRO makes the campaign draft with both versions as separate ads, and the owner launches it as usual. Each day MAIRO reads Meta's per-ad results and calls a winner only after a week, 20+ results and a gap chance is unlikely to explain; it says so when the ads are about the same, when Meta gave one too little budget to judge, or when four weeks weren't enough. A winner adds a proposal to switch off the other ad, which waits for the owner's approval.

**Condition:** Needs a connected Meta ad account, two approved suggested ads, and the test campaign launched and running.

**Routes:** `/dashboard/creatives/suggested`, `/dashboard/decisions`

**Still needs:** A live test on a real ad account

**Verification:** check:experiments pins the evidence rules and runs the lifecycle on the database with simulated per-ad figures: started only when live, concluded once, the switch-off proposal pending, daily rules kept off the test's ads, isolation between businesses. Not yet run on a real ad account.

**Evidence:** `src/lib/experiments/verdict.ts`, `src/lib/experiments/store.ts`, `src/lib/actions/experiment-actions.ts`, `src/app/dashboard/creatives/suggested/experiment-panel.tsx`, `src/app/api/cron/review/route.ts`

**Checks:** `check:experiments`, `check:suggested-ads`, `check:decisions`

**Public claim:** none — not advertised

### Suggested ads after connecting Meta

*Creative* · `suggested-ads`

Once Meta is connected and the business profile is confirmed, MAIRO suggests three ad directions written only from confirmed facts — one product showcase, one customer and lifestyle, one offer-led where the facts allow (no confirmed offer, no offer-led ad) — each with its concept name, the headline Meta gets, primary text, a visual direction, the button, why MAIRO recommends it, who it's for, where the button sends people and why it's worth a test, with one recommended as the first test and why. Each can be previewed in Instagram feed, Facebook feed and Stories, refined with MAIRO, edited, given the owner's own photo or video, become a real picture after its cost is shown (every version kept), or be turned down with a reason — MAIRO then suggests a different kind and never the same kind again. Approval is bound to the exact words and picture or video version, and continuing opens the campaign builder with that ad. Nothing is published or spent.

**Condition:** Making the picture needs a paid plan, AI credits and the image provider switched on; using your own photo or video needs a paid plan (checked on the server) and storage. Not yet run against a live Meta account and the live image provider together.

**Routes:** `/dashboard/creatives/suggested`

**Still needs:** Connected Meta ad account; Confirmed business profile

**Verification:** Directions from confirmed facts only, one recommended, avoided words never used, no invented figures; revisions kept; approval withdrawn by any change; every record scoped to its business (check:suggested-ads); turning down, the replacement and bringing back (check:creative-readiness). Live picture generation from this page not yet run.

**Evidence:** `src/lib/suggested-ads/directions.ts`, `src/lib/suggested-ads/store.ts`, `src/lib/actions/suggested-ads-actions.ts`, `src/app/dashboard/creatives/suggested/suggested-ads.tsx`

**Checks:** `check:suggested-ads`, `check:creative-readiness`

**Public claim:** “After you connect Meta, MAIRO suggests three ads from what you've confirmed, with one marked as the best first test.”

### Ask MAIRO to rewrite an ad

*Creative* · `creative-rewrite`

"Make the hook stronger", "Make this more luxurious" or any plain-language change: MAIRO proposes new words from confirmed facts only, shown beside the current ones. Numbers the business never gave are dropped and words to avoid stop it before the owner sees it; nothing is saved until the owner keeps it, as a new version marked as MAIRO's rewrite.

**Condition:** Needs ANTHROPIC_API_KEY. Without it the page says rewriting isn't switched on and the words can still be changed by hand. Not yet run against the live model from this page.

**Routes:** `/dashboard/creatives/suggested`

**Still needs:** ANTHROPIC_API_KEY

**Verification:** The checks a proposal must pass (check:creative-readiness); the compare, keep and undo flow in a local browser run with a labelled fixture in place of the model. A live model run is still to do.

**Evidence:** `src/lib/ai/rewrite-words.ts`, `src/lib/creative/rewrite-rules.ts`, `src/lib/actions/suggested-ads-actions.ts`, `src/app/dashboard/creatives/suggested/suggested-ads.tsx`

**Checks:** `check:creative-readiness`

**Public claim:** none — not advertised

### Change a suggested ad's picture

*Creative* · `picture-edits`

A plain-language change to a suggested ad's picture — "Use our brand colours", "A brighter, cleaner background" — with the cost shown first. Credits are spent only if the new version is made; the version before is shown beside it and can be made current again without AI or credits. "Brand colours" stops before charging when the Business Brain has none.

**Condition:** Needs a paid plan, AI credits and the image provider and storage switched on. Going back to an earlier version works without them. Not yet run against the live image provider.

**Routes:** `/dashboard/creatives/suggested`

**Still needs:** OPENAI_API_KEY; Blob storage

**Verification:** Before/after and going back to an earlier version without credits, in a local browser run; the paid edit uses the same reserve-then-confirm credit flow as Creative Studio (check:creative-studio). A live image edit is still to do.

**Evidence:** `src/app/dashboard/creatives/suggested/picture-editor.tsx`, `src/lib/actions/suggested-ads-actions.ts`, `src/lib/creative-studio/pipeline.ts`

**Checks:** `check:creative-readiness`, `check:creative-studio`

**Public claim:** none — not advertised

### Editing an uploaded video

*Creative* · `video-editing`

On an owner's own video: start and end, captions at times, a crop to 9:16, 4:5 or square, one line of text over the whole clip, and the business's logo in a corner, with timestamped suggestions from the video's length and shape. Each save is a new version; the uploaded file is never changed. A saved version can be written into a new MP4 — trimmed, cropped, captions and text burned in, logo laid over — shown beside the original and downloadable once the file exists; that file is what's approved and goes into the campaign draft. Captions from what's said in the video need a transcription service MAIRO doesn't have, and making a video from scratch with AI isn't available — the editor says both.

**Condition:** Writing the file needs ffmpeg on the server (the ffmpeg-static package downloads it during install) and video storage; the logo is read only from the business's own uploads, so it needs storage too. Verified here with a real render; not yet run on the hosting.

**Routes:** `/dashboard/creatives/suggested`

**Still needs:** ffmpeg on the server (ffmpeg-static install script); BLOB_READ_WRITE_TOKEN

**Verification:** Real render of a sample: trimmed length, cropped size, caption burned in (compared with the same render without it), text along the bottom and logo in its corner (compared region by region), poster made, original untouched; a logo from anywhere but the business's own uploads refused; one file however often pressed; failure recorded and retried; approval and campaign draft use the rendered file (check:video-render). Text overlay, render, download and approval browser-checked with local storage.

**Evidence:** `src/lib/suggested-ads/video.ts`, `src/lib/suggested-ads/render.ts`, `src/lib/suggested-ads/render-run.ts`, `src/app/dashboard/creatives/suggested/video-editor.tsx`

**Checks:** `check:suggested-ads`, `check:video-render`

**Public claim:** none — not advertised

### Meta pixel: choose, install, verify

*Tracking* · `pixel`

Lists the pixels in the connected ad account with who owns each and recommends the one worth reusing; the owner picks one (or types an ID Meta then confirms) or asks MAIRO to create one — once, safely retried, reported only with an ID Meta confirmed. Install steps by website platform; checks the website for the pixel and Meta's event counts for the event the campaign needs, keeping not detected, not seen and missing permission apart from failures; consent setting applied to server-side orders; a readiness summary for the campaign.

**Condition:** Needs a connected Meta account with ads_management. Installing is the owner's step (or Tag Manager's). Meta's pixel stats endpoint and the ownership fields have been exercised against a stubbed Meta only, not yet a live account.

**Routes:** `/dashboard/tracking`

**Still needs:** Connected Meta ad account; A live run against a real ad account

**Verification:** Stubbed-Meta suite: choice and ownership, explicit selection, idempotent creation (double click, lost reply, no id), stage transitions, check results, consent on orders, isolation.

**Evidence:** `src/lib/tracking/setup.ts`, `src/lib/tracking/state.ts`, `src/lib/tracking/meta-pixel.ts`, `src/app/dashboard/tracking/tracking-setup.tsx`, `src/lib/tracking/orders.ts`

**Checks:** `check:tracking`, `check:tracking-setup`

**Public claim:** “Choose your existing Meta pixel or create one in your own account.”

### Meta Pixel in setup, and the purchase-launch rule

*Tracking* · `pixel-setup`

After Meta is connected, setup asks which Pixel MAIRO should use — with why it asks, the Pixels shared with the ad account (name, ID, the websites Meta saw them on), a website to confirm, creating one where the connection allows it or the Events Manager steps where it doesn't, and "I don't want to connect a Pixel". The choice is saved per business with its ad account, website and time, and shown in Settings and the campaign review. A campaign that depends on website purchases (an online shop's sales campaign to its website) doesn't launch until the Pixel is receiving events — chosen isn't enough; lead, call and form campaigns never need one.

**Condition:** Needs a connected Meta account with ads_management. Creating, listing, the access re-check and the by-website stats have been exercised against a stubbed Meta only, not yet a live account.

**Routes:** `/dashboard/pixel`, `/dashboard/launch`, `/dashboard/settings`

**Still needs:** Connected Meta ad account; A live run against a real ad account

**Verification:** Stubbed-Meta suite: need by business type, objective and destination; chosen vs receiving; the launch gate for each state; choosing only Pixels shared with the ad account; create with and without permission and on Meta refusing; decline saved for shops and lead businesses; revoked and lost access; auto-launch holding a purchase campaign and launching a lead one; onboarding step; isolation.

**Evidence:** `src/lib/tracking/pixel-rules.ts`, `src/lib/tracking/pixel-setup.ts`, `src/lib/actions/pixel-actions.ts`, `src/app/dashboard/pixel/pixel-setup.tsx`, `src/lib/campaigns/auto-launch.ts`

**Checks:** `check:pixel-setup`

**Public claim:** none — not advertised

### Meta pixel through Google Tag Manager

*Tracking* · `pixel-gtm`

A ready-made Tag Manager container to import; the one-click direct connection is also built.

**Condition:** The direct connection depends on Google's approval of MAIRO's Tag Manager access; importing the container works for everyone.

**Routes:** `/dashboard/tracking`

**Still needs:** Google verification of the Tag Manager scope

**Verification:** Container imports cleanly; direct publish only with the owner's Google consent.

**Evidence:** `src/lib/tracking/gtm.ts`, `src/lib/tracking/gtm-api`

**Checks:** `check:gtm`, `check:tracking`

**Public claim:** “Set up your Meta pixel with a ready-made Google Tag Manager container.”

### Manual, AI Assist, Full Autopilot

*Control* · `automation-levels`

Manual: MAIRO only recommends. AI Assist and Full Autopilot make a listed set of changes inside the owner's limits, never raising the total budget or launching.

**Condition:** The rules are tested against constructed figures; the first real week of decisions should be watched before customers switch on automation (NEXT.md item 9).

**Routes:** `/dashboard/settings`

**Still needs:** A watched week of real decisions

**Verification:** No level can raise total budget or launch.

**Evidence:** `src/lib/automation/levels.ts`, `src/lib/decisions/guardrails.ts`

**Checks:** `check:automation`, `check:decisions`

**Public claim:** “Choose how much MAIRO may change on its own — or nothing at all.”

### Sign in with Google

*Account* · `google-sign-in`

Shown only when the Google OAuth client is configured.

**Condition:** Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the deployment.

**Routes:** `/sign-in`, `/sign-up`

**Still needs:** GOOGLE_CLIENT_ID; GOOGLE_CLIENT_SECRET

**Verification:** Button hidden when not configured.

**Evidence:** `src/lib/google-sign-in.ts`, `src/components/google-button.tsx`

**Checks:** `check:google`

**Public claim:** none — not advertised

### Password reset by email

*Account* · `password-reset`

A one-use link, good for an hour, emailed to the account's own address. Without an email provider the page says to email support instead.

**Condition:** Needs RESEND_API_KEY and EMAIL_FROM on the deployment.

**Routes:** `/forgot-password`, `/reset-password`

**Still needs:** RESEND_API_KEY; EMAIL_FROM

**Verification:** Send one reset to a real inbox once the provider is configured.

**Evidence:** `src/lib/password-reset.ts`, `src/lib/email/send.ts`

**Checks:** `check:password-reset`

**Public claim:** none — not advertised

### Text alerts

*Account* · `sms-alerts`

Texts the owner about things that need them, if they turn it on.

**Condition:** Needs Twilio settings on the deployment.

**Routes:** `/dashboard/notifications`

**Still needs:** Twilio settings

**Verification:** Nothing sent unless switched on.

**Evidence:** `src/lib/sms/send.ts`

**Checks:** `check:notifications`

**Public claim:** none — not advertised

### Shopify plan and fee comparison

*Free tools* · `tool:shopify-fees`

Compare Shopify plans on subscription and card fees for your sales, with the rates' source and date shown and editable.

**Condition:** Starting rates are United States figures from public summaries dated 12 October 2026, not yet confirmed against shopify.com/pricing; the page says so and every rate is editable.

**Routes:** `/tools/shopify-fees`

**Still needs:** Confirm the default rates against shopify.com/pricing

**Verification:** Rates carry a source URL and checked date; editable for country and plan.

**Evidence:** `src/components/tools/shopify-fees.tsx`, `src/lib/calc/shopify-fees.ts`

**Checks:** `check:calculators`

**Public claim:** “Compare Shopify plans on subscription and card fees for your sales, with the rates' source and date shown and editable.”

## Demo only (3)

### Homepage product clips, film and demos

*Public site* · `product-preview`

The homepage shows MAIRO working at every stage with short silent videos of the product: a 74-second film ("Meet your AI advertising team.") right under the hero, then a five-step walkthrough whose player follows the step being read — the business understood, the free plan's strategy and budget, the AI Creative Studio (angles, an edited headline, the finished picture paid in credits, Facebook and Instagram feed previews, approval), the campaign builder (subscribe, connect Meta, goal, audience, budget, the approved creative, the launch review and "Waiting for Meta's review"), the AI team's morning review, the dashboard page by page, a recommendation with its evidence, and results (a shop's orders and a service business's booked jobs). Every clip is drawn from the signed-in app's own components — the free plan's progress and report, the campaign builder's steps, the console panels, the Approval Center's decision card, the AI team's records — for one clearly labelled fictional shop with sample figures, rendered frame by frame to MP4 (16:9 and 9:16), WebP posters and WebVTT captions by video/render.mjs. The player loads a clip only near the screen, plays it muted only while it's in view, pauses it when it isn't or the tab is hidden, never starts it with reduced motion, shows captions (on by default) and a transcript, and draws the clip live when no file has been rendered. The hero's animated plan demo, the sample-creative gallery (nine kinds of business, each a 3D product render made for the page for a fictional brand, each labelled a sample) and the before/after comparison sit around them. Recordings of a real person using MAIRO, real photographs and a voice-over are not part of it. And, on /landing/classic, the older 24-second story and interactive views.

**Routes:** `/`, `/landing/classic`

**Still needs:** Screen recordings of a real person using MAIRO in a demo account, to sit beside the component renders; Licensed voice-over and music for the film

**Verification:** check:clips pins every clip rendered in both compositions with its MP4, poster and captions present, the film at 60–90 seconds and each demonstration at 12–30, captions in order and equal to their WebVTT, none claiming another ad network, AI video, a guarantee or a forecast, and the sample-data label drawn on every frame; the homepage browser-checked at phone and desktop widths, with reduced motion.

**Evidence:** `src/components/clips/stage.tsx`, `src/components/clips/demo-video.tsx`, `src/components/clips/film.tsx`, `src/components/clips/creative.tsx`, `src/lib/demo/clip.ts`, `src/lib/demo/shop-sample.ts`, `src/lib/demo/media.ts`, `video/render.mjs`, `src/components/home/hero-plan-demo.tsx`, `src/components/home/sample-creatives.tsx`, `src/components/home/walkthrough.tsx`, `src/components/home/product-tour.tsx`, `src/components/landing/console-home.tsx`, `src/components/hero-story/hero-story.tsx`

**Checks:** `check:capabilities`, `check:preview`, `check:clips`

**Public claim:** none — not advertised

### The MAIRO demo (73-second walkthrough) and videos

*Public site* · `walkthrough`

A 73-second interactive demo of the owner journey on a sample business, in seven chapters — intro and request, analysis, the free plan, creative concepts (one chosen and edited), review and approval, results with a recommendation, and the end screen "Your AI Advertising Team Is Ready." with Build My Free Ad Plan — drawn with MAIRO's own components driven by the clock, with a cursor that finds its targets in the rendered screens and a camera that follows, in 16:9 and 9:16; captions on by default carrying the written script, play, pause, replay, a position slider, keyboard control and a still version for reduced motion; plus silent MP4 renders of it and of the landing story, with posters and WebVTT captions, made by video/render.mjs from the same components. The script and storyboard are in docs/WALKTHROUGH-SCRIPT.md. No voice-over or music yet.

**Routes:** `/landing/classic`

**Still needs:** A licensed British female voice recording of the script; Licensed background music

**Verification:** Seven chapters in the brief's timing and 73 seconds, the captions equal to the script with no forecast or unavailable-feature wording, and every cursor and camera key inside its scene pinned by check:preview, which also checks every listed video file, poster and captions file exists as rendered; every cursor and camera target found in the rendered screens in both layouts, the player's chapters, play, the 16:9 and 9:16 stages and the video files browser-checked; both MP4s decoded end to end.

**Evidence:** `src/components/walkthrough/walkthrough-player.tsx`, `src/components/walkthrough/walkthrough-stage.tsx`, `src/lib/demo/walkthrough.ts`, `src/lib/demo/media.ts`, `video/render.mjs`, `docs/WALKTHROUGH-SCRIPT.md`

**Checks:** `check:preview`

**Public claim:** none — not advertised

### Pages for online stores, local services and appointment businesses

*Public site* · `use-case-pages`

One page per kind of business the free plan is built around, at /solutions/online-stores, /solutions/local-services and /solutions/appointments: what MAIRO sets up (read from the plan the preview builder really makes for that kind, on a fictional example business, with the plan itself drawn by its own component and labelled as an example), how results are counted (the dashboard's own result names), what's needed, and what MAIRO doesn't do — no catalogue ads, no booking-system connection, Meta only.

**Routes:** `/solutions/[slug]`

**Verification:** check:solutions pins each page's example to the preview builder's plan for that kind, the result names to the dashboard's, the limits to the code (no catalogue in the campaign builders, the booking tools to the website reader, Meta only), the help links, the example label and the links from the homepage, footer and sitemap; the pages browser-checked at phone and desktop widths.

**Evidence:** `src/lib/solutions/use-cases.ts`, `src/app/solutions/[slug]/page.tsx`, `src/components/solutions/example-plan.tsx`

**Checks:** `check:solutions`

**Public claim:** none — not advertised

## Unavailable (8)

### TikTok ads

*Campaigns* · `tiktok`

Retired. MAIRO manages Meta advertising only.

**Verification:** Not offered anywhere in the product.

**Evidence:** `NEXT.md#TikTok (retired)`

**Public claim:** none — not advertised

### Google Ads

*Campaigns* · `google-ads`

Not built.

**Verification:** Not offered anywhere in the product.

**Evidence:** `src/lib/pricing/compare.ts#other-ads`

**Checks:** `check:pricing`

**Public claim:** none — not advertised

### AI-generated video

*Creative* · `ai-video`

No video generation provider is configured. Uploaded videos work.

**Still needs:** A video generation provider

**Verification:** Never advertised until a provider produces a real file.

**Evidence:** `src/lib/creative-studio/format-info.ts`

**Public claim:** none — not advertised

### Social Manager (discontinued)

*Social* · `social-manager`

Discontinued in October 2026: MAIRO doesn't post to a business's own Instagram or Facebook profile on any plan, the earlier $499.99 Scale plan included. Nobody has access, the daily job no longer publishes or plans posts, the Meta connect dialog never asks for posting permissions (they can't be requested even through META_SCOPES), and nothing in the app links to it. Saved posts are kept until deleted. Instagram and Facebook *ads* are unaffected.

**Condition:** Not offered. Meta never approved the posting permissions, so it never published for a customer.

**Routes:** `/dashboard/social`

**Verification:** Nobody has access on any plan; nothing publishes; no posting permission is requested.

**Evidence:** `src/lib/social/access.ts`, `src/app/api/cron/launch/route.ts`, `src/lib/meta/oauth.ts`

**Checks:** `check:social-manager`, `check:social-scheduler`, `check:ads`

**Public claim:** none — not advertised

### Studio and Agency plans

*Billing* · `freelancer-plans`

No longer sold (October 2026): the freelancer sign-up redirects to /pricing and checkout refuses these tiers. Workspaces already on Studio or Agency keep their plan and clients. Several businesses under one plan is MAIRO Scale's (up to 3).

**Routes:** `/clients/billing`

**Still needs:** Stripe prices

**Verification:** Shown as no longer offered.

**Evidence:** `src/lib/plans.ts#FREELANCER_PLANS`

**Checks:** `check:entitlements`

**Public claim:** none — not advertised

### Multi-step approvals

*Account* · `approval-chains`

Not built. A launch or recommendation is approved by one person whose role allows it; there's no chain of approvers (for example, an editor's ad going to a manager, then an owner).

**Still needs:** An approval chain model and its review screens

**Verification:** Not offered anywhere.

**Evidence:** `src/lib/members/roles.ts`

**Public claim:** none — not advertised

### Several brands under one account, with their own budgets and reporting across them

*Account* · `multi-brand`

Not built. Each business has its own team, brand rules, budget and reports, and someone on several teams switches between them; MAIRO doesn't group businesses into one organization, share a budget across them or report on them together.

**Still needs:** A parent organization for brands, cross-brand budgets and combined reports with per-brand labels

**Verification:** Not offered anywhere.

**Evidence:** `src/lib/members/workspace.ts`

**Public claim:** none — not advertised

### Customer case studies

*Public site* · `case-studies`

The table for permission-based case studies exists, but there's no real customer evidence yet, so none are shown.

**Still needs:** A customer's written permission and measured results

**Verification:** Only published with recorded consent, dates, measurement period and limitations.

**Evidence:** `prisma/schema.prisma#CaseStudy`

**Public claim:** none — not advertised
