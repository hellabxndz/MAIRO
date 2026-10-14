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
- **No price, plan or subscription change.** Starter $149.99 with a 7-day
  trial, Growth $239.99 and Scale $499.99 are as they were.

## D. What's needed from the owner

1. **"push"**, to deploy the 17 local commits to Vercel Production. This
   applies the three migrations listed above.
2. **Allow `mairo-three.vercel.app`** in this environment's network settings
   (Network access → Allowed domains). The live audit can then be done in a
   browser, which this report could not do.
3. For the Blocked and Partial rows:
   - a licensed voice (narration);
   - ANTHROPIC_API_KEY, OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN on the
     deployment (AI reading, rewrites, pictures);
   - Stripe prices for the Studio and Agency plans;
   - Google's approval for Tag Manager;
   - Meta's approval for posting;
   - a legal review of the privacy wording and the Instagram reading.
