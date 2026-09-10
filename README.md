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
