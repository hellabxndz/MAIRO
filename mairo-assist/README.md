# Mairo Assist

An AI employee for online stores. Businesses sign up, connect their Shopify
store, customize an AI sales and customer-service assistant, and put it on
their storefront. The assistant answers product questions from the real
catalog, looks up orders for verified customers, and collects returns,
exchanges and refunds for the merchant to approve.

> **Separate product.** Mairo Assist lives in `mairo-assist/` inside the Mairo
> repository but is a fully independent app: its own `package.json`, lockfile,
> database (Supabase), auth, and Vercel project. The Mairo ad platform at the
> repo root is untouched apart from telling its TypeScript and ESLint configs to
> ignore this folder.

## Status

Built in phases (see [docs/PHASES.md](docs/PHASES.md)). **Phases 1 and 2 are complete.**

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Setup, landing page, auth, database, multi-tenancy, onboarding, dashboard | ✅ Done |
| 2 | AI employee settings, knowledge base, AI conversations, inbox | ✅ Done |
| 3 | Shopify OAuth, product/inventory sync, customers and orders | Next |
| 4 | Storefront chat widget (theme app extension), recommendations, verified order tracking | Planned |
| 5 | Support tickets, returns/exchanges, approval center | Planned |
| 6 | Analytics charts, subscriptions, usage metering, billing | Planned |
| 7 | Security and performance testing, deployment, merchant onboarding | Planned |

## Stack

- **Next.js 16** (App Router, Server Actions, `proxy.ts`), React 19, TypeScript
- **Tailwind CSS v4**, shadcn/ui-style components (`src/components/ui`), Lucide icons, Geist font
- **Supabase**: Postgres with row-level security, Supabase Auth (`@supabase/ssr`)
- **OpenAI Responses API** (server-only) behind a provider interface, with a Zod-validated tool layer
- **Zod** for every input
- Tests: **Vitest** (unit), SQL test suite (RLS/isolation), **Playwright** (end-to-end against a real Auth/PostgREST stack)

## Getting started

### 1. Install

```bash
cd mairo-assist
npm install
cp .env.example .env.local
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Put the project URL, publishable key and secret key in `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`).
3. Set up the database: for a brand-new project, paste
   `supabase/setup_all.sql` into the SQL editor and run it once. (It's generated
   from `supabase/migrations/` by `scripts/build-setup-sql.sh`.) Later updates:
   apply only the new migration files, or use the Supabase CLI (`supabase link`
   then `supabase db push`).

### 3. Configure Supabase Auth

In **Authentication → URL Configuration**:

- **Site URL**: your app URL (e.g. `https://assist.example.com`, or `http://localhost:3100` locally)
- **Redirect URLs**: `https://assist.example.com/**` (and `http://localhost:3100/**` for local dev)

In **Authentication → Providers → Email**: keep **Confirm email** on, set the
minimum password length to 10.

In **Authentication → Email Templates**, use the templates in
[`supabase/templates/`](supabase/templates) for *Confirm signup*, *Reset
password* and *Change email address*. They send users to `/auth/confirm` with a
token hash, which the server verifies — the pattern Supabase recommends for
server-side auth. (The default templates also work: `/auth/confirm` accepts
PKCE `code` links too.)

For production email volume, configure a custom SMTP provider under
**Project Settings → Auth → SMTP** — Supabase's built-in sender is rate limited.

### 4. Add OpenAI (for the AI employee)

Set `OPENAI_API_KEY` and `OPENAI_MODEL` (any current model that supports
function calling in the Responses API). Optionally set the `OPENAI_PRICE_*`
values from OpenAI's pricing page so the Billing page can estimate AI cost per
business. Without OpenAI, everything else works and the preview chat explains
that the AI engine isn't configured.

### 5. Schedule maintenance

Set `CRON_SECRET` in Vercel. `vercel.json` runs `/api/cron/jobs` daily to
apply each business's conversation-retention setting and drain the job queue.

### 6. Run

```bash
npm run dev        # http://localhost:3100
```

Without Supabase configured, the marketing site works and the auth pages say
accounts aren't available yet.

## Testing

```bash
npm test           # unit tests (Vitest)
npm run test:db    # applies all migrations to a throwaway Postgres and runs the RLS / isolation suite (84 checks)
npm run test:e2e   # integration + end-to-end run (see below)
npm run typecheck
npm run lint
```

`test:db` needs Postgres server binaries (`initdb`, `pg_ctl`). It checks, among
other things, that one business can never read or write another's data, that
support agents can't see billing, that the last owner can't be removed, that an
untested AI employee can't be switched on, and that duplicate webhooks are
recorded once.

`test:e2e` starts a local Supabase-compatible stack (Postgres + GoTrue + PostgREST
+ an SMTP catcher + a deterministic fake of the OpenAI Responses API, see
`e2e/stack/`), runs the AI integration suite (`src/integration`) against it, then
builds and starts the app and drives it in Chromium: sign-up with real email verification, the full
onboarding, team invites and role changes, permission denials, password change
and reset, forged-cookie tenant switching, mobile layouts, AI employee editing,
preview chats, publishing/versions/activation, the knowledge base and uploads,
and the inbox with human takeover.

## Deploying to Vercel

Create a **new Vercel project** from this repository and set **Root Directory**
to `mairo-assist`. Add the environment variables from `.env.example`. The
existing Mairo project is unaffected.

## Project layout

```
mairo-assist/
├── src/
│   ├── app/                 # routes: marketing, (auth), onboarding, dashboard, account, invite
│   ├── components/          # ui/ (design system), marketing/, dashboard/, onboarding/, …
│   ├── lib/
│   │   ├── auth/            # session (verified JWT claims)
│   │   ├── tenancy/         # role → permission matrix, business context, authorize()
│   │   ├── billing/plans.ts # the single source of plan prices, features and limits
│   │   ├── security/        # AES-256-GCM secrets, tokens, rate limiting, safe redirects
│   │   ├── supabase/        # server (RLS) and admin (service role) clients
│   │   ├── onboarding/ team/ business/ account/ dashboard/ analytics/
│   │   └── validation/      # Zod schemas
│   └── proxy.ts             # session refresh + optimistic redirects
├── supabase/
│   ├── migrations/          # schema, RLS policies, RPCs
│   ├── templates/           # auth email templates
│   └── tests/               # SQL isolation tests
├── e2e/                     # Playwright tests + local stack
└── docs/                    # architecture, phases, analytics definitions
```

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/PHASES.md](docs/PHASES.md) · [docs/ANALYTICS.md](docs/ANALYTICS.md)
