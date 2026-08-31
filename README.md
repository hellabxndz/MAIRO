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
src/lib/ai/               Claude model config, agent system prompts, plan generator, chat threads
src/lib/actions/          Server actions (auth, onboarding, campaigns, creatives, plan, AIOS)
src/app/(auth)/           Sign in / sign up
src/app/onboarding/       Client intake wizard
src/app/dashboard/        Client-facing app
src/app/aios/             Owner-facing app
src/app/api/meta/         Meta OAuth connect/callback routes
src/app/api/agents/chat/  Streaming Claude chat endpoint (used by both dashboards)
```

## What's stubbed vs. real

- **Meta campaign creation is real** — it calls the live Graph API. It only
  creates the top-level **Campaign** object (paused by default); ad sets, ad
  creative, and audience targeting are a further step to build once you
  decide how much of that flow to automate vs. have your team fill in Ads
  Manager.
- **Subscriptions/billing are not implemented.** There's a `subscriptionTier`
  field on `Organization` ready for when you wire up Stripe.
- **Creative asset generation** (actual images/video) isn't implemented —
  `CreativeRequest` is a queue your team (or the AIOS dashboard) works from
  manually today.
