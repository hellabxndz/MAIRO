# MAIRO

MAIRO is an ad-management platform for business owners who don't want to learn
Meta Ads. A client sets a goal and a monthly budget; MAIRO generates a monthly
strategy, launches and manages the campaigns on their connected Meta ad
account, and gives them AI specialists (Strategist, Creative, Support) to talk
to. The owner gets a separate **AIOS** dashboard (`/aios`) to run every client
account, manage the creative pipeline, and use an internal Claude copilot.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4)
- **Postgres** via **Prisma 7** (driver adapter: `@prisma/adapter-pg`)
- **Auth.js (NextAuth v5)** — email/password and optional Google, `OWNER` vs `CLIENT` roles
- **Claude** via the Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) for the
  monthly plan generator and the streaming agent chat
- **Meta Marketing API** (Graph API) for OAuth + campaign creation

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up a database

Create a free Postgres database — [Neon](https://neon.tech) is the easiest —
and copy `.env.example` to `.env`, filling in `DATABASE_URL`.

```bash
cp .env.example .env
```

Then run migrations:

```bash
npm run db:migrate
```

### 3. Generate an `AUTH_SECRET`

```bash
npx auth secret
```

Paste the result into `.env` as `AUTH_SECRET`.

### 3b. Continue with Google (optional)

Create a **Web application** OAuth client at
<https://console.cloud.google.com/apis/credentials> with the authorized redirect
URI `https://<production-domain>/api/auth/callback/google` (and
`http://localhost:3000/api/auth/callback/google` for local development), then set
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. With either unset the button is hidden
and the provider isn't registered.

A first-time Google user gets the same records as the email sign-up — a business
and a `CLIENT`, or from `/for-freelancers` a workspace and a `FREELANCER` — and
the business or studio name is still asked for, since it can't be changed later.
A Google login links to an existing email account only when Google marks the
address verified, and never creates a second user for one address. The rules are
in `src/lib/google-sign-in-rules.ts`; `npm run check:google` tests them, and the
database side too when `DATABASE_URL` points at a local Postgres.

### 4. Add your Anthropic API key

Set `ANTHROPIC_API_KEY` in `.env`. Without it, onboarding still works but the
generated monthly plan falls back to a placeholder, and the AI agent chats
will error.

### 5. Set up your Meta App (for real campaign creation)

Client sign-up and the dashboard work without this — you'll just see a
"connect Meta" prompt that fails until it's configured. To make it real:

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
   and create an app (type: **Business**).
2. Add the **Marketing API** product.
3. Under **Facebook Login for Business** (or the app's Settings → Basic),
   note your **App ID** and **App Secret** — put them in `.env` as
   `META_APP_ID` / `META_APP_SECRET`.
4. Add a valid **OAuth redirect URI**: for local dev,
   `http://localhost:3000/api/meta/callback`; in production, your real
   domain's equivalent. Set the same value in `.env` as `META_REDIRECT_URI`.
5. Request `ads_management`, `business_management`, `pages_show_list` and
   `pages_read_engagement` under **App Review** — Meta has to approve these before a
   real (non-admin/tester) user can connect an ad account. `ads_read` isn't
   needed and isn't requested: `ads_management` already covers reading ad
   accounts, campaigns and Insights (Meta approved the four above on
   October 7, 2026 and declined `ads_read`). This review can
   take from a few days to a few weeks; while it's pending you (and any users
   added as testers/admins on the app) can already connect and test.
6. Make sure the Meta user connecting has admin access to a Business Manager
   with at least one ad account.

### 5b. Networks

MAIRO runs Facebook and Instagram ads through Meta, and nothing else. TikTok
was built once and retired; its code is gone, but the `TIKTOK` enum value and
the columns and tables that referenced it are kept so existing rows still load
(the database is never dropped out from under old records). A campaign left
over from TikTok shows in the list but is not fetched or managed.

### 5c. Measuring sales (pixels and orders)

ROAS was a dash on every dashboard before this, and the reason was never said
out loud: without a pixel the ad networks do not know anybody bought anything,
so they report no revenue and there is nothing to divide by. `/dashboard/tracking`
is where a customer fixes that, and it has two halves that do different jobs.

**The pixel** tells Meta that a sale happened. MAIRO creates it on
the customer's own ad account through the Marketing API, adopting one that is
already there in preference to making a second — a business that has advertised
before usually has a pixel with months of history, and splitting that in two
makes both halves look worse. The status shown is never "we created it": it is
read back from the network's own record of when it last saw an event, because
a pixel that exists and has never fired looks identical to a working one and
the difference is months of fictional reporting.

Nothing here needs configuring on the deployment. It uses the advertising
connection the customer already made.

**The order feed** tells MAIRO what was actually sold. Each organization gets
a URL at `/api/orders/<token>` that their shop posts to — Shopify's order
webhook, a WooCommerce webhook, or anything that can POST JSON. Those orders
are relayed server-side to Meta's Conversions API,
which recovers most of the conversions the browser loses to ad blockers and
iOS privacy settings, and they are kept as the record the networks' own claims
are checked against.

Two details in there are load-bearing:

- The event id is derived from the order id by a rule a browser can reproduce
  in one line (`'mairo_' + orderId` with unsafe characters stripped). It is not
  a hash for exactly that reason. If the snippet on the thank-you page and the
  relay from here cannot arrive at the same string, neither network dedupes,
  every online sale counts twice and ROAS doubles — which is the kind of wrong
  number a customer increases their budget on.
- Customer emails and phone numbers are hashed at the boundary and the
  originals are never written down. `src/lib/tracking/hash.ts` carries the
  normalization rules both networks publish; getting one wrong does not match
  worse, it matches nobody, and neither end raises an error.

Where the customer gives MAIRO their Shopify signing secret it is stored
encrypted and every delivery must carry a valid signature. A store that sends
one and fails it is rejected rather than falling back to the token — a
signature going bad means something is wrong.

`npm run check:tracking` covers the money conversion, the hashing, the event-id
agreement between browser and server, and the ROAS comparison, including the
division-by-zero cases that would otherwise show a customer "Infinity".

### 5d. Tag Manager, and what counts as a conversion

Two problems sit between "here is your pixel code" and a business measuring
anything, and `/dashboard/tracking` now solves both.

**Installing it.** Done properly, a pixel means a base tag on every page, a
purchase tag on the confirmation page only, a click trigger on the phone
number, a form trigger, and each pointed at the right standard event. That is
an afternoon for somebody who knows Google Tag Manager and impossible for
somebody who does not — which is every customer MAIRO has. So MAIRO generates a
GTM container file wired to their own pixel ids, and GTM's Import Container
creates the lot in one screen. Nothing to configure on the deployment; it uses
the pixels the account already has.

The importer is stricter than it looks in one way and looser in another. It
validates structure but not sense: a tag whose `firingTriggerId` names a
trigger absent from the file imports cleanly and then never fires, with no
error anywhere. `npm run check:gtm` asserts there are no dangling references,
that ids are unique, and that every `{{variable}}` a tag uses is declared.

The tags are Custom HTML rather than GTM's built-in Meta template, because the
built-in one cannot set an event id — and without one, the browser's copy of a
sale and the copy MAIRO relays server-side are counted as two sales. The
generated expression is asserted to produce the same string as `deriveEventId`.

**Knowing what to install.** "Track Purchase" is wrong advice for a plumber:
there is no checkout and never will be, so the container would fire nothing
while looking installed. `src/lib/tracking/niches.ts` is a catalogue of what
each kind of business actually converts on — a table booking for a restaurant,
a tap on the phone number for a trade, a free trial for a gym — with the Meta
standard event each maps to. An event outside Meta's standard list cannot be
optimized towards and never appears in the conversion column, so the check
script validates every one against the published lists.

The niche is guessed from the industry text typed at signup, shown to the
customer *as a guess*, and stored on `TrackingProfile` once they confirm or
change it. Matching is word-boundary-aware with a short suffix list — plain
substring matching put "hair salon and barber" in the restaurant niche because
"barber" starts with "bar", which would have given a barber shop a
table-reservation trigger and no booking event, with nothing in the product
looking wrong. Both that and the "coffee shop" collision are regression cases.

Exactly one action per niche is marked primary: it is what the campaign
optimizes towards, so two would leave the product unable to answer "which one"
and none would make it silently pick the first.

### 5e. Letting MAIRO install the tags itself

The container file is one import away from done. `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` remove that step: MAIRO connects to the customer's
Google account, writes the tags into their container over the Tag Manager API
and publishes them. Leave the variables blank and the card says it is not
switched on and points at the download, which is not a degraded path — it
produces the identical container from the same `buildContainer()`.

Setting it up needs a Google Cloud project with the Tag Manager API enabled and
a Web application OAuth client. The scopes are sensitive, so Google verifies the
consent screen before anyone outside the project's test users can connect.

Five things in `provision.ts` are load-bearing and none of them are obvious:

- **Triggers before tags.** A tag references its trigger by the id Google
  assigns on creation, which is unknowable in advance, so the ids in the
  blueprint are remapped as the real ones come back. Creating tags first would
  need a second patching pass, and a failure between the two would leave tags
  firing on nothing.
- **Built-in variables before triggers.** A trigger on `{{Click URL}}` in a
  container where that built-in is off resolves to nothing, never matches and
  never fires — with no error at any point. This is the likeliest way for a
  "successful" provision to do absolutely nothing.
- **MAIRO's own workspace, never the default.** Publishing a workspace
  publishes everything in it, so writing into one somebody is halfway through
  editing would push their unfinished work live too.
- **Replace, don't append.** Running it twice must not leave two Purchase tags
  double-counting every sale, so MAIRO deletes its own entities first —
  identified by the `MAIRO - ` name prefix, and nothing without it is ever
  touched. Tags are deleted before triggers, because Tag Manager refuses to
  delete a trigger a tag still fires on.
- **Edit and publish are separate grants.** A customer can approve one and not
  the other, and Google returns 200 either way. Without publish the tags are
  created and change nothing, so the product says exactly that rather than
  reporting success.

The provisioning order was verified end to end against a mock Tag Manager API,
asserting that built-ins precede triggers, that every trigger precedes every
tag, that the created tags reference server-assigned ids rather than the
blueprint's local ones, and that a second run deletes before it recreates.
There is deliberately no base-URL override in the shipped client: an
environment variable that redirects where a customer's Google bearer token is
sent is not worth the testing convenience.

### 5f. What a launch actually creates

Until this, `launchOne` called `createCampaign` and stopped. On Meta a
campaign with no ad set and no ad **cannot serve a single impression** — so every campaign MAIRO had ever launched was an empty shell,
and the dashboard showed it as created. That is the worst shape a gap can
take, because it looks finished.

A launch now builds the whole hierarchy: campaign, then ad set, then ad. Three
things had to be fixed to make that possible, and each would have failed every
launch on its own:

- **The budget was set twice.** The campaign carries `daily_budget`, and
  `createAdGroup` set one as well. Meta rejects an ad set budget under a
  campaign that has one. Each adapter now declares a `budgetLevel` — `campaign`
  for Meta — and the launcher obeys rather than guessing.
- **`LEAD_GENERATION` was the wrong optimization goal.** It means one of Meta's
  instant forms, which lives on Facebook and which MAIRO never creates; asking
  for it on a campaign that sends people to a website produces an ad set that
  cannot deliver. A website lead is an offsite conversion, and only when
  there is a pixel to count it.
- **No pixel meant no honest conversion goal.** With a pixel, the ad set
  optimizes for the niche's primary conversion and carries a `promoted_object`
  naming it. Without one it falls back to `LINK_CLICKS`, because optimizing for
  purchases on an account that has never reported one is accepted by Meta and
  then under-delivers indefinitely. This is where the tracking work earns its
  place: the pixel is what makes "optimize for sales" mean anything.

`PlatformCampaign` gained `externalAdGroupId` and `externalAdId` so the record
says how far a launch got. The campaigns page reads them and says plainly when
a campaign cannot show to anyone — a campaign with no ad looks identical on
that page to one that works.

**The ad itself** is three dependent Meta calls in `src/lib/meta/creatives.ts`:
`/adimages` with the raw base64 (the `data:` prefix has to go, or Meta accepts
a file that then renders blank), `/adcreatives` with the hash and the Page, and
`/ads`. Everything lands PAUSED. Meta's automatic creative variations are
opted out of: the customer approved one picture and one line, and running
something else would make that approval meaningless.

The copy comes from the concept the Creative agent wrote, parsed by
`creative-copy.ts`. That parser never invents — a concept whose headline cannot
be found returns null and the ad is refused, because the alternative is an ad
running on the customer's money with a placeholder in it. It is a line scanner
rather than a regex for a reason worth remembering: the regex version used
`\z` for end-of-string, which JavaScript does not have (it matches a literal
"z"), so the last section of every concept silently failed to parse.

### 5g. Mairo's four AI features

- **Campaign Review / Pre-Launch Score** (`src/lib/score/`, Create → AI Review). A 0–100 score
  of campaign *preparation* from 15 checks, grouped into Creative, Hook, Offer,
  Audience, Landing Page and Campaign Setup — and an explanation of every point it's missing.
  - **The words agree with the number.** One set of bands everywhere (90+ Excellent, 80s Strong,
    70s Good Preparation, 60s Needs Improvement, below 60 Major Improvements Recommended). Below
    100 with recommendations, the summary names them ("Good campaign — but MAIRO found a few ways
    to make it stronger"); below 100 without any, it says the difference is uncertainty or limited
    data, not a problem. "Nothing to improve" is never said. "A higher score … does not guarantee
    performance" and "100 is not required to launch" are on the page.
  - **Actionable areas.** Each area opens a panel: why the score is lower, what's working, what
    could improve, MAIRO's recommendation, and "Estimated MAIRO score after change" (65 → ~82 —
    labelled an estimate of preparation, never of results). Landing Page keeps *Detected issues*
    (with evidence: an error, no mobile layout, an offer in the ad that the page's words don't
    show) apart from *Suggested things to check*, which never lower the score. Setup is in plain
    words ("MAIRO may not be able to measure purchases correctly yet" → Fix Tracking); the
    technical reason is shown in Advanced view.
  - **Lowest first, three at a time.** "MAIRO recommends improving these first" lists at most
    three areas; the rest wait under "more areas MAIRO can improve later". "Before you launch"
    is a ✓/⚠ checklist with Improve Campaign and **Launch Anyway** — the score never blocks a
    launch; only a real setup problem does.
  - **Let MAIRO Improve It** writes three alternatives (one *Recommended*) for the hook,
    headline, main text or offer from facts the business gave (`improveOptions` in
    `src/lib/ai/ad-score.ts`; a number the facts don't contain drops the option). Nothing changes
    until the customer picks one; *I'll Edit It* opens the step; *Keep Current Version* sets the
    area aside without a recheck. Offers are never forced to be discounts — ideas are a free
    estimate, consultation, trial, bundle, guarantee… by kind of business, and only confirmed
    offers go in an ad.
  - **Help MAIRO learn your business** (`src/lib/score/questions.ts`): a few questions at a time,
    personal to the business (a restaurant is asked which dish to promote, a contractor about free
    estimates, software about a trial), each with "Why MAIRO is asking". *Business Profile*
    answers (what makes you different, who buys, results, objections, what you have for ads) are
    saved to the Business Brain once and later asked as "We currently have … — is that still
    correct?". *Campaign* answers (this promotion, when it ends, limited stock) stay on the
    campaign (`plan.context`) and never become business facts. Answering never changes the score
    by itself.
  - **Recheck Campaign** re-runs every check and shows the change: 77 → Analyzing… → 86, what
    improved, and what's still recommended.
  - A blocking problem caps the score at 45. With no `ANTHROPIC_API_KEY` the words are scored on
    structure only, and Let MAIRO Improve It says the AI isn't switched on.
    `npm run check:ad-score` pins all of this.
- **Business Analyzer + Business Brain** (`/dashboard/business`,
  `/dashboard/settings/business-brain`, `src/lib/business/`). Reads the home
  page plus up to three shop, pricing or services pages through the same
  public-address check as the landing probe. Prices the AI reports are kept
  only if they appear on the page. Fields the business edits by hand are never
  overwritten by a later scan. *Build This Campaign* saves the recommendation
  as a Create draft; nothing launches from there.
- **Mairo Decisions** (`/dashboard/decisions`, `src/lib/decisions/`). Pure
  rules (`rules.ts`, asserted in `npm run check:decisions`) over each
  campaign's last 3 days, the 4 before and the last 7, per ad as well. They
  never fire in the learning period. Changes go through `apply.ts`: limits are
  checked even on approval, the network is called first, and activity is
  recorded only after it accepts. Automatic application follows
  `src/lib/automation/levels.ts` plus the approval switches in Settings.
  Refreshed daily by `/api/cron/review`, and on page load when older than six
  hours. Retargeting decisions aren't produced: MAIRO can't build retargeting
  audiences yet.
- **One-Click Fix** (`src/lib/ai/assistant-tools.ts`). The assistant reads real
  figures through `diagnose_campaigns` and can only propose the Decisions
  engine's own fixes (`propose_fix`). Those fixes open the same approval panel.
- **Mairo Activity** (`/dashboard/activity`) merges decision changes, the
  older optimizer and Spend Protection into one timeline.

Decisions are network-agnostic. A change names its platform and that
platform's adapter carries it out. `pauseAd` and `updateAdGroupTargeting` are
optional adapter methods, and rules that need them are skipped where an
adapter doesn't have them.

### 5h. Mairo Intelligence

One insight engine (`src/lib/intelligence/`) feeds six dashboard features. It
runs at the end of each Decisions refresh, on the same snapshot.

- **Insights** (`detect.ts`, table `MairoInsight`). Every decision rule's
  finding becomes a normalized Insight linked to its decision by dedupe key.
  Early warnings the rules don't cover are added on top:
  - cost per result rising
  - audience fatigue
  - conversion drop after the click
  - sudden tracking drop
  - close to the target CPA
  - under-delivery
  - retargeting potential
  - Facebook vs Instagram cost gap
  - broken or non-mobile landing pages
  - no working pixel

  Each Insight carries what happened, why it matters, the recommendation and
  reason, what approving does, its evidence and what it's based on, a severity
  and a confidence. Asserted in `npm run check:intelligence`.
- **Business Health** (`score.ts`, `/dashboard/health`). Five areas start at
  100 and lose points only for a named finding. An area with nothing to judge
  shows "Not enough data yet", never a number.
- **Opportunity Radar** (`score.ts`). Six areas rated from the open Insights.
  No revenue predictions.
- **Morning Brief** (`brief.ts`). Yesterday or the last 7 days
  (`Organization.briefFrequency`), yesterday's winning ad, the top two
  actions, and what Mairo is watching. It's cached in `IntelligenceReport`
  and is ready to feed an email or push later.
- **Mairo found this before you did.** The Insights marked as early warnings,
  with Fix with Mairo, Show me why and Dismiss.
- **Campaign Journey** (`timeline.ts`). Built from rows that already exist:
  the campaign, its ads, decisions, activity, insights, Spend Protection and
  the old optimizer. Shown on the dashboard and on a campaign's Timeline tab.
- **Profit First** (`profit.ts`, table `ProfitSettings`, `Product.costCents`).
  The dashboard's third view (cookie `mairo_lens`). Profit is always
  "estimated" and unknown until a margin is given. Break-even ROAS is 1 ÷
  (margin − fees − per-order costs ÷ AOV).

### 5i. Automatic Weekly Report

The Weekly Report (`src/lib/reports/weekly.ts`, table `WeeklyReport`) is a
summary layer over the systems above. It adds no detection of its own. Each
section comes from an existing system:

- **Figures:** the ad adapters, for the week and the week before.
- **What needs attention and next week's plan:** the open Insights.
- **Health change:** Business Health, compared with last week's report.
- **What Mairo changed:** Mairo Activity, the older optimizer and Spend
  Protection.
- **Estimated profit:** Profit First.

The judgement is pure (`weekly-logic.ts`, asserted in
`npm run check:weekly-report`):

- The win needs at least three results and a cost below the account average.
- Lessons need a gap of 25% or more.
- Early signals are shown but never saved.

The summary is written by the AI from the week's facts and falls back to a
plain version without an API key.

- **Mairo Learning Memory** (`MairoLearning`, shown on Business Brain). Saved
  lessons feed the assistant's prompt and new ad versions
  (`src/lib/reports/learnings.ts`). Any lesson can be switched off.
- **Delivery.** `/api/cron/review` writes due reports on each business's
  chosen day, in its own time zone. Opening Reports writes one if the cron
  hasn't reached the business yet.
  - In-app: a `WEEKLY_REPORT` notification.
  - Text: the existing weekly-summary switch on a verified number. The old
    Monday text summary now comes from the report.
  - Email and push aren't offered because there's no sender for them.
  - Settings are at `/dashboard/settings/reports`.
- **Agencies.** Client reports need approval before a share link exists
  (`/r/<token>`, client-facing, internal notes hidden by default). Branding
  comes from the agency workspace's report settings. Nothing is sent to
  clients automatically.
- The monthly report moved to `/dashboard/reports/monthly`.

### 5j. Free plan, approval and the first campaign

One journey from sign-up to a live first campaign. The free stage creates the strategy; the paid stage activates it.

**Free (before payment)** — `/plan`
- After business setup (which now also asks what to advertise, any current offer and where customers are), Mairo reads the website (Business Analyzer) and writes the **Mairo Advertising Plan**: goal, Facebook/Instagram, budget, audience, campaign type, product, offer, creative strategy, concepts, hooks, retargeting, website recommendations, budget split and structure.
- **Ask Mairo** changes it in plain words ("Change my budget to $35/day"). The reply lists every change with Previous / Updated / Reason, changed sections are highlighted, and **Undo Change** reverts it. Questions are answered without changing anything. Without an AI key, Mairo reads common requests (budget, platforms, ages, location, goal, product, offer) and says plainly when it can't.
- **Edit** buttons on Budget, Audience, Platforms, Goal, Product, Offer and Campaign Type. Dependent parts (split, retargeting, structure, campaign type) update with the reason shown — never silently. Tradeoffs come as a **Mairo Suggestion** with *Use Mairo Recommendation* / *Keep My Choice*; the business's choice wins.
- **Version history**: Original Plan, Revision 1, 2… with what changed, why, who asked, and "Go back to this version".
- States `DRAFT` / `REVISING` / `APPROVED` (`StrategyPlan`); approval stores `approvedAt`, `approvedVersion` and an untouched `approvedSnapshotJson`. Any change before payment returns it to draft.
- Until approved and paid, `/dashboard/*` redirects to `/plan` or `/plan/activate` (billing and the launch checklist stay reachable). `/plan/activate` shows the approved summary, the plans, and a sample-data demo. While `BILLING_ENFORCED` is off, it says so and continues without payment.

**Paid** — `/dashboard/launch`
- Activation locks the plan and turns on "hold before going live" for that business. Stripe returns to `/dashboard/launch?subscribed=1` (it waits honestly if the webhook hasn't arrived).
- Checklist: Strategy Approved → Subscription Active → Connect Facebook & Instagram → Select Ad Account → Verify Payment Method (asked of Meta; "unknown" never counts as done) → Review Audience → Confirm Budget → Generate Final Creatives → Pre-Launch Check → Build Campaign → Final Approval → Launch.
- **Turn My Plan Into a Campaign** opens Create with a draft prefilled from the approved snapshot; the campaign is built switched off and Create returns here.
- **Approved plan beside real campaign**, row by row, with differences highlighted and explained (e.g. retargeting ad sets are suggested later, never added automatically; sales aren't shown as tracked without the Pixel).
- Nothing goes live until **Launch Campaign** is pressed after agreeing to the daily budget. A press is recorded (`MairoCampaign.launchApprovedAt`), so a campaign still in Meta's review goes live when it clears.
- After launch: LIVE, "Welcome to your full Mairo dashboard", and a *Collecting data* note for the first 72 hours instead of any invented numbers.

Mairo runs Meta only, so the plan uses Facebook and Instagram. Freelancer client workspaces keep the previous onboarding path. `npm run check:strategy-plan` checks the plan rules.

**Paid line (updated)** — FREE shows what Mairo would do; PAID is Mairo doing it.
- Order: approve plan → **Connect My Ad Account** (connecting creates and spends nothing) → **Choose your Mairo plan** (`/plan/activate`: plan details, "Your Mairo Setup" summary, Continue to Payment) → Stripe → "Welcome to full Mairo" → **Build My Campaign** → paused build → final review → **Launch Campaign**.
- Businesses that sign up through the free plan get `Organization.paymentRequired`. For them, paid execution needs a live subscription (`active`, or `trialing` — a card is collected at checkout) **whatever `BILLING_ENFORCED` says**. Older accounts, including the Meta App Review account, still follow `BILLING_ENFORCED`.
- Enforced on the server (`src/lib/billing/execution.ts`): the Meta adapter refuses create campaign / ad set / ad, budget, schedule, targeting and switch-on writes, and the build, launch, resume, Decisions, optimization, creative-generation and publishing actions refuse too. Pausing is never blocked.
- Before subscribing, the dashboard shows Home (free), Business Brain, Integrations, Billing and Settings; every other area shows a locked preview with **Choose a Plan**.
- **Free trial: Starter only.** Starter starts with a 7-day free trial (`trialDays` on the plan in `src/lib/plans.ts`, read by checkout and every line of copy through `trialDaysFor`). Growth, Scale and the freelancer plans have no trial and are billed from the day they subscribe.
- **Trial that ends unpaid:** if the first charge after Starter's 7-day trial fails (or the trial is cancelled before any payment), the Stripe webhook pauses every running campaign, withdraws launch approvals, cancels the subscription and locks execution; the plan, business details and connections are kept. A daily sweep repeats this in case a webhook is missed. `Organization.hasPaid` makes sure paying customers are never affected.
- `npm run check:payment-gate` checks the lock.


### 6. Create your OWNER account

Public sign-up always creates a `CLIENT` account (a business owner). To get
into the AIOS dashboard at `/aios`, you need one `OWNER` account. Two ways:

- **From a browser (works on a deployed instance, no terminal needed):**
  visit `/setup`. It only works once — the first account created there
  becomes the OWNER, and the page redirects to `/sign-in` for everyone after
  that. Do this immediately after your first deploy, before sharing the URL.
- **From a terminal (local dev):**
  ```bash
  OWNER_EMAIL=you@example.com OWNER_PASSWORD=a-strong-password npm run db:seed
  ```

### 7. Run it

```bash
npm run dev
```

- `/` — marketing landing page
- `/sign-up`, `/sign-in` — client auth
- `/onboarding` — goal + budget intake, generates the first monthly plan
- `/dashboard` — client dashboard (plan, campaigns, creatives, Meta
  connection, AI specialists)
- `/aios` — owner dashboard (all organizations, creative pipeline, internal
  copilot) — requires an `OWNER` account

## Project structure

```
prisma/schema.prisma      Data model (orgs, plans, campaigns, creatives, agent threads)
src/lib/auth.ts           Auth.js config (credentials + Google providers, JWT session)
src/lib/db.ts             Prisma client (pg driver adapter)
src/lib/meta/             Meta Graph API client, OAuth flow, campaign calls
src/lib/ad-platforms/     One interface per advertising network (see below)
src/lib/budget/           Budget splitting, and the optimizer's guardrails
src/lib/entitlements.ts   What each plan allows — the only place that decides
src/lib/ai/               Claude model config, agent system prompts, plan generator, chat threads
src/lib/actions/          Server actions (auth, onboarding, campaigns, creatives, plan, AIOS)
src/app/(auth)/           Sign in / sign up
src/app/onboarding/       Client intake wizard
src/app/dashboard/        Client-facing app
src/app/aios/             Owner-facing app
src/app/api/meta/         Meta OAuth connect/callback routes
src/app/api/agents/chat/  Streaming Claude chat endpoint (used by both dashboards)
```

## Adding an advertising network

Meta is reached through one interface, `AdPlatformAdapter` in
`src/lib/ad-platforms/types.ts`. Nothing above that layer knows which network
it is talking to: the campaign form renders from `selectablePlatforms()`, the
dashboard groups by whatever platforms a campaign has, and the optimizer
compares whatever it is given.

Adding Google Ads is therefore three things and no more:

1. A value in the `AdPlatform` enum (a migration, but a one-line one).
2. A folder under `src/lib/ad-platforms/` implementing the interface.
3. An entry in `src/lib/ad-platforms/registry.ts`.

`implemented` in the registry is deliberately separate from the enum, so a
half-finished adapter can be developed without being offered to customers, and
a network can be retired without orphaning the rows that reference it.

## What's stubbed vs. real

- **Campaign creation is real** — live Graph API calls to Meta create the
  campaign, ad set and ad, paused by default.
- **No network call is ever faked.** If Meta isn't configured, or an account
  isn't connected, the adapter returns a typed failure that says which, and
  the dashboard shows a dash rather than a zero. A campaign that did not reach
  a network is never recorded as if it had; the whole product rests on the
  dashboard being true.
- **Auto Optimize is built but not scheduled.** `runAutoOptimize` is ready for
  a cron to call and enforces every limit the customer set, but nothing calls
  it on a timer yet — an unattended job that moves money should be switched on
  knowingly, once the guardrails have been watched working on real campaigns.
- **Subscriptions/billing are wired to Stripe** but the prices in
  `src/lib/plans.ts` are only what the pricing page *displays*. What a customer
  is charged comes from the Stripe Price behind each `STRIPE_PRICE_*`
  variable, so changing one without the other makes the page lie.
- **Creative asset generation** (actual images/video) isn't implemented —
  `CreativeRequest` is a queue your team (or the AIOS dashboard) works from
  manually today.

### Landing page

Premium dark design built only from Mairo's own UI, charts, icons and platform logos — no people or stock photos. Sections: hero with a floating sample dashboard and AI callouts, platform bar (only platforms Mairo actually works with; product statements instead of customer counts), How It Works (free plan → approve → connect → subscribe → build → approve → launch), business-type selector, the free-plan demo ("strategy only"), Mairo Decisions, Business Health, Simple / Advanced / Profit First preview, pricing, FAQ and the final call. Every figure is marked as sample or demo data. All calls to action go to `/sign-up`, which starts the free plan.

### The customer dashboard: show less first, reveal more when clicked

Before anything is added to a Simple screen, ask: *does the customer need to see this immediately?* Powerful underneath, simple on the surface. Advanced view (the Simple/Advanced toggle) still shows everything.

- **Sidebar:** Overview, Campaigns, Creatives, Analytics, Social Manager (Scale; an upgrade screen otherwise), Mairo Assistant, Settings. Everything else (Business Brain, goal & plan, connected accounts, tracking, decisions, reports, activity, billing, account) is one click into **Settings → Everything else**, and pages under it keep their sidebar item highlighted. **+ Create** (Create campaign, Create creative, Add promotion, Create social post on Scale, Tell Mairo something) sits under the logo and in the middle of the phone's bottom bar. **✨ Ask Mairo** is in the top bar everywhere; the assistant's `go_to` tool can only return pages from a fixed list (`DESTINATIONS`), shown as a button.
- **Overview (Simple)** — `app/dashboard/simple-overview.tsx`, six cards in reading order (the phone's order too): **Your goal** (Change goal and Tell Mairo open modals), **This month** (four numbers chosen by the goal — sales: Money spent, Revenue, Sales, Cost per sale; leads: Money spent, Leads, Cost per lead, Contact actions; bookings: Money spent, Bookings, Cost per booking, Booking leads; never CPM, CTR, CPC, frequency, impressions or reach; unknown is "—", never 0), **Mairo is working on** (each row opens its page), **Needs your attention** (only real items, at most three, one action each — recommendations open in a drawer; otherwise "✓ Everything is running normally."), **one Mairo insight** with *See why*, and **What's next** (Today / Tomorrow / weekday). With no goal, plan or campaign: "Let's grow your business." and five starting points.
- **Campaigns:** Active / Drafts / Paused / Completed tabs; each card is name, goal in plain words, status, money spent and the one result that matters for its goal. A campaign opens to Performance, Creatives (with "Why MAIRO made it"), Audience, Budget, Mairo Decisions, History and Advanced Settings (objective, optimization goal, Ads Manager link, schedule, destination, delete).
- **Creatives** (`/dashboard/creatives`, `lib/creatives/hub.ts`): Active, New (Ready to review / Approved / Draft, with Review & approve, Edit, Regenerate, Use in campaign), Past (search and status filter) and **Top Performing, ranked by the goal's result at the lowest cost** — purchases for a sales goal, never likes or clicks; ads with no result aren't ranked. Each card opens a drawer. **+ Create new creative** opens the AI Creative Studio, which is unchanged; the photo-to-ad tool moved to `/dashboard/creatives/requests`.
- **Analytics:** Simple shows the goal's numbers, best creative, best campaign and up to three insights; Advanced adds every metric plus campaign, platform and placement breakdowns.
- **Social Manager:** Overview, Content Calendar, Upcoming, Needs Approval, Published, Promotions and Performance as tabs inside one sidebar entry.
- **Settings (Simple):** business details, plan & billing and the assistant up front; go live without asking, Spend Protection, what MAIRO may do on its own and the brief fold behind **Advanced settings**, with a line each saying what's on right now (folded, never hidden). Links to `#go-live`, `#spend-protection` or `#automation` open the fold. Advanced view shows every section expanded.
- Simple actions use modals and drawers (`components/mairo/overlay.tsx`: Escape closes, focus moves in and back). Button styles shared with server components live in `components/mairo/action-styles.ts` — a `"use client"` module's exports reach the server as references, not strings.
- `npm run check:simple-ui` pins the rules (the numbers per goal, no technical metrics, plain goals and statuses, campaign tabs, what's next, one insight, goal-ranked creatives, assistant destinations).

### The MAIRO Mission (the core loop)

MAIRO is an AI marketing manager: the business says what it wants to achieve and MAIRO decides the marketing. Everything runs through one loop — **goal → understand the business → strategy → create → approve → launch/publish → measure → learn → improve** — centred on `/dashboard/mission` (reached from the Overview's goal card) and the Overview.

- **Goal:** 14 outcomes (sales, leads, bookings, calls, website traffic, new product/service, awareness, social, sale, event, foot traffic, repeat customers, "Let MAIRO recommend") or plain English ("We're a car detailing business and want more ceramic coating bookings"). `lib/mission/goals.ts` reads requests without AI; `lib/mission/planner.ts` uses AI when available.
- **Understanding:** Business Brain, website, products, connected Meta, tracking, campaigns, media library, promotions, what the owner told MAIRO, and learned results. At most two simple questions, only when the answer changes the plan; answers are remembered.
- **Plan:** "MAIRO created a plan" — goal, strategy, why, focus, ad concepts (each with an objective and "Why MAIRO created this ad"), social (Scale only), launch timeline, and MAIRO's tactics (customer action → Meta objective and destination, audience, creative, CTA, budget, retargeting, testing, optimization) behind a disclosure. Industry playbooks differ (clothing, restaurants, contractors, car care, barbers/salons, real estate, health, services).
- **Approval:** a plan is PROPOSED until approved. Approving archives the old mission, **prefills a Create draft** (the owner still confirms the budget in Create; nothing launches or spends from the Mission), and on active Scale sets Social Manager to the same goal so ads and social are one strategy. Primary and secondary goals; the secondary never outranks the primary.
- **Tell MAIRO something new:** promotions ("20% off this weekend" → a note with dates, urgency guidance, Scale social posts), sold out ("We sold out of the blue hoodie" → nothing new promotes it, planned posts mentioning it are skipped, running ads that mention it are flagged), launches ("launching a new hoodie Friday for $80" → a launch plan with timeline), or goal changes (a proposal to approve).
- **Every marketing item has an objective** (`marketingObjective` on campaigns, creatives and social posts: Awareness, Education, Trust, Consideration, Lead generation, Conversion, Booking, Retention, Promotion, Product launch) and a reason.
- **Results match the goal** (`resultsForGoal`): sales → revenue, purchases, cost per purchase, ROAS; leads → leads, cost per lead, calls/messages; bookings → Schedule events; traffic → landing page views; awareness → reach, impressions, video views. Untracked figures say "Not tracked yet" — clicks are never shown as leads, engagement never as sales. Meta's leads, Schedule, Contact/messaging and landing-page-view actions are now read.
- **Learned / adjusted** come from Learning Memory and Social Manager results only. **Next actions** come from real data (planned campaign not started, promotion ending, clicks without purchases, sold-out item in a running ad, nothing scheduled on Scale).
- **The Overview** shows the goal, this month's numbers for it, what MAIRO is doing, what needs the owner, one insight and what's next — see *The customer dashboard* below. Spend, CTR, CPC, CPM, ad sets and creative breakdowns stay in **Advanced**.
- **Weekly Report** opens with "Your week with MAIRO": goal, what MAIRO did, goal-matched results, what it learned, next week's plan.
- **Assistant** tools: `get_mission`, `propose_mission` (saves a plan to approve; shows "Review MAIRO's plan"), `tell_mairo`.
- The Create wizard's steps are unchanged (Meta App Review); MAIRO prefills it instead.
- `npm run check:mission` checks it.

### MAIRO Business Brain (the shared intelligence layer)

One persistent understanding of each business that every part of MAIRO reads — campaign creation, ad copy, creative concepts, the Strategy Engine and mission planner, the Campaign Review, Social Manager (Scale), the assistant and reports. Not a memory per feature: they all read `loadBrainState` / `brainPrompt` (`src/lib/brain/store.ts`), and every change goes through `changeBrain` (`src/lib/brain/edit.ts`).

    BUSINESS BRAIN (what MAIRO knows) → MISSION (what the business wants) → STRATEGY → EXECUTION
    → RESULTS → LEARNING (engine + weekly reports save learnings) → BUSINESS BRAIN updated → repeat

- **Four kinds of knowledge, never mixed:** *current facts* (the profile), *temporary* (promotions with dates and codes, sold-out items — they expire on their own and are never saved as facts), *learned* (patterns from results, with confidence, evidence, goal and sample size), and *historical* (what used to be true — "Previously offered window tinting" — kept so MAIRO knows why the strategy changed, never read as current).
- **What it stores** (`src/lib/brain/catalog.ts`): business basics, product and service records (price, kind, priority, profitability, availability, current goal — priority and margin only when the owner says), customers (ideal customer, types, problems, motivations, objections, purchase considerations — no assumed demographics), differentiators and standing offers, brand (voice, visual direction, creative style, words and claims to avoid). Every field states how it improves marketing; anything without a marketing purpose is refused.
- **Sources and corrections:** each fact records where it came from (You told MAIRO, From your website, Learned from your results, From a chat with MAIRO, …), whether it's confirmed or MAIRO's best guess, and when it was last confirmed. The customer's word always wins — an inference never overwrites it. Removing a fact moves it to history; replacing a confirmed one keeps the old value there too.
- **The page** (Settings → Business Brain, `/dashboard/settings/business-brain`): "What MAIRO knows about your business" in plain sections — Your Business, Your Goals (with goal history), Products & Services, Customers, What Makes You Different, Brand, Right Now, What MAIRO Has Learned (🔥 confident / 💡 still learning, with *See why*), Used to be true, Business History. Each fact has Correct · Update · Remove; products have Priority, High margin, Mark unavailable. "MAIRO knows your business: 44%" by area, never required to be 100.
- **Progressive, purposeful questions:** no giant form. A few questions at a time, each with "Why MAIRO is asking", chosen by the current goal (a leads goal asks about the offer, the problem and objections before branding). Known answers are confirmed, not re-asked; an important fact unconfirmed for 180 days, or contradicted (the focus product is sold out), gets one "Is … still right?" check.
- **Learning from results:** learnings record the goal and sample size; confidence is said plainly ("MAIRO is starting to notice" / "has noticed" / "has consistently found"), early hunches are never presented as patterns, and causal wording ("caused", "drove") is rewritten as an observation ("went with").
- **Creative Studio:** "Generate", "Upload & Transform" and variations send the image model the customer's request first, then a short visual brief from the Brain (`src/lib/brain/visual.ts`: visual direction, creative style, mood, brand colours, what to avoid, sold-out products not to feature) — never prices, offers or claims, which an image model would paint as text. The saved instruction stays exactly what the customer typed; edits of an existing image are unchanged. The page shows "✨ Images follow your Business Brain: …" with Edit. Ad copy written for a Studio image uses the full Brain too.
- **Everywhere:** the assistant reads the Brain and has `get_business_brain` and `update_business_brain` ("we don't do free estimates anymore" — removing or replacing a fact asks the owner first; ✨ Added to Business Brain shows once). Tell MAIRO "we sold out of X" marks the product unavailable. The Overview has one small "MAIRO knows your business" card.
- `npm run check:brain` pins the rules.

### MAIRO Strategy Engine

One place decides the marketing strategy; the mission plan, Create, creatives, Social Manager, Mairo Decisions and the assistant all read from it (`src/lib/engine/`). The rules are pure and pinned by `npm run check:engine`; AI only writes the words around them.

- **Structured objective** (`core.ts` `structureObjective`): "We need more roofing estimates" → Lead generation · Request an estimate · Roofing · High intent · Local customer acquisition. Also "more dinner reservations during weekdays" (Reserve a table · Fill weekday dinner), "sell more memberships" (Join a membership), "releasing a hoodie Friday" (Product launch). The business's own industry wins over a word in the request. Shown on the plan as "What MAIRO understood".
- **Strategy** (`buildStrategy`): goal priorities, creative direction (industry playbook filtered to objectives that serve the goal, reordered by what the account learned), audience, messaging, CTA, offer use, testing plan, optimization focus, retargeting (only with tracking), budget, confidence. Industry logic covers clothing, restaurants, dentists/health, contractors, barbers/salons, car care, real estate and software.
- **Launches** pick their stages (Tease, Reveal, Education, Demonstration, Social proof, Purchase, Urgency) with a reason for each, including the ones skipped (no tease when launch is tomorrow, no urgency without a real deadline, no social proof before customers exist).
- **Promotions** (`promotionPlan`): when to introduce it, ~2 mentions a week, whether running ads should change (MAIRO asks), whether a new creative is worth it, urgency only in the last days, and a rest from discounts after several promotions in 30 days. Used by the plan and "Tell MAIRO something new".
- **Budget** (`recommendBudget`): a split that always sums to 100% (goal / retargeting with tracking / testing / awareness only at larger budgets), a plain summary, and "a recommendation, not a promise". It never calls a default figure "your budget". The plan's daily amount and the Create draft come from it; the owner confirms or changes it in Create.
- **Every creative carries a brief** (`briefJson` on creative requests, campaign ads — including MAIRO-written variations — and social posts): goal, marketing objective, audience, hook, message, CTA, format, reason.
- **Learning loop** (`learning.ts`): compares format, hook style, offer vs no offer, CTA and audience age band per result type, only with ≥2 ads and ≥$50 on each side, ≥5 results on the better side and a ≥20% difference. Lessons go to Learning Memory (`engine:*` keys), strengthen to high after three sightings, and a new winner retires the old one.
- **Confidence** is internal low/medium/high; customers only see words ("MAIRO needs more data…", "MAIRO is becoming more confident…"), never a percentage. Shown on the plan, mission page and goal hero.
- **Engine decisions** (`recommend.ts`, run with the daily Mairo Decisions): move up to 20% of budget from a campaign that can't produce the goal's result to one that does (only past learning, with ≥5 results, using its budget), more of a winning format, promotion urgency on the last day, a rest from discounts. Each says why and its "Expected purpose" with no guarantee; a rule decision about the same budget wins. Decision cards show **Recommended change · Why · Expected purpose** with **Approve / Modify / Decline**.
- **Core rule** (`justifyAction`): every action must name the business objective it serves. Plan ad concepts, creative directions and running campaigns are checked; anything that can't answer isn't recommended (e.g. an awareness campaign on a small lead-gen budget, discount creative while discounts are resting).

### MAIRO Meta Intelligence

A permanent core layer that keeps MAIRO aligned with Meta advertising (`src/lib/meta-intelligence/`, admin at **AIOS → Meta Intelligence**). Meta evolves → MAIRO detects it → understands it → tests it → updates its knowledge → decides when it's actually useful. Customers never have to follow Meta's changes themselves.

- **Security rule:** documentation is untrusted input. Meta Intelligence detects, analyses, proposes and tests. It **never changes code and never changes a customer's live campaign**. Production changes are structured registry/knowledge edits an OWNER approved through the gates.
- **Sources** (`sources/`): official Meta sources first — Marketing API and Graph API changelogs, the versions page, Marketing API and Advantage+ docs, Instagram Platform, the Pages API, the developer blog, the Business Help Center and Meta for Business news. Only https pages on Meta's own hosts are fetched. Redirects must stay on the allowlist, fetches are capped at 15 s and 3 MB, and no credentials are sent. Authority comes from the host, and blogs, social posts and rumours never change behaviour. Admins can paste official text when a page can't be fetched.
- **Change detector** (`change-detector/`): stores a snapshot of each source. The first look is a baseline; after that, added or removed text blocks are filed as updates. Each one is classified (new, deprecated, renamed or removed feature, endpoint or field; permission, objective, optimization, placement, targeting, creative, measurement, attribution, Advantage+ or AI change; API version release or retirement; policy). It also records urgency, risk, which registry feature is mentioned, and version release and retirement dates exactly as Meta states them.
- **Interpretation** (`interpretation/`): the "META UPDATE" analysis. It answers what changed, why it matters, whether MAIRO uses it, which systems it affects, and what must change (customers, backend, campaign logic, UI, strategy knowledge). It also gives urgency, risk, and an evaluation: API availability, goal fit, replacement, permissions, API version, GA or beta, customer control, conflicts. It ends with a proposed integration plan.
  - AI runs through a fixed schema with no tools, and is told the excerpt is untrusted. Rules are the fallback.
  - Text that tries to instruct software is flagged and ignored.
  - `useAutomatically` is never acted on.
- **Meta Feature Registry** (`feature-registry/`, `PlatformFeature`): every Meta capability MAIRO relies on, with all the fields the spec lists (objectives, optimization goals, placements, formats, permissions, availability, regions, deprecation, replacement, last verified, source, MAIRO support and mapping, breaking risk, goal fit). Meta AI tools MAIRO hasn't evaluated are recorded as *Not supported*. Every change keeps the previous version.
- **metaCapabilities** (`capabilities/`): every Meta value campaigns are built with now lives in one place. That covers objectives, optimization goals, placements, message destinations, targeting rules, bidding, creative specs, CTA types, pixel events and insight action types. `meta/campaigns.ts`, the adapter, `objectives.ts`, `placements.ts`, `destination.ts`, `creatives.ts` and `media-rules.ts` read from it, with identical behaviour.
  - Campaigns record their features in `MairoCampaign.metaFeatures`.
  - A **guard** stops NEW campaigns from using a feature the registry marks deprecated or unsupported. Existing campaigns are never touched.
- **Versioned knowledge** (`knowledge-base/`): new versions supersede old ones and nothing is overwritten. Validated knowledge feeds the mission planner's and the assistant's prompts.
- **Safe update pipeline** (`pipeline/`): Detected → Analyzed → Proposed → Development → Automated testing → Sandbox / test account → Approved → Production.
  - Knowledge-only, non-breaking updates may fast-track.
  - Anything touching campaign creation, budget, publishing, permissions, billing, optimization, targeting or live campaigns needs a green contract run **and** a sandbox or recorded test-account pass.
  - Nothing reaches production while a critical test fails or none ran in the last 7 days.
  - Every move is audited.
  - Production applies the registry or knowledge change, creates any flag switched off, and writes the **Update Log** (what Meta changed, and what MAIRO changed because of it).
- **Compatibility:** Supported / Partially supported / Testing / Not supported / Deprecated / Not applicable. Nothing is *Supported* until validated. Marking a feature supported requires a passing contract run and a sandbox or test-account run after its last change.
- **Tests** (`testing/`):
  - `npm run check:meta-contract` runs 16 tests of MAIRO's real Meta request code against a stubbed Meta, scoped to the run via `withGraphTransport` and never global. It covers authentication, permissions, ad account, campaign, ad set, creative and ad creation, status, budgets, optimization goals versus objectives, placements, media, insights, pagination, tokens, errors and API version. **It runs in `vercel-build`, so a critical failure blocks deployment.**
  - Sandbox runs use `META_SANDBOX_ACCESS_TOKEN` / `META_SANDBOX_AD_ACCOUNT_ID` (a test account, never a customer's) and can try a candidate API version.
  - Admins can record manual test-account checks.
- **Feature flags** (`feature-flags/`): Off → Internal testing → Selected accounts → All eligible accounts (`META_<FEATURE>_ENABLED`). Setting a flag back to Off is the rollback. Internal accounts come from the flag's own list or `META_INTERNAL_ORG_IDS`.
- **API versions** (`api-versioning/`): production (from `META_GRAPH_API_VERSION`, default in metaCapabilities), available, candidate and retired versions, plus migration status. Dates come only from an official source or an admin. Alerts fire at 180, 90 and 30 days and on the day: "MAIRO is currently using Meta API vXX.X. Meta plans to retire this version on [date]. Migration testing should begin."
- **Deprecations** (`deprecations/`): affected systems and code, how many customer campaigns use it, the replacement, and a migration plan. New campaigns stop using it; existing ones keep running and move only with approval.
- **Error monitoring** (`errors/`): every Graph error, grouped by code, subcode, endpoint shape and method, with account counts (hashed — never tokens). An unfamiliar error hitting three or more accounts within 48 hours is flagged as a *possible Meta API behavior change*, opened as an update and alerted.
- **Capability discovery** (`discovery/`): each business's ad account (country, currency, status, capabilities, granted permissions). A feature is never shown as available without it, except GA features with no extra requirements.
- **Strategy Engine integration** (`strategy-integration/`):
  - The business goal always comes first. A Meta tool is considered only if it serves the active goal and is validated, rolled out to the account, and eligible.
  - New tools also need the owner's yes.
  - The business's own results get the last word: campaigns *with* versus *without* Advantage+ audience or placements are compared per business, under the learning loop's thresholds.
  - The plan lists "Meta tools MAIRO may use".
  - A validated new capability produces a one-time recommendation with **Approve / Learn more / Not now**. Approving records consent for the *next* campaign only.
- **Admin notifications:** critical updates, retiring versions, failing contract tests, error spikes, deprecations that customer campaigns rely on, and suspicious source text. Shown in AIOS with severity.
- The daily review cron runs it within a 12-second budget. `npm run check:meta-intelligence` covers the rest (29 checks, including the end-to-end path from a changed page to a production deprecation).
- **Future platforms:** every table carries `platform`, and `src/lib/platform-intelligence/` defines the shared types and a registry where TikTok, Google Ads, YouTube or LinkedIn intelligence can plug in.

### MAIRO Social Manager (Scale only)

Organic social media management, exclusive to **active Scale**. Everything else in MAIRO (ads) follows each plan's existing benefits; nothing on the ads side changed.

- **Who gets it:** `lib/social/access.ts` — the tier must be `SCALE` itself (a PlanConfig override can't open it to another plan; Agency no longer has `social_posting`), the subscription must be `active` (Scale has no free trial; `trialing` is accepted only because the check is shared), and execution must not be stopped. This applies whatever `BILLING_ENFORCED` says. A plan set by hand in `/aios/organizations` (no Stripe subscription) is recorded as `active`.
- **Checked on the server** by every Social Manager action (`lib/actions/social-manager-actions.ts`, `lib/actions/social-actions.ts`) and again by the publisher before every post (`lib/instagram/scheduler.ts`). The pages use the same check (`app/dashboard/social/gate.tsx`).
- **Other plans** see **Social Manager · Scale** in the sidebar with a lock; it opens an upgrade screen. Free-plan accounts that haven't paid go to `/plan/activate`, others to Billing.
- **Goal first:** the first screen asks "What do you want MAIRO to help your business accomplish?" (13 goals plus "Describe your goal"). Launch, sale and event goals ask for the details. MAIRO builds a strategy from the Business Brain, the goal, what's happening, and past results (`lib/social/strategist.ts`; AI with a rule-based playbook in `lib/social/goals.ts` when AI is unavailable). The mix differs by kind of business (retail, food, health, trades, real estate, beauty/fitness, services).
- **Every post** has a content type, objective, platform, date, time, status and **Why MAIRO created this**. Posts without a matching picture or video are Drafts that say what to shoot.
- **Content Calendar** (`/dashboard/social/calendar`): week and month views. Statuses: Draft, Awaiting approval, Approved, Scheduled, Published, Skipped (and Paused).
- **Promotions** (`/dashboard/social/promotions`): sale, new product/service, event, new inventory, holiday, announcement. Sequenced (e.g. teaser → launch → showcase → reminder → ending soon → last chance) and capped so no week is more than 60% selling.
- **Approval:** Approval required (default), Weekly approval (approve the week in one click; MAIRO plans the next week daily when it's thin and notifies), Autopilot (only after the business has approved 3 posts itself; schedules posts that have media).
- **Performance** (`/dashboard/social/performance`): likes and comments read back from Instagram and Facebook (reach needs Meta's insights permission, which MAIRO doesn't request, so it isn't shown). MAIRO plans more of what gets engagement and less of what the business skips.
- **Downgrade, cancellation or failed payment:** scheduled posts become **Paused** and are never published while inactive; Autopilot is switched off; strategy, drafts and history are kept. Triggered by the Stripe webhook, at publish time, when a Social page is opened, and by the daily review sweep. Back on Scale, **Resume** puts future posts back; posts that missed their time wait for approval again.
- `npm run check:social-manager` checks all of it.

### Scale: Instagram and Facebook posting

Scale accounts get a **Social** section in the sidebar with **Instagram posts** (`/dashboard/social/instagram`) and **Facebook posts** (`/dashboard/social/facebook`); `/dashboard/social` opens Instagram. Both work the same way, below; the Facebook differences are listed after.
- **Asked first:** Scale businesses see "Let MAIRO post on your Instagram feed?" (dashboard card and the Instagram page). Nothing is planned before a yes; "Not now" is asked again after 30 days (`Organization.instagramOptInAt` / `instagramDeclinedAt`).
- **Preview, then approve, then post:** every post — MAIRO's suggestions and the business's own — is shown as it will look on their feed (their @name, the exact JPEG Instagram will get, carousels swipeable, Reels framed, the caption). **Approve & post now** publishes immediately; **Approve for <time>** posts at the suggested time. Nothing is posted without that approval.
- **MAIRO plans the week:** picks from the business's approved pictures and videos (least recently posted first), writes captions from the Business Brain (plain ad copy without an AI key), and suggests times. A new plan replaces unapproved suggestions.
- **Make a post:** Photo, Carousel (2–10 pictures) or Reel (a campaign video), to post once approved or at a chosen time up to 75 days ahead in the business's timezone. Only media made or approved in MAIRO can be posted.
- **Publishing:** approved posts go out at the first check after their time — the daily 09:00 UTC run (`/api/cron/launch`), and whenever the business opens the Social page or the dashboard. On a Vercel plan with hourly crons, schedule `/api/cron/launch` hourly for exact times. Pictures are served to Instagram as JPEG, fitted (never cropped) to 4:5–1.91:1, via `/api/social/media/<post>/<n>`. Reels still processing are finished at the next check. Instagram's 25-posts-a-day limit is respected.
- Requires Scale, a live subscription, an Instagram Business/Creator account linked to the Facebook Page, and Meta's approval of `instagram_content_publish` (also listed in `META_SCOPES` if that is set).
- `npm run check:social-scheduler` checks both against a simulated Graph API.

**Facebook Page posts:**
- Asked on the dashboard once Instagram has been answered: "Let MAIRO post on your Facebook Page?" (`Organization.facebookOptInAt` / `facebookDeclinedAt`). Posts share the `InstagramPost` table with `network = "FACEBOOK"`.
- Previews look like a Facebook post (Page name, text above the picture, multi-photo grid, Like / Comment / Share). Post types are Photo, Multi-photo (2–10 pictures) and Video; text up to 5,000 characters, no hashtag limit, and captions written in a Facebook style.
- Posting needs `pages_manage_posts`. It is **not** in the everyday connect dialog (so App Review and `META_SCOPES` are unaffected). After a yes, the page shows **Allow posting on Facebook**, which goes to `/api/meta/connect?also=page_posts` — the usual permissions plus `pages_manage_posts`, with `auth_type=rerequest` — and comes back to the Facebook posts page. Until it's granted, previews can be seen but not approved. Reconnecting keeps the ad account and Page already chosen.
- Publishing uses the Page's own token, read on demand and never stored or sent to the browser: a photo via `/{page}/photos`, a multi-photo post as unpublished photos attached to one `/{page}/feed` post, a video via `/{page}/videos` (finished at the next check once Facebook has processed it). Instagram's 25-a-day limit doesn't apply.
- Until Meta approves `pages_manage_posts` in App Review, only people with a role on the Meta app can grant it.
