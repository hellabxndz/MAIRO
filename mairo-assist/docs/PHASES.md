# Development plan

Each phase is completed and verified before dependent work starts.

## Phase 1 — Foundation ✅

Project setup, landing page, authentication, database, multi-tenant
architecture, business onboarding, dashboard.

## Phase 2 — The AI employee

- AI Employee page: edit name, avatar, welcome message, personality, formality,
  sales/service approach, escalation rules, instructions; **Save**, **Preview**,
  **Publish**, **Pause/Resume**; version history with restore
  (`ai_employee_versions`).
- Preview chat (marks `tested_at`), which unlocks activation.
- OpenAI Responses API engine with the tool layer (knowledge + policy tools
  first), prompt-injection defenses, usage recording and allowance checks.
- Knowledge base: manual entries, safe uploads (PDF/TXT/MD/DOCX) to Supabase
  Storage, text extraction, chunking, full-text + vector retrieval (pgvector),
  source references for merchant inspection.
- Conversation storage, AI Inbox (three-pane), human takeover / hand back.
- Retention job for old conversations.

## Phase 3 — Shopify

- Shopify app (Partner/Dev Dashboard), OAuth authorization-code grant with HMAC
  verification and state, **expiring offline tokens with refresh** (required for
  new public apps), encrypted token storage, validation before "Connected".
- Initial sync of shop, products, variants, inventory via GraphQL Admin API
  (bulk operations for large catalogs), cost-based rate-limit handling.
- Webhooks (products, inventory, orders, fulfillments, `app/uninstalled`) with
  HMAC verification, dedupe on delivery ID, job queue, retries.
- Mandatory compliance webhooks (`customers/data_request`, `customers/redact`,
  `shop/redact`); protected customer data request; disconnect/reconnect.
- Cron-driven job runner.

## Phase 4 — Storefront

- Theme app extension (app embed block) for the chat widget; public widget API
  with per-shop rate limits; no secrets in browser code.
- Product search/recommendation tools with real images, prices, sizes, links.
- Secure order verification (one-time code to the order email) and
  order/fulfillment/tracking tools.

## Phase 5 — Support and approvals

- Support tickets, return/exchange/refund/cancellation requests.
- Approval center (Approve / Reject / Contact customer) with revalidation,
  idempotency keys, and recording of who/what/when/Shopify confirmation.

## Phase 6 — Business

- Analytics charts and attribution event writer.
- Shopify Billing API subscriptions (primary) and Stripe (secondary) behind one
  abstraction; plan changes, cancellations, invoices, payment failures.
- Usage metering, 80% warnings, over-limit behaviour.

## Phase 7 — Production readiness

- Security review, load tests, error monitoring, platform admin console
  (`platform_admins`, restricted and audited), Shopify app review submission,
  merchant onboarding.

---

# Phase 1 report

## 1. Features implemented

- **Isolated app** in `mairo-assist/` that cannot affect the Mairo ad platform.
- **Marketing site**: hero, "What is Mairo Assist" (chatbot vs. AI employee),
  8 feature cards, 5-step how-it-works, interactive demo with a clearly-labelled
  sample store, pricing from the central plan config, FAQ, final CTA, privacy
  and terms pages. Dark navy/violet/electric-blue design, responsive, reduced
  motion respected.
- **Authentication** (Supabase Auth): sign-up with email verification and
  resend, sign-in, sign-out (POST, origin-checked), forgot/reset password,
  profile name, email change (confirmed by email), password change (requires
  current password, signs out other devices), device session list with
  per-device and all-device sign-out. Rate limiting and no account enumeration.
- **Multi-tenancy**: businesses, memberships, Owner/Admin/Support Agent roles
  with a server-side permission matrix and matching RLS; business switcher;
  "add another business"; invitations by link (hashed, single-use, email-bound,
  expiring); role changes; admin grants; member removal; leave business;
  last-owner protection; audit log of admin actions.
- **Onboarding** (8 steps, saved after every step, resumable, revisitable):
  business info → what you sell → AI goals → AI name → Shopify (skippable, with
  what-needs-Shopify list) → policies & instructions (saved to the knowledge
  base / AI draft) → appearance preview → activation checklist. The assistant
  stays off until tested and published.
- **Dashboard**: sidebar with all 12 sections (+ Approvals), mobile drawer,
  Simple/Advanced view remembered per user, overview with AI status and
  pause/resume control, real metrics and activity feed with empty states,
  "finish setup" guidance. Inbox (status filters), Orders, Approvals,
  Customers (search), Products (full-text search), AI Employee (read-only
  draft + preview), Knowledge Base, Analytics (date ranges incl. custom, rates,
  attribution definitions, CSV export), Integrations, Team, Billing (plans,
  usage bars, early-access notice), Settings (business details, support emails,
  time zone, retention). Loading, error and 404 states.
- **Database** for every product area (38 tables) with RLS, constraints and RPCs.

## 2. Files created or modified

- Created: everything under `mairo-assist/`.
- Modified (Mairo root): `tsconfig.json` (exclude `mairo-assist`),
  `eslint.config.mjs` (ignore `mairo-assist/**`).

## 3. Database changes

Five migrations in `supabase/migrations/`:

1. `core_tenancy` — `users`, `platform_admins`, `businesses`,
   `business_members`, `business_settings`, `business_invitations`,
   `audit_logs` (append-only), `activity_logs`, `background_jobs` (+ claim/fail
   functions), `rate_limits` (+ `rate_limit_hit`), RPCs `create_business`,
   `accept_business_invitation`, `list_my_sessions`, `revoke_my_session`,
   auth-user sync trigger, last-owner trigger, RLS helpers.
2. `ai_employee_knowledge` — `ai_employees` (active ⇒ tested + published),
   `ai_employee_versions`, `knowledge_documents`, `knowledge_chunks` (FTS).
3. `commerce` — `shopify_connections` (active ⇒ validated; one live shop per
   business and per shop), `shopify_credentials`, `shopify_oauth_states`,
   `products` (FTS), `product_variants`, `customers`, `orders`, `order_items`,
   `fulfillments`, `integration_webhooks` (dedupe).
4. `conversations_support` — `conversations` (human takeover state),
   `conversation_messages`, `order_verifications`, `support_tickets`,
   `order_action_requests` (decision required; completed ⇒ Shopify-confirmed;
   idempotency key), `ai_tool_executions`.
5. `growth_billing_analytics` — `leads`, `customer_consents`,
   `lead_follow_ups`, `analytics_events` (dedupe key), `subscriptions` (one per
   business, one provider), `invoices`, `usage_records`, `usage_counters`
   (+ `record_ai_usage`, `increment_conversation_usage`, `business_plan`).

## 4. Working functionality

Everything listed in section 1 works end to end against a real Supabase Auth
server and PostgREST with the RLS policies applied (verified by the e2e suite).
Pages for later phases read real tables and show honest empty states; they do
not display invented data.

## 5. Required credentials

| For | Variables | Where |
| --- | --- | --- |
| Accounts and dashboard | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Supabase project → API |
| Store token encryption | `ENCRYPTION_KEY` | Generate (see `.env.example`) |
| Phase 2 | `OPENAI_API_KEY`, `OPENAI_MODEL` | OpenAI |
| Phase 3 | `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | Shopify Partner / Dev Dashboard app |
| Phase 6 | Shopify Billing (via the app), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Shopify, Stripe |
| Ops | `CRON_SECRET` | Generate |

Also required outside the code: Supabase Auth URL configuration and email
templates (README), a custom SMTP provider for production email, a Vercel
project with Root Directory `mairo-assist`, and a domain.

## 6. Tests performed

- `npm test` — 40 unit tests: permission matrix (agents can't reach billing,
  forged admin grants ignored), plan config and entitlements, AES-GCM
  encryption (tamper, wrong key, row swap), tokens, open-redirect protection,
  onboarding progress rules, analytics ranges/rates/currencies/CSV, input
  validation, log redaction.
- `npm run test:db` — 68 SQL assertions on a real Postgres: cross-tenant reads
  and writes blocked, secrets tables unreadable, anon sees nothing, invitations
  bound to email and single use, agent restrictions, column-level protection,
  last-owner rule, AI activation constraint, Shopify validation and one-shop
  rules, webhook dedupe, approval invariants, append-only audit, job queue
  claim/backoff/dead-letter, rate limiter, usage roll-up, cascade deletion.
- `npm run test:e2e` — 15 Playwright scenarios against GoTrue + PostgREST +
  Postgres + SMTP catcher: landing and demo; redirect when signed out; sign-up →
  email link → onboarding → dashboard; resume onboarding; view preference;
  settings validation; invites; wrong account can't use an invite; agent joins
  and is refused billing/settings/team/analytics (pages and CSV export return
  403); role change takes effect immediately; removal revokes access; last owner
  can't leave; password change (wrong current rejected), sign-out, old password
  rejected; forgot-password email → reset; expired link rejected; forged
  business cookie can't switch tenant; mobile layout has no horizontal overflow
  and the mobile nav works.
- `npm run typecheck`, `npm run lint`, `next build` — clean.

## 7. Remaining limitations

- Shopify connection, AI conversations, the storefront widget, approvals
  actions, billing checkout and charts are not built yet (Phases 2–6). Their
  buttons are disabled with an explanation; nothing pretends to work.
- Team invitations produce a link for the owner to share; invitation emails
  need an email provider (planned with notifications).
- Business deletion workflow (request → grace period → purge) and the
  platform admin console are Phase 7.
- Device session listing reads `auth.sessions` through a security-definer
  function; if a Supabase project restricts that, the page falls back to
  "sign out other devices" (which always works).
- Privacy and Terms pages are plain-language drafts and need legal review
  before launch. Some marketing copy describes Phase 2–6 capabilities.
- The e2e stack uses HS256 JWTs; Supabase projects with asymmetric signing
  keys verify claims locally (faster) with the same code.

## 8. Next phase

Phase 2: AI employee editing/versions/preview, the OpenAI engine and tool
layer, knowledge uploads and retrieval, conversations and the AI Inbox with
human takeover.
