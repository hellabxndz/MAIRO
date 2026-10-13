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
| Plan | Free advertising plan | Working | `/onboarding`, `/plan` | — | `check:strategy-plan`, `check:plan-guide`, `check:onboarding`, `check:onboarding-db` |
| Plan | Change and approve the plan | Working | `/plan` | — | `check:strategy-plan`, `check:onboarding-db` |
| Plan | Reading the business's website | Partially working | `/onboarding`, `/dashboard/settings/business-brain` | ANTHROPIC_API_KEY | `check:business`, `check:safe-fetch` |
| Plan | Business Brain | Working | `/dashboard/settings/business-brain` | — | `check:brain` |
| Plan | Setup saved as you go | Working | `/onboarding`, `/sign-up` | — | `check:onboarding`, `check:onboarding-db` |
| Campaigns | Build Facebook and Instagram campaigns | Working | `/dashboard/create`, `/dashboard/launch`, `/dashboard/campaigns` | — | `check:meta-contract`, `check:ads`, `check:campaign-wizard` |
| Campaigns | Launch only after the owner approves | Working | `/dashboard/launch`, `/plan/activate` | — | `check:payment-gate`, `check:decision-claim`, `check:readiness` |
| Campaigns | Pause from MAIRO | Working | `/dashboard/campaigns` | — | `check:trust-db`, `check:payment-gate` |
| Campaigns | Lead forms | Working | `/dashboard/leads`, `/f/[slug]` | — | `check:leads`, `check:page-token` |
| Campaigns | Advertise an existing Facebook post | Partially working | `/dashboard/create` | A live run of a post as an ad | `check:page-token` |
| Campaigns | Scheduled starts | Partially working | `/dashboard/create` | A more frequent cron (Vercel Pro) for on-time starts | `check:schedule` |
| Campaigns | TikTok ads | Unavailable | — | — | — |
| Campaigns | Google Ads | Unavailable | — | — | `check:pricing` |
| Creative | Ad text | Partially working | `/dashboard/create` | ANTHROPIC_API_KEY | `check:campaign-wizard`, `check:ads` |
| Creative | AI pictures | Partially working | `/dashboard/creative-studio` | OPENAI_API_KEY; BLOB_READ_WRITE_TOKEN | `check:creative-studio` |
| Creative | Your own pictures and videos | Partially working | `/dashboard/create` | BLOB_READ_WRITE_TOKEN | `check:ads`, `check:creative-studio` |
| Creative | Brand details | Partially working | `/dashboard/settings/business-brain` | Brand profile screen and pre-save brand check | `check:brain` |
| Creative | Meta's own ad previews | Partially working | `/dashboard/create` | Connected Meta ad account | `check:ads` |
| Creative | Creative tests | Unavailable | — | Experiment workflow and evidence thresholds | — |
| Creative | Suggested ads after connecting Meta | Unavailable | — | Creative-first flow | — |
| Creative | Editing an uploaded video | Unavailable | — | A video rendering worker | — |
| Creative | AI-generated video | Unavailable | — | A video generation provider | — |
| Tracking | Meta pixel: choose existing or create | Partially working | `/dashboard/tracking` | Connected Meta ad account | `check:tracking` |
| Tracking | Meta pixel through Google Tag Manager | Partially working | `/dashboard/tracking` | Google verification of the Tag Manager scope | `check:gtm`, `check:tracking` |
| Tracking | Shopify orders | Working | `/dashboard/tracking` | — | `check:tracking` |
| Tracking | Lead outcomes | Working | `/dashboard/leads` | — | `check:lead-outcomes`, `check:lead-report` |
| Tracking | Lead import and change history | Unavailable | — | Import and history workflow | — |
| Results | Results that separate reported from confirmed | Working | `/dashboard`, `/dashboard/analytics` | — | `check:results`, `check:results-db` |
| Results | Performance Coach | Working | `/dashboard/coach` | — | `check:coach`, `check:coach-db` |
| Results | Daily Brief, weekly report, monthly results | Working | `/dashboard/reports`, `/dashboard/reports/monthly` | — | `check:weekly-report`, `check:reports`, `check:team` |
| Results | Recommendations with approval | Working | `/dashboard/decisions`, `/dashboard/coach` | — | `check:decisions`, `check:decision-claim`, `check:command-center` |
| Control | Manual, AI Assist, Full Autopilot | Partially working | `/dashboard/settings` | A watched week of real decisions | `check:automation`, `check:decisions` |
| Control | Spend Protection | Working | `/dashboard/settings` | — | `check:budget` |
| Social | Social Manager (Scale) | Partially working | `/dashboard/social` | Meta App Review: posting permissions | `check:social-manager`, `check:social-scheduler` |
| Billing | Subscriptions through Stripe | Working | `/plan/activate`, `/dashboard/billing` | — | `check:payment-gate`, `check:entitlements`, `check:pricing`, `check:trust-db` |
| Billing | Studio and Agency plans | Unavailable | `/clients/billing` | Stripe prices | `check:entitlements` |
| Account | Sign in with Google | Partially working | `/sign-in`, `/sign-up` | GOOGLE_CLIENT_ID; GOOGLE_CLIENT_SECRET | `check:google` |
| Account | Text alerts | Partially working | `/dashboard/notifications` | Twilio settings | `check:notifications` |
| Account | Self-serve account deletion | Working | `/dashboard/account`, `/data-deletion` | — | `check:trust-db` |
| Public site | Product preview and Coach demo | Demo only | `/` | — | `check:capabilities` |
| Public site | Product walkthrough video | Unavailable | — | Walkthrough build and render | — |
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
| Free tools | Competitor website comparison | Unavailable | — | — | — |
| Free tools | Landing page audit | Unavailable | — | — | — |
| Free tools | Shopify app detector | Unavailable | — | — | — |
| Free tools | Shopify theme detector | Unavailable | — | — | — |
| Free tools | Tracking readiness checker | Unavailable | — | — | — |
| Free tools | UTM link builder | Working | `/tools/utm-builder` | — | `check:calculators` |

## Working (31)

### Free advertising plan

*Plan* · `free-plan`

From a short setup, MAIRO writes a plan: goal, campaign type, audience and why, budget and why, three creative directions, landing-page issues, tracking needs and a testing schedule — with what it had to assume listed apart from what the owner said.

**Routes:** `/onboarding`, `/plan`

**Verification:** Browser journey (desktop and phone): sign-up → setup → plan with every section → approve; the free plan can't reach a launch button.

**Evidence:** `src/lib/strategy/plan-logic.ts`, `src/lib/strategy/plan-guide.ts`, `src/lib/strategy/store.ts`, `src/app/plan/page.tsx`, `src/components/strategy/plan-guide.tsx`

**Checks:** `check:strategy-plan`, `check:plan-guide`, `check:onboarding`, `check:onboarding-db`

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

### Setup saved as you go

*Plan* · `onboarding-drafts`

Every setup screen is saved; closing the tab and coming back opens where the owner stopped. A business type picked before sign-up is carried in.

**Routes:** `/onboarding`, `/sign-up`

**Verification:** Reload resumes on the same screen with answers kept, including "not sure" (browser-checked).

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

Pauses a campaign on Meta and shows it as paused only once Meta confirms. Never blocked by billing.

**Routes:** `/dashboard/campaigns`

**Verification:** Paused state shown only after Meta's confirmation.

**Verified live:** 10 October 2026: paused from MAIRO, confirmed Off in Ads Manager.

**Evidence:** `src/lib/ad-platforms/registry.ts`, `src/lib/billing/running-campaigns.ts`

**Checks:** `check:trust-db`, `check:payment-gate`

**Public claim:** “Pause any campaign from MAIRO, with or without a subscription.”

### Lead forms

*Campaigns* · `lead-forms`

A form MAIRO hosts for the business, and Meta instant forms created on the business's Page; answers land in one Leads list.

**Routes:** `/dashboard/leads`, `/f/[slug]`

**Verification:** Instant form created and leads downloaded with the Page's own token.

**Evidence:** `src/app/f`, `src/lib/leads/forms.ts`, `src/lib/leads/meta-form.ts`, `src/lib/meta/page-token.ts`

**Checks:** `check:leads`, `check:page-token`

**Public claim:** “Collect enquiries with a form MAIRO writes for you.”

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

Starter $149.99 (7-day free trial, card at checkout), Growth $239.99, Scale $499.99 a month. Ad spend is paid to Meta, separately.

**Routes:** `/plan/activate`, `/dashboard/billing`

**Verification:** Live checkout returned through the webhook; entitlements follow the subscription.

**Verified live:** A live Starter trial checkout came back through the webhook (NEXT.md item 8); billing enforced since 10 October 2026.

**Evidence:** `src/lib/plans.ts`, `src/lib/actions/billing-actions.ts`, `src/app/api/stripe/webhook/route.ts`

**Checks:** `check:payment-gate`, `check:entitlements`, `check:pricing`, `check:trust-db`

**Public claim:** “Plans from $149.99 a month; Starter starts with a 7-day free trial.”

### Self-serve account deletion

*Account* · `account-deletion`

Deletes the account and its data; cancels the subscription first and names campaigns still running.

**Routes:** `/dashboard/account`, `/data-deletion`

**Verification:** Subscription cancelled before data removed.

**Evidence:** `src/lib/account/close.ts`, `src/app/data-deletion/page.tsx`

**Checks:** `check:trust-db`

**Public claim:** “Delete your account and data yourself, any time.”

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

### UTM link builder

*Free tools* · `tool:utm-builder`

Build tagged links for your ads so your analytics can tell which ad sent each visitor — with Meta's dynamic values when you want them.

**Routes:** `/tools/utm-builder`

**Verification:** Valid URL out; existing query kept; values encoded.

**Evidence:** `src/components/tools/utm-builder.tsx`, `src/lib/calc/utm.ts`

**Checks:** `check:calculators`

**Public claim:** “Build tagged links for your ads so your analytics can tell which ad sent each visitor — with Meta's dynamic values when you want them.”

## Partially working (15)

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

Upload pictures and videos into the business's own folder and use them as they are, logo and product untouched.

**Condition:** Needs BLOB_READ_WRITE_TOKEN. Files are stored at unguessable, unlisted addresses (Meta has to fetch them to run the ad), not behind a sign-in.

**Routes:** `/dashboard/create`

**Still needs:** BLOB_READ_WRITE_TOKEN

**Verification:** Upload tokens only issued for the signed-in business's own folder, allowed types and size.

**Evidence:** `src/app/api/uploads/ad-media/route.ts`, `src/lib/storage/blob.ts`, `src/lib/campaigns/media-rules.ts`

**Checks:** `check:ads`, `check:creative-studio`

**Public claim:** “Use your own photos and videos.”

### Brand details

*Creative* · `brand-profile`

Logo, colours, tone and claims to avoid are kept in the Business Brain and used by the writers.

**Condition:** Kept as Business Brain facts; a dedicated brand profile with approved pictures and a pre-save check is not built yet.

**Routes:** `/dashboard/settings/business-brain`

**Still needs:** Brand profile screen and pre-save brand check

**Verification:** Writers receive the owner's avoid-claims list.

**Evidence:** `src/lib/business/brain.ts`, `src/lib/brain/store.ts`

**Checks:** `check:brain`

**Public claim:** none — not advertised

### Meta's own ad previews

*Creative* · `placement-previews`

Shows the ad as Meta renders it in the feed, Stories and Reels before anything is created.

**Condition:** Needs a connected Meta ad account — the preview is drawn by Meta.

**Routes:** `/dashboard/create`

**Still needs:** Connected Meta ad account

**Verification:** Preview requests create nothing in the ad account.

**Evidence:** `src/lib/meta/previews.ts`, `src/app/dashboard/create/[service]/ad-preview.tsx`

**Checks:** `check:ads`

**Public claim:** none — not advertised

### Meta pixel: choose existing or create

*Tracking* · `pixel`

Lists the pixels the connected ad account can use, adopts one or creates one in the business's own account, and reads its status back from Meta (last event seen) rather than assuming.

**Condition:** Needs a connected Meta account with ads_management; a pixel created by MAIRO still has to be installed on the website by the owner or through Tag Manager.

**Routes:** `/dashboard/tracking`

**Still needs:** Connected Meta ad account

**Verification:** Status from Meta's last-fired time, never from MAIRO's own record.

**Evidence:** `src/lib/tracking/pixels.ts`, `src/lib/tracking/meta-pixel.ts`, `src/app/dashboard/tracking/pixel-card.tsx`

**Checks:** `check:tracking`

**Public claim:** “Choose your existing Meta pixel or create one in your own account.”

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

### Social Manager (Scale)

*Social* · `social-manager`

Plans and writes organic Instagram and Facebook posts; publishing only what the owner approves.

**Condition:** Publishing waits for Meta's approval of MAIRO's posting permissions (round 2 of App Review). Scale plan only.

**Routes:** `/dashboard/social`

**Still needs:** Meta App Review: posting permissions

**Verification:** Scale-only; nothing published without approval.

**Evidence:** `src/lib/social`, `src/lib/social/publishing-status.ts`

**Checks:** `check:social-manager`, `check:social-scheduler`

**Public claim:** “On Scale: social posts planned and written for you; publishing once Meta approves MAIRO's posting access.”

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

## Demo only (1)

### Product preview and Coach demo

*Public site* · `product-preview`

Interactive views of the dashboard, recommendations, Coach and Daily Brief on an invented example business, each labelled as an illustrative example.

**Routes:** `/`

**Verification:** Every view carries the example label; no figure presented as a customer's result.

**Evidence:** `src/components/landing/product-preview.tsx`, `src/components/landing/coach-demo.tsx`, `src/lib/coach/example.ts`

**Checks:** `check:capabilities`

**Public claim:** none — not advertised

## Unavailable (15)

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

### Creative tests

*Creative* · `creative-experiments`

Records of a test's hypothesis, variable, exact versions and period. Only the database table exists so far.

**Still needs:** Experiment workflow and evidence thresholds

**Verification:** No winner named on thin evidence; results tied to exact published versions.

**Evidence:** `prisma/schema.prisma#CreativeExperiment`

**Public claim:** none — not advertised

### Suggested ads after connecting Meta

*Creative* · `suggested-ads`

Three personalised creative directions with a recommended first test, then creating the chosen one. Not built yet.

**Still needs:** Creative-first flow

**Verification:** Directions grounded in confirmed facts; nothing paid or launched on connect.

**Evidence:** `prisma/schema.prisma#AdAngle`

**Public claim:** none — not advertised

### Editing an uploaded video

*Creative* · `video-editing`

Trim, reorder, captions and aspect ratios on an owner's video, with the original kept. Not built.

**Still needs:** A video rendering worker

**Verification:** Original never overwritten; only operations the renderer performs are offered.

**Evidence:** `src/lib/meta/videos.ts`

**Public claim:** none — not advertised

### AI-generated video

*Creative* · `ai-video`

No video generation provider is configured. Uploaded videos work.

**Still needs:** A video generation provider

**Verification:** Never advertised until a provider produces a real file.

**Evidence:** `src/lib/creative-studio/format-info.ts`

**Public claim:** none — not advertised

### Lead import and change history

*Tracking* · `lead-import`

CSV import, manual entry, duplicate detection and a history of every change. The tables exist; the workflow isn't built.

**Still needs:** Import and history workflow

**Verification:** Validated rows, duplicates merged by contact, every change recorded.

**Evidence:** `prisma/schema.prisma#LeadEvent`

**Public claim:** none — not advertised

### Studio and Agency plans

*Billing* · `freelancer-plans`

Built in the product, but no Stripe prices exist, so they show as not available yet.

**Routes:** `/clients/billing`

**Still needs:** Stripe prices

**Verification:** Shown as not available.

**Evidence:** `src/lib/plans.ts#FREELANCER_PLANS`

**Checks:** `check:entitlements`

**Public claim:** none — not advertised

### Product walkthrough video

*Public site* · `walkthrough`

An interactive walkthrough and a 60-second captioned video of the owner journey on a fictional business, labelled "Product demo — sample data". Not built yet.

**Still needs:** Walkthrough build and render

**Verification:** Captions, chapters, keyboard and reduced motion checked; labelled as sample data.

**Evidence:** `src/app/page.tsx`

**Public claim:** none — not advertised

### Customer case studies

*Public site* · `case-studies`

The table for permission-based case studies exists, but there's no real customer evidence yet, so none are shown.

**Still needs:** A customer's written permission and measured results

**Verification:** Only published with recorded consent, dates, measurement period and limitations.

**Evidence:** `prisma/schema.prisma#CaseStudy`

**Public claim:** none — not advertised

### Competitor website comparison

*Free tools* · `tool:competitor-website`

Compare public pages side by side: offer, positioning, calls to action, prices shown and brand presentation.

**Verification:** Only what's on the public pages, with the page it came from; no traffic or revenue invented.

**Evidence:** `src/lib/tools/registry.ts`

**Public claim:** none — not advertised

### Landing page audit

*Free tools* · `tool:landing-page-audit`

What a visitor from an ad would find on your page: the three changes that matter most, each with the evidence, then the full list.

**Verification:** SSRF-safe fetch; every finding cites the page; unmeasured things say "Not checked".

**Evidence:** `src/lib/tools/registry.ts`

**Public claim:** none — not advertised

### Shopify app detector

*Free tools* · `tool:shopify-app-detector`

Which apps a Shopify store shows publicly, with the evidence for each and what a public scan can't see.

**Verification:** Evidence per detection; "not detected" never presented as "not installed".

**Evidence:** `src/lib/tools/registry.ts`

**Public claim:** none — not advertised

### Shopify theme detector

*Free tools* · `tool:shopify-theme-detector`

The theme a Shopify store uses, when it's publicly visible, with the evidence.

**Verification:** Evidence shown; unknown when the theme isn't visible.

**Evidence:** `src/lib/tools/registry.ts`

**Public claim:** none — not advertised

### Tracking readiness checker

*Free tools* · `tool:tracking-readiness`

Checks a page for the Meta pixel, Tag Manager and a consent banner, and says what that does and doesn't prove.

**Verification:** A detected script is never reported as working events.

**Evidence:** `src/lib/tools/registry.ts`

**Public claim:** none — not advertised
