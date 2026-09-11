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
- **Auth.js (NextAuth v5)** — email/password, `OWNER` vs `CLIENT` roles
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
5. Request the `ads_management`, `ads_read`, and `business_management`
   permissions under **App Review** — Meta has to approve these before a
   real (non-admin/tester) user can connect an ad account. This review can
   take from a few days to a few weeks; while it's pending you (and any users
   added as testers/admins on the app) can already connect and test.
6. Make sure the Meta user connecting has admin access to a Business Manager
   with at least one ad account.

### 5b. Set up your TikTok app (optional)

TikTok is optional in the strictest sense: leave `TIKTOK_APP_ID` and
`TIKTOK_APP_SECRET` unset and it simply isn't offered. The platform registry
reports it as unconfigured, the campaign form doesn't show it, and nothing
attempts a call that cannot succeed. Everything else works exactly as before.

To switch it on:

1. Create an app at <https://business-api.tiktok.com/portal>, under a TikTok
   Business Center account.
2. Copy the **App ID** and **Secret** into `TIKTOK_APP_ID` and
   `TIKTOK_APP_SECRET`.
3. Register the redirect URL. It must match byte-for-byte what the app
   resolves to — `https://<your-domain>/api/tiktok/callback`, no trailing
   slash. On Vercel this is derived from the production domain automatically;
   set `TIKTOK_REDIRECT_URI` only to override that.
4. Request the advertising scopes (`advertiser_read`, `campaign_create`,
   `campaign_update`, `adgroup_create`, `ad_create`, `reporting`). Until
   TikTok approves them, only accounts added as testers on the app can
   connect — the same shape of restriction as Meta's App Review.
5. Spark Ads (promoting a post already on the business's profile) need
   `video_list` on top. It is requested separately, only when a customer asks
   for it, so a first-time connection shows the smallest consent screen it can.

### 5c. Set up TikTok posting (optional, and separate)

Advertising on TikTok and posting to TikTok are two different registrations,
and this trips people up. `TIKTOK_APP_ID`/`TIKTOK_APP_SECRET` above are the
Business API — buying placements against an advertiser id. Posting a video to
the customer's own profile is the Open API, with its own app, its own
credentials, its own consent screen, and tokens that are rejected by the other
one. A customer who wants both authorizes twice, and the integrations page
tells them so.

Leave `TIKTOK_CLIENT_KEY` and `TIKTOK_CLIENT_SECRET` unset and the posting card
reports itself as unconfigured. Advertising is unaffected.

To switch it on:

1. Create an app at <https://developers.tiktok.com/> and add **Login Kit** and
   **Content Posting API**.
2. Copy the **Client key** and **Client secret** into `TIKTOK_CLIENT_KEY` and
   `TIKTOK_CLIENT_SECRET`.
3. Register `https://<your-domain>/api/tiktok/creator/callback` as a redirect
   URI, byte-for-byte, no trailing slash. Override with
   `TIKTOK_CREATOR_REDIRECT_URI` if the derived value is wrong.
4. Request the `video.upload` and `video.publish` scopes. With only
   `video.upload`, MAIRO puts videos in the customer's TikTok drafts and the
   product says "send to my TikTok drafts" rather than "post" — which is the
   truth, and the difference a customer would otherwise discover by opening
   TikTok and finding nothing there.
5. Apply for TikTok's **content posting audit**. Until it passes, TikTok forces
   everything an unaudited app posts to private regardless of what the request
   asks for. `TIKTOK_CONTENT_AUDITED` is what tells MAIRO the audit is through;
   leave it unset until it actually is, or the product will promise a public
   post and deliver a private one.

### 5d. Setting a customer's TikTok up for them

"MAIRO sets up your TikTok" is a worked queue at `/aios/account-setups`, not an
integration, and it is worth knowing why: no platform has an API that registers
a user account. Account creation is exactly where TikTok runs its identity, age
and anti-abuse checks, and it is deliberately not automatable.

So a customer on Growth or above fills in what they want the account called,
and somebody works the queue: registers it, converts it to a Business account,
sets up the Business Center and advertiser, and hands the login over. The
status and the note set on that page are what the customer reads on their own
integrations page, so the note is written for them rather than for us.

There is no password field on that screen and there should never be one. The
account belongs to the customer, and the Terms say MAIRO never stores a
platform login.

### 5e. Measuring sales (pixels and orders)

ROAS was a dash on every dashboard before this, and the reason was never said
out loud: without a pixel the ad networks do not know anybody bought anything,
so they report no revenue and there is nothing to divide by. `/dashboard/tracking`
is where a customer fixes that, and it has two halves that do different jobs.

**The pixel** tells Meta or TikTok that a sale happened. MAIRO creates it on
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
are relayed server-side to Meta's Conversions API and TikTok's Events API,
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

### 5f. Tag Manager, and what counts as a conversion

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
and TikTok standard event each maps to. The two networks disagree about the
vocabulary and the gaps are real: TikTok has no Lead and no Schedule, so both
land on SubmitForm. An event outside a network's standard list cannot be
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

### 5g. Letting MAIRO install the tags itself

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
src/lib/auth.ts           Auth.js config (credentials provider, JWT session)
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
src/app/api/tiktok/       TikTok OAuth connect/callback routes
src/app/api/agents/chat/  Streaming Claude chat endpoint (used by both dashboards)
```

## Adding an advertising network

Meta and TikTok are reached through one interface, `AdPlatformAdapter` in
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

- **Campaign creation is real on both networks** — live Graph API calls to
  Meta and live Business API calls to TikTok. Both create the top-level
  **Campaign** object and an ad group/ad set, paused by default.
- **Publishing finished creatives is not.** Both networks require the asset to
  exist in their own media library first (a hash on Meta, a processed
  `video_id` on TikTok), and MAIRO has no asset pipeline yet. `createAd`
  reports this honestly rather than posting an ad with nothing in it — see the
  note in each adapter.
- **No network call is ever faked.** If TikTok isn't configured, or an account
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
