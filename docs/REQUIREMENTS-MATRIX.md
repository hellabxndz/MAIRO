# MAIRO — requirement matrix

> **Superseded on 14 October 2026 by `docs/VERIFICATION-REPORT.md`**, which
> marks each requirement Complete / Partial / Missing / Blocked against the
> deployed commit (238bd1a) and today's code. The rows below are kept as the
> 13 October record.

13 October 2026. Every row says what the code does and what has been shown,
and nothing is called "working" without a check or a browser run behind it.
The capability inventory these rows draw on is `docs/CAPABILITIES.md`,
generated from `src/lib/capabilities.ts` and checked by
`npm run check:capabilities`.

> **Update, 13 October 2026, 20:47 UTC.** The commits below were pushed, and
> Vercel's Production deployment of `mairo` succeeded: GitHub deployment
> 7049695675, https://mairo-hocu3avgs-mairo1.vercel.app. The "Not deployed"
> column describes the state before that push. The live site still hasn't
> been observed from here, so nothing below is "verified in production".

## What "deployed" means here

- **Production (https://mairo-three.vercel.app/) could not be opened from the
  environment this audit ran in.** Its network policy refuses that host
  (HTTP 403 from the outbound proxy), so nothing in this document was
  observed on the live site. The deployed column is worked out from the
  deploy branch instead.
- Vercel builds production from `claude/myro-ad-platform-u3ynfe` (the
  repository's default branch), using `vercel-build`: `prisma generate`,
  migrations, the Meta contract check, then `next build`.
- That branch is at **b430c36** on GitHub. Everything after it exists only in
  the local working copy and is **not deployed**. That is the history from
  `2069bcc`, the capability matrix and one public nav, to the 24-second hero.
  This matches the findings of 13 October:
  - the hero still shows the AI-team diagram;
  - the free-plan button goes straight to sign-up;
  - `/tools` returns 404.

  b430c36 has none of the files for `/tools`, `/preview` or the story hero.
- **In deploy branch** means the row's evidence files exist at b430c36. It
  says nothing about whether the live site works; that wasn't observable from
  here.
- **Not deployed** means at least one file the feature needs is missing at
  b430c36.

## How this was checked (13 October 2026, locally)

- `npm run audit`: **67 of 67 suites pass**, against simulated Meta. Nothing
  was sent to Meta, spent or published.
- `npm run check:preview`: 28 checks, covering the story's scenes, chapters,
  bounds, captions and examples, the video edit run through the real editor
  and renderer, and the rendered files.
- Browser on the production build (`next start`): **31/31 landing checks**
  and **15/16 extra checks**. The one gap is in-browser playback of the MP4,
  because the headless Chromium available here has no H.264 decoder
  (`canPlayType('avc1') = ""`). The files themselves were decoded with
  ffmpeg: 24.00 s, 1140×840 and 540×900. The server returns them with byte
  ranges (206, `video/mp4`).
- Earlier in this session, the same kind of browser runs covered:
  - suggested ads: 41;
  - calculator to plan: 22;
  - leads intake and import: 14;
  - video edit and render: 37.

  Each ran on a fresh local test account, with sandbox Meta and local media.
- Not done: anything on the live site, real Meta, real Stripe or real
  customer data.

## States
## States

| State | Meaning |
|---|---|
| Working and verified | Its check suites pass and, where it has a screen, a browser run went through it. All runs were local, against simulated Meta, with no spend. |
| Implemented but unverified | The code is there, but nothing here exercised it end to end. |
| Demo only | A labelled picture of the product with sample data. |
| Partial | Some of what was asked works; the rest is named. |
| Missing | Not built. |
| Blocked by external dependency | Built, but waiting on a key, an approval or a provider outside the code. |

## 1. Landing

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| The hero is a continuous animated product story, not the AI-team diagram | `/` · `components/landing/story-hero.tsx`, `components/hero-story/*`, `lib/demo/timeline.ts` | Demo only (by design), verified | Not deployed | `scripts/check-preview.ts` (story section); browser: 31/31 landing checks | Deploy |
| About 24 s in six scenes with the agreed lines; chapters Business / Understanding / Creatives / Editing / Approval / Results | `lib/demo/timeline.ts` (HERO_SCENES, CHAPTERS) | Working and verified | Not deployed | check:preview pins labels, timings and chapters; browser: chapter jump | Deploy |
| Scene 1: a URL typed into a MAIRO box; the website opens | `story-stage.tsx` StageInput, SiteBrowser | Working and verified | Not deployed | Frames at 1.2 s / 3.9 s | — |
| Scene 2: offer, imagery and button highlighted, then three cards (sell / serve / goal) and a confirmation | BusinessCard, ConfirmBar | Working and verified | Not deployed | Frames at 5.6 s / 7.8 s | — |
| Scene 3: three concepts (picture, hook, button); one enlarged as "Recommended first test" with its reason | Concept, ReasonCard; `examples.ts` story.reason | Working and verified | Not deployed | check:preview pins the service reason: "A demonstration makes your service easier to understand." | — |
| Scene 4: the draft in the feed and as a story; "Create this ad" / "Use my video"; a before/after video edit showing only real behaviour | FeedPreview, StoryPreview, Actions, EditCompare | Working and verified | Not deployed | check:preview runs each example's edit through the real `parseEdits` and `renderPlan`: trim to the demonstration, caption, 9:16 | — |
| Scene 5: review with creative, destination and example budget; "You approve before launch."; approving shows a labelled demo state | ApprovalPanel | Working and verified | Not deployed | Frame at 19.6 s: "✓ Approved — demo … nothing was sent to Meta" | — |
| Scene 6: services Lead → Qualified → Booked; store Purchase → Confirmed order value; a recommendation with evidence and Approve / Not now; no ROAS or revenue counter | ResultsBoard; `examples.ts` story.journey and recommendation | Working and verified | Not deployed | check:preview pins the steps, a source on every figure, and no revenue / ROAS / customers labels | — |
| Ends on "What could MAIRO create for your business?" with a real "Build My Free Ad Plan" button (was "Preview my campaign", then "See Your Free Plan") | InviteCard + overlay button in `hero-story.tsx` | Working and verified | Not deployed | Browser: the button sends the typed site to `/preview?website=…&type=shop`; an empty box gets focus instead | — |
| Examples: Online store / Service business / Multi-brand team. Brand selection and team review shown only if they work | `examples.ts` HERO_ORDER, brands | Working and verified | Not deployed | Brand switching and team sign-off don't exist for customers (see area 9), so the team example shows one brand and says so | — |
| Light design, purple accents, phone composition, a persistent "Product demo — sample data" label | `story-stage.tsx` STAGE_BACKGROUND; narrow layout | Working and verified | Not deployed | Browser 390 / 768 / 1440: no sideways scroll; tall stage on phones | — |
| The website box doesn't imply the visitor's site is being analysed | Stage shows only `.example` addresses | Working and verified | Not deployed | check:preview: every example URL ends in `.example` | — |
| Pause, replay, reduced motion, pause when off screen, hold while typing; no sound, no popup | `hero-story.tsx` | Working and verified | Not deployed | Browser: pause, replay, off screen, "Paused while you type", reduced-motion stills | — |
| The old diagram page shown to nobody by default (it was 20% of visitors) | `src/proxy.ts`, HERO_CLASSIC_PERCENT default 0 | Working and verified | Not deployed | Browser: six fresh visitors all got the story; `?hero=classic` still opens the old page for comparison | — |
| Rendered MP4s, posters and captions for each example and layout | `video/render.mjs` → `public/walkthrough/story-{shop,service,brands}-{wide,narrow}.mp4` and `-poster.webp`, `story.vtt`; `lib/demo/media.ts` | Working and verified (in-browser playback unverified here) | Not deployed | check:preview: files exist at the recorded sizes; the VTT equals the page's captions. ffmpeg: 24.00 s each. Browser: "Watch as a video" loads the chosen example's MP4 with captions, muted | The test browser has no H.264 decoder |
| 60-second walkthrough and video | `components/walkthrough/*` | Demo only | Not deployed | check:preview (walkthrough section) | Deploy |

## 2. Website-first free preview

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| The main call to action is a free preview of the visitor's own website, not account creation | `/preview` · `components/preview/preview-flow.tsx`, `lib/preview/build.ts` | Working and verified | Not deployed (b430c36 has no `/preview`) | Browser: hero → `/preview` read `shop.fixture.test` ("Read from https://shop.fixture.test/") | Deploy |
| Every public page's main button leads to the preview | `landing-nav.tsx` default CTA; `free-plan-demo.tsx` | Working and verified | Not deployed | The nav default was "Build my free ad plan" → `/sign-up`. Browser: `/tools`, a tool page, `/preview` and the example plan now lead to `/preview` | Deploy |
| Facts from the site, confirmed or corrected; gaps asked, never guessed | `lib/preview/build.ts`, `lib/website/scan.ts` | Working and verified | Not deployed | check:preview: no invented facts, numbers or forecasts | — |
| Reading the website with AI as well as literally | `lib/business/*` | Blocked by external dependency | In deploy branch | The literal reading runs without a key | ANTHROPIC_API_KEY in the deployment |
| Save the preview with a free account, then the plan | `/sign-up` → `/onboarding` → `/plan` | Working and verified | In deploy branch (the save step isn't) | onboarding and onboarding-db suites | — |

## 3. Free tools

20 tools in `src/lib/tools/registry.ts`. Hub at `/tools`, with search and
category filters; each tool lives at `/tools/<slug>`. Calculators run in the
browser and send nothing; website tools fetch the site server-side through
`safe-fetch`.

| Tool | State | Deployed | Evidence / blocker |
|---|---|---|---|
| Break-even ROAS · Margin & markup · Ad return scenarios · Customer lifetime contribution · Monthly operating profit · Cost-per-lead & bookings · Budget planner | Working and verified | Not deployed (`/tools` is 404 in production) | check:calculators (formulas and edge cases); browser: numbers handed into setup only when chosen |
| Shopify plan & fee comparison | Partial | Not deployed | Default rates dated 12 Oct 2026; to be confirmed against shopify.com/pricing |
| Hook generator · Creative brief & first test · Offer clarity · Ad examples by goal · Offer readiness | Working and verified | Not deployed | check:calculators |
| Competitor ad research (guided: Meta Ad Library links and questions, no scraping) | Working and verified | Not deployed | check:calculators |
| Competitor website · Landing-page audit · Shopify app detector · Shopify theme detector · Tracking readiness | Working and verified | Not deployed | check:website, check:safe-fetch (fixture sites; private addresses refused) |
| UTM builder | Working and verified | Not deployed | check:calculators |
| Calculator inputs stay in the browser | Working and verified | Not deployed | Calculators have no server route |

## 4. Website improvements and tracking

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| Website & Tracking: find, choose or create the pixel; install guidance; verification states | `/dashboard/tracking` · `lib/tracking/setup.ts`, `state.ts` | Partial | Not deployed (b430c36 lacks setup/state) | check:tracking-setup, check:tracking (simulated Meta) | A connected Meta ad account; a live run on a real account |
| Pixel through Google Tag Manager | `lib/gtm/*` | Blocked by external dependency | In deploy branch | Importing the ready-made container works | Google verification of the Tag Manager scope |
| Shopify orders (webhook, deduplicated, hashed to Conversions API) | `api/orders`, `lib/tracking/orders.ts` | Working and verified | In deploy branch | check:tracking | — |
| Website audit with fixes | `/tools/landing-page-audit`, `/tools/tracking-readiness`, `/dashboard/website` | Working and verified | Not deployed (tools) | check:website | — |
| MAIRO never edits the customer's website | Guidance only | Working and verified | — | Code review: nothing writes to a customer's site; tracking gives install steps only | — |

## 5. Creative-first flow

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| After Meta is connected and the profile confirmed: "Review your suggested ads", three directions from confirmed facts | `/dashboard/creatives/suggested` · `lib/suggested-ads/*` | Working and verified | Not deployed | check:suggested-ads; browser: 41 checks (local sandbox account) | Needs a connected Meta account and a confirmed profile (by design) |
| Create the selected ad, quoted in credits first | `createAdImageAction` | Blocked by external dependency | Not deployed | Browser run used local media | OPENAI_API_KEY and BLOB_READ_WRITE_TOKEN in the deployment |
| Revise, restore, approve by version; continue to a campaign draft | `suggested-ads-actions.ts` | Working and verified | Not deployed | Browser: approval bound to the version shown | — |
| Meta's own placement previews | `suggestedPreviewAction` (generatepreviews) | Implemented but unverified | Not deployed | Not called against real Meta here | A connected ad account |
| Brand check before an ad can be approved | `lib/brain/brand-check.ts` | Working and verified | Not deployed | check:brand | — |

## 6. Video upload and editing

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| Upload your own video (only from the business's own uploads) | `saveVideoAction`, `isOwnUpload` | Working and verified | Not deployed | Browser: render flow, 37 checks | BLOB_READ_WRITE_TOKEN in the deployment |
| Timestamped suggestions; trim, captions, crop; versions; revert | `lib/suggested-ads/video.ts`, `video-editor.tsx` | Working and verified | Not deployed | check:suggested-ads; browser | — |
| Each version written to a real MP4 and poster; the original kept | `render.ts`, `render-run.ts` | Working and verified (locally, real ffmpeg) | Not deployed | check:video-render: length, crop, burned-in caption, poster | ffmpeg in the Vercel function (ffmpeg-static) and storage, unproven on Vercel |
| AI-generated video, actors, voice | — | Missing | — | Not offered or claimed | A licensed provider |
| Licensed audio | — | Missing | — | Not offered or claimed | A licensed source |

## 7. Creative Studio and experiments

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| AI pictures | `/dashboard/creative-studio` | Blocked by external dependency | In deploy branch | check:creative-studio | OPENAI_API_KEY, BLOB_READ_WRITE_TOKEN |
| Ad text | `/dashboard/create` | Blocked by external dependency | In deploy branch | check:campaign-wizard, check:ads | ANTHROPIC_API_KEY |
| Brand details and rules (words to avoid, offers, promotions, proof) | Business Brain + brand check | Partial | Partly (the check isn't deployed) | check:brand, check:brain | An approved asset library is missing |
| Approved asset library | — | Missing | — | — | — |
| Creative experiments with evidence thresholds | `CreativeExperiment` model; proposed test stored on approval | Missing (workflow) | — | Only the proposed first test is recorded | — |
| Creative analytics per ad | Results and Coach by campaign | Partial | In deploy branch | check:results, check:coach | — |

## 8. Results and accountable actions

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| Results that keep reported, qualified, booked and confirmed apart | `/dashboard`, `/dashboard/analytics` · `lib/results/model.ts` | Working and verified | In deploy branch | check:results, check:results-db | Live data needs a running campaign |
| Performance Coach: findings with evidence | `/dashboard/coach` | Working and verified | In deploy branch | check:coach, check:coach-db | — |
| Recommendations that wait for approval (one claim per decision) | `/dashboard/decisions` | Working and verified | In deploy branch | check:decisions, check:decision-claim | — |
| Daily brief, weekly and monthly reports | `/dashboard/reports` | Working and verified | In deploy branch | check:weekly-report, check:reports | — |
| Lead outcomes; adding by hand; spreadsheet import; history | `/dashboard/leads` · `lib/leads/import.ts`, `history.ts` | Working and verified | Outcomes yes; import and history not deployed | check:lead-import, check:lead-outcomes; browser: 14 checks | — |
| The test is judged against the owner's confirmed break-even | `lib/calc/assumptions.ts`, `plan-numbers.tsx` | Working and verified | Not deployed | check:calculators, check:plan-guide; browser: 22 checks | — |
| First-result milestone | `lib/notifications/detect.ts` `detectFirstResult` (bell notice) | Working and verified | Not deployed yet | check:first-result-db (once only; ad leads only, spam and own leads excluded; MAIRO's count vs Meta's figure; isolated per business) | Needs a live campaign to fire |
| Emergency stop: pause every running campaign at once | Campaigns → Pause everything · `lib/protection/run.ts` `pauseEverything` | Working and verified (against a pretend Meta) | Not deployed yet | check:pause-everything-db (paused only where Meta accepted, a refusal reported and left running, launches held, logged, role-gated not billing-gated); browser: 13 checks, no calls to Meta | Not yet run against live Meta (the single pause was, on 10 Oct) |

## 9. Businesses of different sizes

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| Roles | `UserRole`: OWNER (MAIRO staff), CLIENT (business owner), FREELANCER | Partial | In deploy branch | One person per business account | — |
| Several businesses or brands in one login | Freelancer client workspaces (`active-org.ts`, `client-actions.ts`) | Blocked by external dependency | In deploy branch | The cookie is checked against the database on every request | No Stripe prices for the Studio and Agency plans, so customers can't buy them |
| Team members and invitations within one business | — | Missing | — | No membership or invite model | — |
| Approval chains (more than one approver) | — | Missing | — | Approvals are one owner's | — |
| Brand guidelines | Brand rules + brand check | Partial | Partly | See area 7 | Asset library missing |
| Bulk jobs (many ads or businesses at once) | — | Missing | — | — | — |
| Audit log | MAIRO Activity (`/dashboard/activity`), decision history, lead history, AI-team run records | Partial | Lead history not deployed | Records of MAIRO's actions and of lead changes | No log of each team member's actions (there are no team members) |

## 10. Assistant, billing and support

| Requirement | Code / route | Implementation | Deployed | Evidence | Blocker |
|---|---|---|---|---|---|
| Assistant ("Ask your AI team") answering from the account's own records | `/dashboard/agents` · `lib/ai/assistant-tools.ts` | Blocked by external dependency | In deploy branch | check:assistant | ANTHROPIC_API_KEY; not run against the model here |
| Subscriptions: Starter $149.99 (7-day trial), Growth $239.99, Scale $499.99; billing enforced | `/plan/activate`, `/dashboard/billing` · Stripe | Working and verified | In deploy branch | check:payment-gate, check:entitlements, check:pricing; NEXT.md records a live check on 10 Oct (not repeated here) | — |
| Studio and Agency plans | `/clients/billing` | Blocked by external dependency | In deploy branch | — | Stripe prices |
| Support contact | Footer and legal pages: `LEGAL.contactEmail` (NEXT_PUBLIC_SUPPORT_EMAIL, or the configured default) | Implemented but unverified | In deploy branch | Shown in the footer; whether anyone answers it isn't something code can show | — |
| In-app feedback and customer-success notes | `CustomerFeedback`, `SupportNote`; AIOS customers | Working and verified | In deploy branch | check:success | — |
| Help centre with search | `/help`, `/help/[slug]`, in the app at `/dashboard/guide` · `lib/help/articles.ts` | Working and verified | Not deployed yet | check:help (numbers, wording, limits, links, search); browser-checked public, signed in and without JavaScript; linked from billing, Creative Studio, tracking, approvals, performance and Meta screens | — |
| One set of plan numbers: cards, checkout, enforcement, meters | `lib/entitlements.ts` + `lib/plans.ts`; creative requests and auto-launch now read the entitlements | Working and verified | Not deployed yet | check:pricing ("one set of numbers": parity, no "Infinity", enforcement source) | — |
| Funnel through to retention | `lib/analytics/funnel.ts`; AIOS overview | Working and verified | Not deployed yet | check:funnel (each step recorded where it happens, once per business, nothing personal; 30-day retention from the subscription) | Earlier steps weren't recorded, so early counts undercount |
| Case studies | Consent in Account; `CaseStudy` table | Missing (on purpose) | — | Needs a customer's written permission and measured results; none invented | A real customer |
| Use-case pages | `/solutions/online-stores`, `/solutions/local-services`, `/solutions/appointments` | Working and verified (example plan labelled as a fictional business) | Not deployed yet | check:solutions; browser-checked at 390 and 1440 | — |
| Public founding-customer page | — | Missing | — | The founding program exists inside AIOS only | Its terms (who qualifies, what it offers, any price) are the owner's decision — NEXT.md item 13 |
| Sign in with Google | `/sign-in` | Blocked by external dependency | In deploy branch | check:google | GOOGLE_CLIENT_ID / SECRET |
| Text alerts | `/dashboard/notifications` | Blocked by external dependency | In deploy branch | check:notifications | Twilio settings |
