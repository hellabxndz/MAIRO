# MAIRO — verification report

14 October 2026. Each requirement is marked **Complete**, **Partial**,
**Missing** or **Blocked**, with the route, what production is running, the
evidence, and the work that's left.

**This project is not complete.** No requirement below has been seen working
on the live site. There are two reasons:

1. **The live site can't be opened from here.** This environment's network
   policy refuses https://mairo-three.vercel.app/ (the connection is refused
   by the outbound proxy; it was retried today). The "Production" column is
   therefore worked out from the source of the deployed commit, not observed
   in a browser.
2. **The latest work isn't deployed.** GitHub's deployment record shows
   *Production – mairo* at **238bd1a** (13 October, 20:51 UTC, success). The
   local branch is 17 commits ahead, including the work in this report.
   Deploying it needs the owner's "push". Vercel's `vercel-build` would then
   apply three pending database migrations: `20261116120000`,
   `20261117120000` and `20261118120000`.

> **Update, 14 October 2026, 17:51 UTC.** The owner said "push". The 17
> commits went to GitHub (238bd1a → 69b169e). Vercel's Production
> deployment of `mairo` succeeded: GitHub deployment 7072972030,
> https://mairo-tdu6aq08c-mairo1.vercel.app. `vercel-build` applies the
> pending migrations as part of that build. The "Production (238bd1a)"
> columns below describe the site before this push. The live site still
> can't be opened from here (the proxy refused it again after the deploy),
> so nothing below is "verified in production".

## How to read the status

| Status | Meaning here |
|---|---|
| **Complete** | Built, covered by its check suites, and walked through in a browser locally (the free plan on the production build as well), against simulated Meta. "Complete" never means "seen live". |
| **Partial** | Works, with a named gap: a provider key, an approval, a live run not done yet, or part of the ask not built. |
| **Missing** | Not built. |
| **Blocked** | Built or ready, but waiting on something outside the code. |

All local runs used test accounts, fixture websites and Instagram profiles,
and a simulated Meta. Nothing was sent to Meta, published, spent, charged or
emailed.

## Evidence run for this report

| Run | Result |
|---|---|
| `npm run audit` (every `check:*` suite) | **78 / 78 suites pass** (simulated Meta only) |
| `npx tsc --noEmit`, `eslint` | Clean |
| `npm run build` (production build) | Passes: 98 static pages; `/preview`, `/api/tools/instagram`, `/help/*` and `/solutions/*` built |
| Browser: homepage hero and free plan, all three ways in (`freeplan3.js`, replacing `freeplan2.js`) | **171 / 171** on the dev server, and again **171 / 171** on the production build (`next start`): 1440 describe path straight to the quick plan, sharpened in place, full plan and back, Make Changes, Approve My Plan; 390 Instagram path with the bio link read; 768 Instagram login wall and an invalid username; 1440 website path by keyboard with reduced motion; `/solutions`, `/tools`, `/help` |
| Browser: signed-in app at 390 / 768 / 1440 (`release-app.js`) | **46 / 46**: 12 signed-in pages at 1440, 768 and 390 with no sideways scroll, one h1 and no page errors; keyboard to Pause everything and Help; reduced motion; no calls to Meta from the browser |
| Browser: help centre (`help.js`) | **72 / 72** |
| Browser: Pause everything (`pauseall.js`) | **13 / 13**: asks first; Keep running backs out; a refusal is reported, not shown as paused; launches held; no calls to Meta |
| Browser: suggested ads after Meta (`suggested.js`) | **20 / 20**: three directions, one to test first, every field, concept labels, placements, refine, edit, change direction, upload refused honestly without a plan, 390 |
| Browser: dashboard (`dash-qa.js`) | **21 / 21**: tour, metric tiles with no money figure unless an ad account is connected, Action Center, no campaign shown live without Meta, Advanced view, phone |
| Browser: teams across two businesses (`team.js`); it found the phone switcher overlapping the top bar, now fixed | **11 / 11**: owner invites a Viewer; the Viewer joins and can't invite or change roles; a second business invites the same person, who accepts and gets the switcher; another business's team isn't shown |
| Walkthrough: every cursor and camera target found in both layouts (`walkcues.js`) | Wide: every target found. Narrow: every target except the plan scene's three section-menu links, which are hidden at phone width (the camera still finds each section) |
| Walkthrough re-render (`video/render.mjs`) and `check:preview` | Both layouts re-rendered at 30 fps, 73 s each, with the new form, plan, sample illustrations and end screen; `check:preview` **28 / 28**, including the captions file equal to the script |

## A. The ten points of the production audit

| # | Requirement | Status | Production route | Production (238bd1a) | Local, not deployed | Evidence | Remaining work |
|---|---|---|---|---|---|---|---|
| 1 | Replace "Preview My Campaign" everywhere with the free-plan experience | **Complete** (local) | `/`, `/preview`, nav, footer, `/tools`, `/solutions/*`, `/help`, walkthrough end screen | **Not done.** "Preview my campaign" is in 8 source files: the hero, the story stage, the nav, the homepage and the preview page | None left. Every button reads **"Build My Free Ad Plan"**, the brief's new wording; "See Your Free Plan" was its interim name and is gone too. | `freeplan2.js`: no "Preview my campaign", "See Your Free Plan" or "Drop Your URL" on `/`, `/solutions/online-stores`, `/tools` or `/help`; `git grep` finds 0 uses in `src/` | Deploy |
| 2 | Premium, bold, futuristic redesign inspired by Larven's presentation quality, without copying its branding or layouts | **Partial** | `/` and the whole app | **Not done.** Production runs the earlier light story hero ("Your business. Your next campaign. See it come together.") | Dark console design system: tokens, atmospheric sky, glass panels and a gradient ramp. Homepage rebuilt around the product. Galaxy-style hero with the new headline. No Larven asset, layout, copy or brand is used. | Screenshots at 390 and 1440; `check:capabilities` (no banned claims); `a11y`/overflow checks in the browser runs | The look is a judgement call: it needs the owner's sign-off on the live site. No "better than Larven" claim is made, because there's no evidence for one. |
| 3 | Homepage demos use the real dashboard's components and design language | **Complete** (local) | `/` | **Not done.** Production's hero is the separate story animation | The homepage draws MAIRO's own console components (`components/console/*`) inside a demo frame, labelled "Product demo — sample data". The walkthrough draws the real free-plan form, plan view and concept cards. | `check:preview` (stage bounds, sample-data label, no revenue/ROAS figures); walkthrough frames | Deploy |
| 4 | Professional, realistic sample ad previews, labelled as demonstrations | **Partial** | `/`, `/preview?example=…`, `/solutions/*`, walkthrough | **Not done.** Placeholders | Example plans, the homepage and (newly) the walkthrough show drawn sample illustrations for the fictional businesses inside the Facebook, Instagram and Story mock-ups. Each is captioned "Product demo — a drawn sample illustration for a fictional business". A visitor's own plan shows the layout with no picture, said plainly, until they upload one. | `check:preview`; walkthrough frame at 37.8 s; `freeplan2.js` (concepts labelled) | Illustrations, not photographs. Realistic photos need licensed or owner-supplied images; none were invented or taken from elsewhere. |
| 5 | Narrated 65–75-second walkthrough: accurate screens, smooth transitions, readable captions, complete journey | **Partial — narration Blocked** | `/` (#walkthrough), MP4s in `/walkthrough/` | **Older 60-second version** | 73 s in seven chapters, drawn with MAIRO's own screens (now including the new form and the new plan). Cursor and camera, captions on by default, play/pause/replay/slider/keyboard, a still version for reduced motion, MP4 + poster + WebVTT for 16:9 and 9:16. End screen: "Build My Free Ad Plan →". | `check:preview` (timing, captions = script, no forecasts, cursor and camera inside each scene, files at recorded sizes); `walkcues.js` | **Narration is blocked:** no licensed voice and no licensed music are available. The script is written and timed in `docs/WALKTHROUGH-SCRIPT.md`, and the player says there's no voice-over yet. On phones the plan scene's cursor has no section menu to click (it's hidden at that width); the camera still moves through each section. |
| 6 | After Meta connection: 3 personalised concepts, previews, editing, owner approval | **Partial** | `/dashboard/creatives/suggested` | Present (an earlier version) | Three directions from confirmed facts, one marked to test first. Six-format previews labelled illustrative. Edit, readiness score, rewrite proposals, turn down, and approval bound to the version shown. | `check:suggested-ads`, `check:creative-readiness`; `suggested.js` | Not run against a live Meta account. Making the picture needs OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN. AI rewrites need ANTHROPIC_API_KEY. Meta's own placement previews need a connected ad account. |
| 7a | Website analysis | **Partial** | `/preview`, `/onboarding`, `/tools/landing-page-audit`, `/dashboard/website` | Present | Public pages read server-side through a guarded fetcher; findings with evidence; facts with their source | `check:website`, `check:safe-fetch`, `check:business`; `freeplan2.js` (fixture sites) | Not run against live public sites from here. JavaScript-only sites can't be read; the visitor describes the business instead. AI reading needs ANTHROPIC_API_KEY. |
| 7b | Pixel setup guidance and tracking checks | **Partial** | `/dashboard/tracking` | Present | Find, choose or create the pixel; install steps by platform; verification states; Tag Manager container | `check:tracking`, `check:tracking-setup` (stubbed Meta) | Needs a connected Meta account with ads_management. The pixel stats endpoint hasn't been exercised live. Tag Manager's direct publish waits on Google's approval. |
| 7c | Payment | **Partial** | `/plan/activate`, `/dashboard/billing` | Present; billing enforced since 10 Oct | Starter $149.99 (7-day trial), Growth $239.99, Scale $499.99. One set of numbers drives the cards, checkout, enforcement and meters. | `check:pricing`, `check:payment-gate`, `check:entitlements`; a live Starter trial checkout on 10 Oct (NEXT.md item 8) | Not repeated in this session: there are no Stripe keys here, and nobody is to be charged in testing. Prices are unchanged. |
| 7d | Campaign approval | **Complete** (local), launched live 10 Oct | `/dashboard/launch`, `/dashboard/decisions` | Present | Nothing launches without a person's recorded approval; repeated approvals launch once; Pause everything is the emergency stop | `check:decisions`, `check:decision-claim`, `check:pause-everything-db`; `pauseall.js`; live $1/day launch and pause on 10 Oct | Pause everything is not deployed. It hasn't been run against live Meta (a single pause was). |
| 7e | Results | **Complete** (local) | `/dashboard`, `/dashboard/analytics`, `/dashboard/reports` | Present | Reported, qualified, booked and confirmed kept apart; every figure names its source; empty states when nothing is connected; first-result notice | `check:results`, `check:results-db`, `check:first-result-db`; `dash-qa.js` | Live figures need a running campaign. The first-result notice isn't deployed. |
| 8a | Multi-business, with real permissions and workspace isolation | **Complete** (local) | `/dashboard/settings/team`, `/invite/[token]`, business switcher | **Not done** (teams arrived after 238bd1a) | Six roles checked on the server for every change; hashed, single-use, address-bound invitations; switcher for people on more than one team; audit log of team changes | `check:members` (21 checks, including cross-business isolation and the switcher cookie checked against the database); `team.js` | Deploy |
| 8b | Agency experience (several client businesses) | **Blocked** | `/clients`, `/clients/billing` | Present | Freelancer client workspaces exist and are isolated | `check:members` ("a freelancer runs their own clients' businesses, and nobody else's") | There are no Stripe prices for the Studio and Agency plans, so nobody can buy them. They're shown as not available. |
| 8c | Enterprise: several brands in one business, approval chains | **Missing** | — | — | Not offered anywhere; shown as not available | `check:capabilities` (no public claim) | Build multi-brand and multi-approver chains if wanted |
| 9 | Resolve contradictions between advertised capabilities and features that aren't available or await approval | **Complete** (local) | Every public page | **Not done.** Production says "Give MAIRO your website" (a website is required there) and "Preview my campaign" | Public claims come from one inventory (`lib/capabilities.ts`); `check:capabilities` fails on guarantees, ratings, testimonials, counts or claims it can't back. Fixed today: the plan now names only the networks MAIRO runs (Facebook and Instagram through Meta: "Google Ads and TikTok aren't supported"); Shopify order counting is worded "if your store runs on Shopify"; Social posting says it awaits Meta's approval; AI video is unavailable. | `check:capabilities`: 42 working, 22 partial, 3 demo, 7 unavailable; `docs/CAPABILITIES.md` regenerated | Deploy. Then re-read the live pages once the domain can be reached. |
| 10 | Mobile, desktop, navigation, authentication, onboarding-to-launch | **Partial** | `/`, `/sign-up`, `/onboarding`, `/dashboard/*` | Earlier versions | Responsive at 390, 768 and 1440 with no sideways scroll; keyboard and reduced motion | `freeplan2.js`, `release-app.js`, `help.js`, `team.js`; `check:onboarding`, `check:onboarding-db`, `check:signup` | Launch is proven against simulated Meta locally and once live (10 Oct), not end to end on today's code. Google sign-in needs its keys. |

## B. The homepage and free-plan brief

| Requirement | Status | Route | Production (238bd1a) | Evidence | Remaining work |
|---|---|---|---|---|---|
| Headline "Your Business Has More Potential. Let MAIRO Show You." | **Complete** (local) | `/` | Not deployed: production shows "Your business. Your next campaign. See it come together." | `freeplan2.js` reads the h1; the share image uses the same line | Deploy |
| Supporting text, word for word, "Completely free to explore." | **Complete** (local) | `/` | Not deployed | `freeplan2.js` | Deploy |
| CTA "Build My Free Ad Plan →" | **Complete** (local) | `/`, nav, footer, `/preview`, `/solutions/*`, `/tools`, walkthrough | Not deployed | `freeplan2.js`; `check:preview` (`WALK_ONSCREEN.cta`) | Deploy |
| Option 1, the default: business name, what it sells, industry, primary goal | **Complete** (local) | `/` → `/preview?start=describe…` | Production shows the earlier version (see the update note) | Since 14 Oct, at the owner's request, a description goes **straight to a quick plan**: no questions and no build-step screen first. Only the name, what it sells and the goal are needed; the industry is optional. `freeplan3.js`: default tab; asks for a missing name or goal; "We sell … for young adults" read as the offering and the customer; plan on the next screen | — |
| Option 2: Instagram username or link | **Partial** | `/` → `/preview?instagram=…`, `POST /api/tools/instagram` | Not deployed | `check:instagram` (7 checks); `freeplan2.js` (fixture profile: name and bio read, follower counts never shown, bio link read too; login wall and invalid username handled) | **Never run against live Instagram.** Instagram often shows signed-out visitors a login page; MAIRO then says so and asks the visitor to describe the business. Reading public profile pages should be **reviewed against Instagram's terms** before it's relied on. |
| Option 3: website, optional | **Complete** (local), live sites unproven | `/preview?website=…` | Website-only in production | `freeplan2.js` (fixture site, by keyboard) | As 7a |
| Don't require a website; remove "Drop Your URL" | **Complete** (local) | `/` | Production's hero asks for a website | `freeplan2.js`: no website field until chosen; no "Drop Your URL" | Deploy |
| Progress steps reflect actual processing | **Changed** (local) | `/preview` | — | The separate build-step screen was removed with the quick plan. The five steps and their real results are now in "How MAIRO built this plan" under the plan, which opens by keyboard (`freeplan3.js` D). The Instagram and website readings keep their own live progress, which is real work. | — |
| Business Overview | **Complete** (local) | `/preview` plan | Not deployed | Every fact shows where it came from: "You told MAIRO", "From your website", "From your Instagram" or "MAIRO's suggestion" | — |
| Advertising Opportunities | **Complete** (local) | `/preview` plan | Not deployed | `check:consult` (follow from what's missing; never invent a discount; "didn't read a website" when none was read) | — |
| Suggested Strategy: objective, targeting, starting budget, platforms from supported integrations | **Complete** (local) | `/preview` plan | Not deployed | `freeplan2.js`: "Facebook and Instagram … Google Ads and TikTok aren't supported" | — |
| AI Creative Recommendations: 3 concepts with hook, headline, copy, visual or video direction, why | **Complete** (local) | `/preview` plan | Not in production yet | The quick plan always shows three ads, each as it would read in the feed with the picture direction, labelled as a concept. With few facts, the extra concepts are two openings ("Straight to the point", "Meet the business") that use only the name, the offer and the goal. `check:preview` confirms they invent no facts or numbers. The full plan keeps the Facebook, Instagram and Story mock-ups, editing and refining. | — |
| MAIRO Growth Recommendations: 3–5 actions, priority, how MAIRO helps | **Complete** (local) | `/preview` plan | Not deployed | `check:consult` (3–5, most important first, each with what MAIRO does, no forecasts); `freeplan2.js` | — |
| "Your Growth Plan Is Ready. Let MAIRO Bring It to Life.", Approve My Plan / Make Changes | **Complete** (local) | `/preview` plan → `/sign-up?from=preview…` | Not deployed | `freeplan2.js`: Make Changes returns to the facts with them kept; Approve My Plan opens sign-up with the facts saved for setup | Then the existing sign-up, plan approval, payment, Meta connection and campaign setup, unchanged |
| Galaxy accents, gradients, subtle animation, mobile, understood in five seconds | **Partial** | `/` | Not deployed | Screenshots at 390 and 1440; no sideways scroll. On a 390-wide phone the headline is three lines and the form begins just past halfway down the first screen (457 of 844 px). | Owner's judgement on the live site |
| No private Instagram insights; no claims about ad performance without the ad account | **Complete** (local) | `/`, `/preview`, `/privacy` | — | The form and the privacy page say only the public name, bio and link are read, with nothing stored. `check:instagram` (follower counts never read). The plan states no current metrics. | The privacy wording is new: **surfaced for legal review** (see below) |
| Never manufacture metrics, guaranteed sales or ROAS predictions | **Complete** (local) | All | — | `check:consult`, `check:preview`, `check:capabilities` (banned-claim patterns); `freeplan2.js` ("no forecasts or guarantees") | — |
| No launch or charge without explicit confirmation; free plan before payment | **Complete** (local) | `/preview` | — | The plan says "No ad runs and nothing is charged without your explicit confirmation". The free plan needs no account. | — |
| Preserve existing functionality, authentication, dashboard and payment | **Complete** (local) | All | — | `npm run audit`; signed-in browser runs | — |

## Changed on 14 October: the quick plan

At the owner's request, "Tell us about your business" now goes straight from the form to a short plan. Before, it asked follow-up questions and showed a build-step screen. The plan shows:

1. your first campaign: goal, Facebook and Instagram, who sees it, a starting budget;
2. three ads;
3. what MAIRO does for you;
4. optional details that update the plan in place;
5. Approve My Plan, Make Changes, and "See the full plan".

What it went without, such as the area or the industry, is said and never filled in. Instagram and website starts still show what was read, with sources, for confirming first; then they reach the same quick plan.

The walkthrough video still shows the full plan, which is now one press past the quick plan. Re-rendering it to show the quick plan first is remaining work.

## E. The Free AI Ad Plan Generator

The homepage hero is now the **Free AI Meta Ad Strategy Generator**. Pressing Generate opens `/preview`, which makes the plan and shows it. Statuses are as above: **Complete** means built, covered by checks and walked through in a browser locally, against fixture websites, on both the development and production builds. It never means "seen live".

Evidence: `check:strategy` (11), `check:plan-writing` (10), `check:report` (20), `check:saved-plan` (10), `npm run audit` 82/82, lint, typecheck, production build. Browser: `generator.js` (149/150 on the production build — the one miss is the expected one: the local AI fixture is refused in production, so the concepts are labelled as MAIRO's templates), `gen-signin.js` (7/7), the link check (61 links, 0 problems) and the accessibility check (9/9).

| Requirement | Status | Evidence | Left |
|---|---|---|---|
| Hero: label, headline, subheadline, an interactive tool instead of a long form | **Complete** (local) | `src/components/landing/console-hero.tsx`, `plan-generator.tsx`; screenshots at 390, 768 and 1440 | Owner's judgement on the live look |
| Four inputs: website (read for real; "What do you sell?" filled from it, labelled), goal (5), monthly Meta budget (5 choices + custom, said to be Meta spend), the Generate button and the free line | **Complete** (local) | `generator.js`: prefill from the website, goal suggested from it, errors and focus when empty. Without a website, the business name is asked. | — |
| No sign-up or payment to make or read the plan | **Complete** (local) | Plans made in fresh browsers with no account | — |
| Six stages, each ticked when its real work finishes; no percentages, no artificial waiting | **Complete** (local) | Stage 1 is the server's website reading (live progress lines). Stages 2–4 are computed in the browser and are instant, so they show done at once. Stage 5 is the AI request. Stage 6 builds the plan. | — |
| A real, personalised plan that changes with the business, goal and budget | **Partial** | `check:report`: five goals give five objectives and five first months; five budgets give five splits; the shop, plumber and lead-gen plans differ. The concepts are written by MAIRO's AI (Anthropic, structured output), then checked: invented numbers, guarantees, ratings, superlatives, fake urgency and copy Meta would reject are removed. | **The live model hasn't been called from here**: there's no API key in this environment. Production needs `ANTHROPIC_API_KEY`. Without it, or over the limits (6 an hour per visitor, 300 a day overall), the concepts come from MAIRO's templates and the plan says so |
| A — the business understood, facts kept apart from suggestions | **Complete** (local) | Each fact is labelled "From your website" or "You told MAIRO"; appeal, likely customers and opportunities are labelled "MAIRO's suggestion" | — |
| B — Meta strategy for the goal | **Complete** (local) | Objective, optimisation, audience, placements per goal, messaging, structure from the budget lines, and the reasons | — |
| C — budget plan from the visitor's figure | **Complete** (local) | $1,000 for a shop with a pixel → $650 prospecting / $200 retargeting / $150 testing. Lines always add up to the budget. Retargeting is left out, with the reason, below $1,000, without a pixel, or for traffic and awareness. Daily amounts are shown. No forecasts. | — |
| D — three concepts in Facebook and Instagram previews, one to test first | **Complete** (local) | Feed previews with a Facebook/Instagram switch. The picture area is labelled "Visual concept". **No images are generated in the free plan**, and the plan says so. | — |
| E — website findings only from a real reading | **Complete** (local) | Pages read, platform, pixel, checkout, form, booking and phone, with the audit's findings. With no site read, the plan says "makes no claims about one". | Live sites not read from here (the network is closed) |
| F — first 30 days, labelled as planned | **Complete** (local) | Weeks 1–4, each marked "Planned" | — |
| Conversion section: headline, text, free vs subscription, Put MAIRO to Work, Explore MAIRO Plans | **Complete** (local) | Put MAIRO to Work saves the plan and goes to sign-up. After sign-up, the plan belongs to the new business and setup opens with the website, offering, type, goal, budget and offer already filled in (checked in the database). A signed-in owner goes straight to setup. "Sign in and keep this plan" does the same for an existing customer. | — |
| Edit and regenerate, change budget, try another goal, save, share, download, return visits | **Complete** (local) | A budget change recomputes the plan without a new AI call. Another goal runs the stages again. Save gives a private `/s/<token>` link (read-only, not indexed). Share copies it. Download uses the browser's Save as PDF, with a print layout. Coming back on the same device offers "Open my plan". | — |
| Saved plans for signed-in users, carried into setup | **Complete** (local) | `FreeAdPlan` table, `check:saved-plan`. A plan is claimed by one business only. The claim uses this browser's own cookie and a POST, so a shared link can't move a plan into someone else's business. Setup answers already given win. Unclaimed plans are deleted after 30 days (daily cron). | — |
| SSRF protection, validation, rate limits, keys server-side | **Complete** (local) | The existing guarded website reader. Zod on every route. Per-visitor and daily limits on AI plans and saves, counted by a salted hash. The AI key is used only on the server. Visitors' text is never logged. | — |
| Nothing launched, spent or charged; forecasts kept out | **Complete** (local) | No Meta or Stripe call anywhere in the flow. `check:report` checks for forecasts and banned claims. | — |
| The rest of MAIRO keeps working | **Complete** (local) | `npm run audit` 82/82. The earlier free-plan links (example plans, Instagram, descriptions) still open the earlier flow. | — |

New database migration: **`20261119120000_free_ad_plans`** (the `FreeAdPlan` table). `vercel-build` applies it on the next push.

## F. Website, product demos and dashboard redesign (15 October)

The brief: a complete redesign around short videos of MAIRO in use at every
stage. Statuses as above — **Complete** means built, covered by checks and
walked through in a browser locally; it never means "seen live".

**About the videos.** Every video on the homepage is a **render of MAIRO's
own components**, captured frame by frame — not a screen recording of a
person using a live account. No recording could be made honestly here: there
is no AI key, no connected Meta account and no image model in this
environment, and fixture output can't be shown as live AI. What each clip is
drawn from, and what is a composition rather than a page, is listed in
`docs/PRODUCT-CLIPS.md`. Every frame says "Product demo · fictional business ·
sample data".

| Part of the brief | Status | Evidence | Left |
|---|---|---|---|
| 1. Design system: midnight and navy, electric blue, a little cyan, Geist and Inter, no purple | **Complete** (local) | Palette remapped across the site and the app (no purple, violet-as-purple, fuchsia, pink or indigo left); headings in Geist, public reading text in Inter; restrained gradients | Owner's eye on the live look |
| 2. Hero: "Your next ad strategy, built by AI.", the copy, a compact conversational start, the button and trust line, an animated plan demo, its own phone layout | **Complete** (local) | `hero-starter.tsx`, `hero-plan-demo.tsx`; `hero-e2e.js` **28 / 28** (website, Instagram, Instagram login wall, no website at 390, reduced motion, pause) | — |
| 3. Product film (60–90 s), with the final scene and button | **Complete** (local), **not a recording** | `film` clip, 74 s, 16:9 and 9:16, captions; `check:clips` | A licensed voice-over and music; real screen recordings to sit beside it |
| 4. Seven demo sections, each with a headline, a paragraph, a large clip and a CTA, alternating | **Complete** (local), **not recordings** | `creative`, `understand`, `campaign`, `team`, `dashboard`, `optimize`, `results` clips; `DemoSection` | As above |
| 5. Creative showcase: many kinds of business, controllable, swipeable, labelled | **Complete** (local) | Nine sample ads for fictional brands, drawn here, each "Sample creative"; arrows on a computer, swipe on a phone | Real photography or real MAIRO-made images, if wanted (see `docs/PRODUCT-CLIPS.md`) |
| 6. Dashboard: the sidebar order, "Your business at a glance.", the date-range chart, the AI Action Center, five creative statuses, Simple and Advanced | **Complete** (local) | New sidebar: Overview, Campaigns, Creative Studio, Performance, AI Team, Recommendations, Approvals, Results, Settings (existing routes); creative tiles read AI recommendation, Draft, Ready for review, Approved or Running from the records; behaviour unchanged | — |
| 7. Videos play only in view, muted, lazily, with controls, captions, a poster and reduced-motion support; no scroll-jacking | **Complete** (local) | `demo-video.tsx`; `videos.js` **53 / 53** at 1440, 768 and 390 (nothing loads until near, poster first, plays muted in view, 9:16 file on a phone, captions on and off, pause and play, paused when scrolled away, transcript, film captions track), with reduced motion (never starts by itself) and in a browser without H.264 (the clip is drawn live instead) | — |
| 8. Varied full-width showcases and the before/after | **Complete** (local) | Film full width, sides alternating, `BeforeAfter` with the brief's two lines | — |
| 9. Conversion: "Your strategy is ready. Let MAIRO put it to work.", Activate Your AI Advertising Team, Explore Plans, fee kept apart from ad spend | **Complete** (local) | Homepage block and the free plan's report | — |
| 10. Pricing from the source of truth, with a recommended plan | **Complete** (local) | Plan cards as rows (campaigns, AI images, AI assistance, approvals, results, extras) built from the entitlements; Growth recommended; prices unchanged | — |
| 13. Honesty: Meta only, no AI video, no auto social publishing, concepts vs images vs drafts vs approved vs live, no invented proof | **Complete** (local) | `check:clips` scans every caption; the homepage says what MAIRO doesn't do | — |
| 14. Video assets: audit, reuse, render, posters, subtitles, phone versions; report what needs recording | **Partial** | 8 clips × 2 compositions (16:9 and 9:16) rendered with WebP posters and WebVTT captions, about 19 MB in all; `check:clips` **7 / 7**; frames reviewed by eye, and the two framing faults found (a cropped recommendation card, the builder touching the frame's edges) fixed and re-rendered; the older walkthrough is kept for `/landing/classic` | Screen recordings in a demo account, real MAIRO images, voice-over and music (`docs/PRODUCT-CLIPS.md`) |

**Evidence for this section (15 October, local).** `npm run audit`
**83 / 83** suites; `tsc` and `eslint` clean; production build passes (100
pages). In a browser on the dev server: `videos.js` **53 / 53**;
`hero-e2e.js` **28 / 28**; `generator.js` **151 / 151** (its conversion check
updated to the brief's new paragraph); `a11y2.js` **13 / 13** (reduced
motion, keyboard to the hero form with a focus ring, one h1, no duplicate
ids, every image and control named, every player with labelled controls and
a transcript); every internal link and anchor resolves (`links.js`, 65
links); the homepage at 1440, 768, 412 and 390 has no sideways scroll and no
page errors. The headless browser here has no H.264, so the player's file
path was tested with VP9 copies of the same clips; real browsers play the
MP4s.

## G. Homepage polish, walkthrough and Instagram bio link (16–17 October)

Two briefs arrived together: polish the dark site, and a light redesign. The
owner left the colours open. The base stays midnight, because the videos and
the dashboard are drawn in it. The creative showcase sits on warm paper
(`#f4f1ea`) so the work reads like a printed portfolio. The accent stays
electric blue, with no purple. The structural asks of both briefs were built.

| Ask | Status | Evidence | Left |
|---|---|---|---|
| Nav: How It Works · Features · Pricing · Sign In · Get My Free Plan | **Complete** (local) | `landing-nav.tsx`; "Who it's for" moved under Resources | — |
| The 74 s film right after the hero | **Complete** (local), **not a recording** | `#film`, chapters listed beside it | Voice-over and music |
| Sticky five-step walkthrough: Understand, Build plan, Review creatives, Review & approve, Track & improve, labelled as a demo | **Complete** (local), **not recordings** | `walkthrough.tsx`. On a computer, one player stays beside the steps and switches as each step reaches mid-screen; the steps are also keyboard tabs. Below 1024 px each step has its own video. A new `plan` clip (16.5 s) shows the free plan's strategy and budget split | — |
| Creative showcase: "See the possibilities for your next campaign." | **Complete** (local) | `showcase.tsx`: nine sample ads for fictional brands, set as finished story, feed and square ads, each tagged "Sample"; masonry on a computer, swipe row on a phone | Real photography or real MAIRO images |
| Dashboard presentation in Simple-view outcomes, never missing data as zero | **Complete** (local) | `product-tour.tsx`: the dashboard and recommendation clips as two views of one player. Money spent, purchases or leads, cost per result, revenue only when provided, needs your approval | — |
| AI team section | **Complete** (local) | Eight specialties from `lib/team/agents.ts` beside the team clip; "Always waits for you" built from `ALWAYS_NEEDS_APPROVAL` | — |
| Free plan reads as a premium report | **Complete** (local) | "At a glance" cover on the report: first campaign, a budget ring, what to test first, "not a forecast". `/preview/example` opens the generator's own report for the fictional shop, labelled as an example | — |
| Instagram blocked by its login wall | **Partial** | Bio-link fallback: when Instagram won't show a profile, the visitor pastes the link from their bio and MAIRO reads that site instead (hero and `/preview`). Instagram links are refused. When a profile is readable and lists a website, MAIRO reads both | Reading the profile itself needs Meta's Business Discovery API, which needs the owner's Meta app setup |

**Evidence for this section (17 October, local).** `npm run audit`
**83 / 83** suites; `tsc` and `eslint` clean; production build passes;
`check:clips` **7 / 7** with nine clips; `check:capabilities` passes. These
browser runs used the production build:
- `videos.js` **58 / 58**, at 1440, 768 and 390, with reduced motion and the walkthrough player switching;
- `a11y2.js` **14 / 14**, including every showcase ad saying it's a sample, and the step and view tabs reachable by keyboard;
- `hero-e2e.js` **33 / 33**, including the bio-link path;
- `biolink-preview.js` **12 / 12**, at 1440 and 390;
- `links.js`: 68 links, 0 problems;
- the homepage at 1440, 768, 412 and 390 has no sideways scroll and no page errors.

`generator.js` scored **151 / 151** on the dev server. That run covers free
plan → Activate → sign-up → onboarding prefilled. On the production build it
scores 150 / 151, because the local plan-writer fixture is switched off in
production by design (`src/lib/ai/ad-plan.ts`).

Every video is a component render, not a screen recording. These are still
missing and have to be made by hand:
- screen recordings in a demo account;
- real images from MAIRO's image model;
- a licensed voice-over and music (`docs/PRODUCT-CLIPS.md`).

## H. Link previews, the 404 page and the error page (20 October)

- **Link preview.** The picture shown when a MAIRO link is pasted into a chat
  or a post (`src/app/opengraph-image.tsx`) still had the old headline ("Your
  Business Has More Potential…") and the old warm-black colours. It now shows
  the hero's headline, "Your next ad strategy, built by AI.", on the midnight
  background with the blue glow. The price line reads "Paid plans from
  $149.99/mo", from `lib/plans.ts`; no price changed.
- **404 page** (`src/app/not-found.tsx`). An unknown address used to show
  Next's plain default page. It now has the site's own nav and footer, says the
  page isn't there and that nothing about the account or the ads changed, and
  offers three ways on: the free plan, how MAIRO works, and the help center.
  It returns HTTP 404 and is not indexed.
- **Error page** (`src/app/error.tsx`). When a page fails to render, visitors
  see "This page didn't load" with Try again and Go to the homepage, and a
  reference to quote to support. The error's own text is never shown, because
  it can contain the business's data. The page doesn't claim that nothing
  happened: if someone had just pressed a button, it asks them to check
  whether the action went through before pressing it again.
- **Dark first paint.** The page header told browsers the site was light,
  while the stylesheet says dark. A slow connection could therefore flash
  white before the styles loaded. The header now says dark too.

**Evidence (local, production build).**
- `npm run audit`: **83 / 83**. `tsc` and `eslint` are clean, and the build
  passes.
- `notfound.js`: **26 / 26** at 1440 and 390. It checks the 404 status, a
  single robots tag, no sideways scroll, tap targets, keyboard focus, and that
  the links work.
- Error page: **16 / 16** at 1440 and 390, using a temporary page that throws
  on purpose. It checks the 500 status, that the error text isn't on the
  page, that a reference is shown, that Try again works, the tap targets, and
  the home link. The temporary page was removed before committing.
- `links.js`: 68 links, 0 problems. `a11y2.js`: 14 / 14. Homepage at 768, 412
  and 390: no sideways scroll and no page errors.

## I. Realistic pictures in the creative showcase (20 October)

The owner asked for the showcase's flat drawings to be replaced with pictures
that look like real products for made-up brands. Stock photo sites and image
models can't be reached from this environment. So each card's picture is now
a 3D product render, modelled, lit and rendered with Blender here. There are
nine, one per card:
- folded flannel overshirts;
- serum and pump bottles on a plinth;
- hex dumbbells;
- chrome pipes under a sink;
- a gold ring in a velvet box;
- keys with a house tag;
- glazed mugs and a gift box;
- a sofa in afternoon sun;
- a statement with a calculator and pen.

| | |
|---|---|
| Honesty | The brands stay fictional, and every card still says "Sample". The intro now says every picture is "a 3D product render made for this page", not a photograph. No people appear. |
| Files | `public/showcase/*.jpg` (22–53 KB each), listed with alt text in `src/components/home/showcase-photos.ts`. The scene scripts are in `scripts/showcase-renders/`, with steps to re-render. |
| Fallback | A card without a picture keeps its drawing. A picture can set dark or light headline type. |
| Elsewhere | Section J below covers the rest of the site. |

**Evidence (local, production build).**
- At 1340 px: all nine pictures load, no page errors, and the intro wording is
  as above.
- At 390 px: the swipe row loads 9 / 9 with no sideways scroll.
- `a11y2.js`: 14 / 14, so every card still says it's a sample.
- `r5home.js`: no overflow at 412 and 390. `links.js`: 68 links, 0 problems.
- `npm run audit`: 83 / 83. `check:capabilities` passes, and `tsc` and
  `eslint` are clean.

## J. Realistic pictures for the example businesses (20 October)

The owner asked for the rest of the site to match the showcase. Three
fictional example businesses appear across the plan mock-ups, the example
plans, the use-case pages, the hero's plan demo and the product clips. Each
of their nine drawings is now a 3D product render, made in the same way
(`scripts/showcase-renders/biz.py`):

| Business | Product (`demo`) | Problem it solves | Offer |
|---|---|---|---|
| Fernleaf Ceramics | A sage mug of coffee on walnut | Mugs on an oak shelf | Two mugs in a kraft gift box |
| Brightwater Plumbing | Pipes and valves under a sink | A wrench on the trap's slip nut | A "free estimate" on a clipboard |
| Juniper Hair Studio | A salon chair and a round mirror | A phone showing online booking | Scissors, a comb and a gift tag |

- **One source.** `BusinessArt` (`src/components/hero-story/art.tsx`) now
  shows these files (`public/showcase/examples/`), so every place that used
  the drawings changes together.
- **Sample ads.** The Creative Studio's sample ad cards (`sample-creatives.tsx`)
  now use the showcase renders.
- **Captions.** "a drawn sample illustration" now reads "a sample product
  render for a fictional business", and the creative examples say "3D product
  renders, not photographs".
- **Fixed.** The mock-ups' sizing rule only applied to drawings, so a picture
  left white space under itself. It now fills its frame: checked at 275 × 344
  in a 275 × 344 frame.

**Evidence (local, production build).**
- `/preview?example=service` and `/solutions/appointments` show the renders
  with the new caption and no page errors.
- The homepage hero demo loads six example renders, and a frame of the
  Creative Studio clip shows the three angle thumbnails as renders.
- `tsc` and `eslint` are clean, and `check:capabilities` passes.
- The product videos were then re-recorded with the new pictures
  (`video/render.mjs`): all nine clips at 16:9 and 9:16, the walkthrough, and
  the older landing story. Frames show the renders in the Creative Studio
  clip and in the walkthrough's plan mock-ups.
- After the re-recording: `npm run audit` **83 / 83**, `check:clips` 7 / 7
  and `check:preview` 29 / 29. `videos.js` passes 58 / 58 and `links.js`
  finds 68 links with 0 problems.

## K. Two plans: MAIRO Pro and MAIRO Scale (20 October)

Requested by the owner. Verified locally with simulated Stripe and Meta: nothing
was charged, sent to Stripe or Meta, or sent to a customer.

| Requirement | State | Evidence |
| --- | --- | --- |
| Exactly two plans sold: Pro $139, Scale $299 | Done | `src/lib/plans.ts` (PLANS, SOLD_TIERS); checkout refuses every other tier (`billing-actions.ts`); `check:pricing`, `check:plans-v2` |
| 7-day trial on Pro only | Done | `PRO_TRIAL_DAYS`, `trialDaysFor`; `check:payment-gate` |
| Existing subscribers untouched | Done | Earlier plans kept as STARTER, GROWTH, SCALE ($499.99), STUDIO, AGENCY with their own entitlements and price variables; new tiers are new enum values PRO and SCALE_V2; nobody is moved without pressing "Switch" |
| Upgrade / downgrade | Done | `/dashboard/billing/change` lists what changes, then Stripe's own confirmation (portal `subscription_update_confirm`); a Pro trial moving to Scale ends the trial and charges now, refusing a declined card (`error_if_incomplete`) |
| Renewals, failed payments, cancellation | Done | Signed webhook events through the real handler: `check:plans-v2` (18 checks) |
| Up to 3 Meta ad accounts on Scale | Done | Settings › Your businesses; `src/lib/brands.ts` mirrors the plan onto added businesses (webhook + daily review); extras locked, never paused, on Pro or after cancelling |
| Scale-only gates on the server | Done | Team seats (`seatProblem`), advanced analytics (ad-level rows), advanced tracking (lead values, stages, imports), Performance Coach (`runCoach`), Social Manager (`SOCIAL_TIERS`: empty since October 2026 — discontinued for every plan), AI Assist / Autopilot (existing flags) |
| Pricing section | Done | Two large cards, Pro left, Scale right "Most Popular", galaxy accents, hover lift, CTAs, ad-spend callout; `/pricing` page; browser run at 1440 and 390 (43 checks) |
| Confirmation | Partial | In-app notice on each new plan ("Welcome to MAIRO Pro" / "You're now on MAIRO Scale"); MAIRO sends no email itself — receipts are Stripe's customer emails |
| Instagram content creation and post queue | Partial | Built; publishing waits on Meta's approval, labelled "Publishing once Meta approves" on the card |
| Freelancer plans | Retired | `/for-freelancers` redirects to `/pricing`; existing workspaces keep their plans |
| Live Pro / Scale checkout | Blocked | Needs the two Stripe prices on the deployment |

Database migration: `20261120120000_two_plans` adds the enum values PRO and
SCALE_V2 (additive; runs on deploy).

## Fixed while verifying

- Reading the Instagram bio link no longer replaces what the visitor already
  confirmed. Their facts stay, and the website fills the gaps.
- The analysis steps say "1 ad concept" and "1 recommended action" when
  there's one.
- "Your Growth Plan Is Ready" is a real heading, so screen readers can find
  it.
- The growth plan no longer assumes a Shopify store.
- The walkthrough's ads show the sample business's labelled illustrations
  instead of empty frames.
- On phones:
  - the headline fits in three lines and the form comes up sooner;
  - the business switcher for people on two teams no longer overlaps the
    top bar.

## C. Changes surfaced for review

- **Privacy page (legal wording).** A new paragraph says what the Instagram
  reading does: one signed-out visit to the profile; it reads only the name,
  bio and link; no posts, followers, messages or insights; private profiles
  can't be seen; nothing is kept. Please have it reviewed with the rest of the
  policy.
- **Instagram's terms.** Reading public profile pages may be limited by
  Instagram's terms of use. The feature makes one request per visitor action,
  counts against the free limits (5 readings an hour per visitor) and falls
  back to a description. Have it reviewed before relying on it. It can be
  removed from the form without touching the rest.
- **Privacy page — saved and shared free plans (legal wording).** New
  sentences say that a free plan is kept on the server only when the visitor
  presses Save, Share or Put MAIRO to Work; that anyone with its private link
  can read it; that the browser remembers it with a cookie so it can join the
  account; that unclaimed plans are deleted after 30 days; and that the
  visitor's facts go to Anthropic to write the plan. Please have it reviewed.
- **Privacy page — button name.** The sentence about when a free plan is
  kept now names the button by its new label, "Activate Your AI Advertising
  Team" (it was "Put MAIRO to Work"). The meaning is unchanged; please include
  it in the legal review.
- **Price and plan change (requested, section K).** New customers can buy
  MAIRO Pro ($139, 7-day trial) and MAIRO Scale ($299). Starter, Growth, the
  $499.99 Scale, Studio and Agency are no longer sold; their subscribers keep
  their price and features.
- **Terms — trial wording (legal review).** "The MAIRO Pro plan begins with a
  7-day free trial … MAIRO Scale has no trial … Plans bought before October
  2026 keep their own price and terms until you change plan." Terms and
  Privacy now name "MAIRO Scale" for posting; last updated 20 October 2026.

## D. What's needed from the owner

1. Nothing to push by hand: since 15 October verified work is pushed to
   `claude/myro-ad-platform-u3ynfe` (and so deployed) as it's finished.
2. **Allow `mairo-three.vercel.app`** in this environment's network settings
   (Network access → Allowed domains). The live audit can then be done in a
   browser, which this report could not do.
3. For the Blocked and Partial rows:
   - a licensed voice (narration);
   - ANTHROPIC_API_KEY, OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN on the
     deployment (AI reading, rewrites, pictures);
   - Stripe prices for MAIRO Pro ($139/month) and MAIRO Scale ($299/month),
     set as STRIPE_PRICE_PRO and STRIPE_PRICE_SCALE_V2;
   - Google's approval for Tag Manager;
   - Meta's approval for posting;
   - a legal review of the privacy wording and the Instagram reading.
