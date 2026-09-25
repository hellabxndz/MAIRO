# Development plan

Each phase is completed and verified before dependent work starts.

## Phase 1 — Foundation ✅

Project setup, landing page, authentication, database, multi-tenant
architecture, business onboarding, dashboard.

## Phase 2 — The AI employee ✅

Editing, versions and preview; the OpenAI engine and tool layer; knowledge
base with uploads and retrieval; conversations and the inbox with human
takeover; retention. (Retrieval uses Postgres full-text search; vector
embeddings are a later enhancement behind the same tool.)

## Phase 3 — Shopify ✅

OAuth (authorization-code grant, HMAC, single-use browser-bound state,
expiring offline tokens with rotating refresh), encrypted token storage,
validation before "Connected"; resumable product/variant/inventory and
60-day order sync through the job queue; webhooks with HMAC, dedupe and
retries; the three privacy webhooks; disconnect/reconnect; and read-only AI
product tools (search, details, live availability). Bulk operations were not
needed: paged syncs run in resumable slices instead.

## Phase 4 — Storefront

- Theme app extension (app embed block) for the chat widget; public widget API
  with per-shop rate limits; no secrets in browser code.
- Product cards (images) in the widget; product tools themselves shipped in Phase 3.
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

---

# Phase 2 report

## 1. Features implemented

- **AI Employee page**: edit name, avatar, welcome message, personality,
  formality, sales and service approach, communication style, escalation rules,
  business instructions, brand color, bubble position and logo. **Save
  Changes** (draft), **Publish Changes** (with an optional note), **Pause/Resume
  AI**, an "unpublished changes" indicator, and **version history** with
  *Restore to draft*.
- **Preview chat**: tests the saved draft with the real engine, knowledge base
  and tools, shows which tools ran and which knowledge sources were used.
  Escalation and lead capture are simulated. A successful preview marks the
  employee tested; activation still requires a published version (enforced by
  the database).
- **AI engine**: OpenAI Responses API (server-only, `store: false`), a
  provider-neutral agent loop with a tool-round limit, and four tools —
  `search_knowledge`, `get_business_policy`, `escalate_to_human`,
  `capture_lead` — each with a strict schema, server-side validation, per-business
  enablement (plan, goals, escalation settings), error handling and an audit row
  with emails masked. Safety rules come first in the instructions; owner text is
  fenced; knowledge and tool output are marked as data.
- **Conversation handling**: messages stored with sources and tools used;
  silence when paused or when a person has taken over; handover when the monthly
  allowance or per-conversation cap is reached; an honest fallback and a
  *needs attention* flag when the provider is down; 80% usage warning in the
  activity feed.
- **Usage and cost**: every model request records tokens and estimated cost
  (from `OPENAI_PRICE_*`), rolled up per month and shown on the Billing page.
- **Knowledge Base**: add, view, edit and delete entries; upload .txt, .md,
  .pdf and .docx (≤ 5 MB, type checked by content, text extracted on the server,
  file not kept); automatic chunking and indexing; **"Test what your AI employee
  finds"** shows the exact passages it would use. Onboarding policies are
  indexed too.
- **AI Inbox**: three panes (conversation list with status filters /
  conversation / customer, orders, requests and previous conversations), clear
  "talking to the AI" vs "talking to your team (name) — AI is silent" indicator,
  **Take over**, reply (which takes over automatically), **Hand back to AI**,
  **Mark resolved**, knowledge-source references on AI answers, auto-refresh.
- **Maintenance cron**: `/api/cron/jobs` (secret-protected) applies each
  business's retention setting and drains the job queue.
- Fixes found while testing: the inbox list query was ambiguous (two customer
  foreign keys) and failed; React 19 reset `<select>` fields after a failed form
  submission, so every form with a select now remounts with the submitted
  values.

## 2. Files created or modified

New: `src/lib/ai/*` (engine), `src/lib/ai-employee/actions.ts`,
`src/lib/knowledge/*`, `src/lib/inbox/actions.ts`, `src/lib/jobs/runner.ts`,
`src/app/api/cron/jobs/route.ts`, `src/components/{ai-employee,knowledge,inbox}/*`,
`src/integration/turn.int.test.ts`, `e2e/tests/phase2.spec.ts`,
`e2e/stack/fake-openai.mjs`, migration `20260925000100_phase2_ai_conversations.sql`,
`supabase/tests/20_phase2.sql`.
Rewritten: AI Employee, Knowledge Base and Inbox pages. Updated: onboarding
policy step (now indexes), Billing page (usage/cost), `next.config.ts` (6 MB
action bodies for uploads), `vercel.json` (daily cron), docs.

## 3. Database changes

- `conversations.preview_user_id` (+ check that previews have an owner); RLS so
  preview chats are visible only to the person who ran them.
- Trigger keeping `message_count`, `last_message_at` and the `new → ai_handling`
  status in step with messages.
- `conversation_messages.tool_names`.
- `ai_employees.draft_saved_at` (+ trigger), so "tested since the last change"
  is exact.
- `search_knowledge_chunks(business, query, limit)` — ranked, any-word
  full-text search scoped to one business (service role only).
- `purge_expired_conversations()` — retention (service role only).

## 4. Working functionality

Everything in section 1, verified end to end against real Supabase Auth,
PostgREST with RLS, and the real OpenAI SDK talking to a deterministic fake
Responses endpoint. With a real `OPENAI_API_KEY` and `OPENAI_MODEL` the same
code path talks to OpenAI.

## 5. Required credentials

`OPENAI_API_KEY`, `OPENAI_MODEL` (required for the AI), `OPENAI_PRICE_*`
(optional, for cost estimates), `CRON_SECRET` (retention job), plus the Phase 1
Supabase values.

## 6. Tests performed

- `npm test` — 62 unit tests (+22): agent loop (tool round-trips, refusing
  tools that weren't offered, tool crashes reported as failures, loop limit,
  provider errors), tool schemas are strict and validated server-side (extra
  fields like a `business_id` are rejected), system-prompt rules and ordering,
  chunking, upload type sniffing, audit redaction.
- `npm run test:db` — 84 SQL checks (+16): counters, preview privacy,
  knowledge search isolation, chunks can't point at another business's
  documents, retention, draft timestamps.
- Integration (`src/integration`, 9 tests, live mode against the stack):
  answers only from the business's own knowledge with sources, usage and cost
  recorded, tool audit; safety rules and only that business's tools sent to the
  model; silent while paused; escalation creates a ticket and stops the AI;
  lead capture with emails masked in the audit log; provider outage fallback;
  usage-limit handover; cross-business and wrong-channel conversations refused;
  empty/oversized messages rejected without calling the model.
- Playwright — 22 scenarios (+7): editing with validation, preview with
  knowledge sources and simulated escalation, previews kept out of inbox and
  analytics, publish → activate → pause, restore a version, knowledge add /
  inspect / upload / reject a fake PDF / delete, inbox take over → reply → hand
  back → resolve, every dashboard page loads, cron secret enforced.
- Typecheck, lint and production build clean.

## 7. Remaining limitations

- Customers can't reach the AI yet: the storefront widget and its public chat
  API are Phase 4. Live conversations in the inbox will come from there.
- No product, inventory or order tools until Shopify is connected (Phase 3–4);
  the AI says it can't check live store data rather than guessing.
- Knowledge retrieval is keyword-based (full-text). Semantic (vector) search is
  a possible later upgrade.
- Only the text of uploads is kept; scanned (image-only) PDFs aren't read.
- Escalation notifications are in-app (inbox badge, activity feed); email/SMS
  alerts to the team need an email provider.
- Tests use a scripted model. Real-model behaviour (tone, how well it follows
  the rules) should be checked with your key in the preview before going live.
- The daily cron is the Vercel Hobby limit; on Pro it can run hourly.

## 8. Next phase

Phase 3: Shopify app, OAuth with expiring offline tokens, product/variant/
inventory sync, orders and fulfillments, webhooks via the job queue, compliance
webhooks, and the Integrations page going live.

---

# Phase 3 report

## 1. Features implemented

- **Connect Shopify** (Integrations page and onboarding step 5): the merchant
  types their store address and approves read-only access on Shopify's own
  screen. The callback checks Shopify's HMAC signature and timestamp, and a
  single-use state that expires in 10 minutes and is bound to the browser
  (cookie), the signed-in user, the business and the shop. The user's
  `integrations.manage` permission is re-checked at the callback.
- **Tokens**: expiring offline tokens (`expiring=1`, 60-minute access, 90-day
  refresh). Both are stored AES-256-GCM encrypted with the connection ID as
  associated data. Refresh happens automatically before expiry or after a 401,
  under a short database lease so two workers never spend the same (rotating)
  refresh token. A rejected refresh marks the store **Needs reconnecting**.
- **"Connected" means verified**: the status turns active only after a real
  API call with the new token succeeds (enforced by a database constraint).
- **Sync**: products, variants and inventory (all pages), then orders updated in
  the last 60 days, with line items linked to products and fulfillments with
  every tracking number. Syncs run as background jobs in resumable slices, so no
  single run hits a time limit. Only one sync per store can be queued. Products
  removed in Shopify are marked deleted after a full pass. Untracked inventory
  is stored as "unknown", never as a number. Each sync records counts, status
  and errors.
- **Webhooks** (`/api/webhooks/shopify`): HMAC over the raw body, stored once
  per `X-Shopify-Webhook-Id` (retries are ignored), processed through the job
  queue with retries. Topics: products create/update/delete, inventory levels,
  orders create/updated/cancelled, and `app/uninstalled`. Subscriptions are
  created automatically at the first sync.
- **Privacy webhooks**: `customers/data_request` opens a high-priority support
  ticket telling the merchant what to send; `customers/redact` deletes the
  customer's conversations and leads and erases their details from customers
  and orders (the customer is never re-filled by later syncs); `shop/redact`
  removes anything left from the store.
- **Customer details**: order sync leaves out names and emails until Shopify
  approves the app for protected customer data (`SHOPIFY_CUSTOMER_DATA=approved`
  adds the `read_customers` scope). The Integrations page says which applies.
- **Disconnect / uninstall**: credentials and everything synced from the store
  (products, orders, Shopify customers) are deleted; conversations are kept.
  Uninstalling in Shopify does the same via `app/uninstalled`. **Reconnect**
  and **Sync now** are available.
- **AI product tools** (on when a store is connected and the plan includes
  product questions): `search_products` (published products only),
  `get_product_details` (options, variants, prices) and `check_availability`,
  which re-reads the product from Shopify live (falling back to the last sync,
  and saying so). Availability is reported as in stock / purchasable without
  tracking / purchasable with no stock on hand / sold out / unknown, never a
  guess. Order questions still get "not available in chat yet" (Phase 4 adds
  customer verification first).
- **Job runner**: handlers can continue in slices; a run drains the queue
  within a time budget and then triggers itself again if work remains, instead
  of waiting for the daily cron.

## 2. Files created or modified

New: `src/lib/shopify/{oauth,config,mappers,client,sync,jobs,actions}.ts`,
`src/lib/ai/product-tools.ts`, `src/lib/jobs/drain.ts`,
`src/app/api/shopify/{install,callback}/route.ts`,
`src/app/api/webhooks/shopify/route.ts`,
`src/components/integrations/shopify-forms.tsx`,
`src/lib/shopify/shopify.test.ts`, `supabase/tests/30_phase3.sql`,
`e2e/tests/phase3.spec.ts`, `e2e/stack/fake-shopify.mjs`, migration
`20260926000100_phase3_shopify.sql`.
Updated: job runner and cron route, AI tools/prompt/turn, Integrations page,
onboarding step 5, inbox and preview tool labels, fake OpenAI, e2e stack,
`setup_all.sql`, docs, `.env.example`.

## 3. Database changes

- `shopify_oauth_states.return_to` (must be a path on this site).
- `product_variants.inventory_item_gid` (+ index) for inventory webhooks.
- `fulfillments.tracking` (all tracking numbers/links).
- `shopify_connections.webhooks_registered_at`, `customer_data_enabled`,
  `products_synced`, `orders_synced`.
- Unique index allowing one queued/running sync per store and kind.
- `shopify_credentials.refreshing_until` (token refresh lease).

**Run `supabase/migrations/20260926000100_phase3_shopify.sql` in the Supabase
SQL editor** (the live database already has the earlier migrations).

## 4. Working functionality

Everything in section 1, verified end to end against a local fake Shopify
store that signs its redirects and webhooks exactly like Shopify, and issues
rotating refresh tokens. With real credentials the same code talks to
`https://<shop>.myshopify.com` (the fake-store override is refused on
production deployments).

## 5. Required credentials

- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` (the app's Client ID and secret)
- `ENCRYPTION_KEY` (32 random bytes, base64) — needed before any store connects
- `CRON_SECRET` (already set) — also used to continue long syncs
- Optional: `SHOPIFY_API_VERSION` (default 2026-07), `SHOPIFY_SCOPES`,
  `SHOPIFY_CUSTOMER_DATA=approved` once Shopify approves protected data access

In the Shopify app settings: App URL `https://<your-app>/api/shopify/install`,
redirect URL `https://<your-app>/api/shopify/callback`, and all three
compliance webhooks → `https://<your-app>/api/webhooks/shopify`.

## 6. Tests performed

- `npm test` — 89 unit tests (+24): shop-address normalization and
  rejection, query and webhook HMAC (tampering, wrong secret, reordering),
  timestamp freshness, authorize URL, token exchange/refresh parsing and
  `invalid_grant`, mappers (unsafe links dropped, untracked stock not counted,
  cancelled orders, tracking lists, REST ID → GID), availability wording.
- `npm run test:db` — 14 new SQL checks: active requires validation, one live
  store per business and per shop, domain format, OAuth return path, one
  pending sync per store, members see only their own store data, nobody reads
  credentials or OAuth states, nobody edits synced data directly.
- Playwright — 30 scenarios (+6): connect (with invalid address), full
  sync (products, variants, orders, tracking; no customer details without
  approval; tokens encrypted), AI answers from the catalog with a live stock
  check and hides unpublished products, webhooks (bad signature refused,
  duplicate ignored, inventory update and product deletion applied, unknown
  shop ignored, customer erasure deletes their conversations and details, data
  request opens a ticket), expired token refreshed with rotation, a store can't be
  connected to two businesses, forged callback refused, declined approval
  changes nothing, disconnect deletes store data, reconnect, `app/uninstalled`.
- Typecheck, lint and production build clean.
- Found by these tests and fixed: PostgREST rejects `or=` filters on
  UPDATE/DELETE, which silently broke token refresh; writes now use plain
  filters. Also a disconnect confirmation that disappeared on re-render.

## 7. Remaining limitations

- Customers still can't reach the AI: the storefront widget is Phase 4. Order
  lookup, tracking and returns in chat come with Phase 4–5 (they need customer
  verification first).
- Orders are limited to the last 60 days (Shopify's default without the
  `read_all_orders` approval).
- Names and emails on orders need Shopify's protected customer data approval
  (requested in the Partner Dashboard). Until then orders sync without them.
- `customers/data_request` creates a ticket; the merchant sends the data. An
  automatic export is a later improvement.
- The app is not embedded in Shopify admin; a merchant installing from
  Shopify is sent to Integrations to confirm with one click. App Store
  listing would need the embedded experience and review (Phase 7).
- Very large catalogs sync in slices of ~500 products per run; the first sync
  of tens of thousands of products takes a while.
- One store per business (as the database enforces); multiple stores is an
  Enterprise feature for later.

## 8. Next phase

Phase 4: the storefront chat widget (theme app extension), its public API
with per-shop rate limits, product cards, and secure order verification with
order and tracking tools.

---

# Free plan and self-serve billing report

## 1. Features implemented
- **Landing page**: new hero ("Your Business Never Stops. Neither Should Your AI
  Employee."), a glowing **Start Free** as the main call to action (also in the
  header, visible on mobile), **Explore Plans** smooth-scrolling to pricing,
  and the three Free promises under the buttons. Pricing shows all five plans
  (Free first, "Free Forever"; Growth "Most Popular"; Enterprise "Starting at
  $999"), plus a full feature comparison table.
- **Start Free routing** (`/start`): signed out → sign-up; signed in without a
  business → plan step; with a business → dashboard (paid plan → upgrade page).
  It creates nothing, so repeated clicks can't duplicate anything.
- **Sign-up**: "Your AI Employee Starts Here.", Full name / Business email /
  Password / Confirm password, **Create Free Account**, "No credit card
  required. Your Free plan never expires." A plan picked on the pricing page is
  carried through sign-up and email verification.
- **Choose Your Plan** step after registration: "Welcome to Mairo Assist! /
  Let's get your AI employee ready.", "Start Free. Upgrade Whenever You're
  Ready.", a prominent Free offer with **Continue With Free**, and all five
  plans.
- **Free plan is automatic**: every new business gets exactly one Free
  subscription (database trigger), so there are 100 credits from the start. No
  payment details are asked for.
- **Paid plan during sign-up**: after the business is created (still on Free),
  a confirmation page offers secure checkout or "Continue With Free instead".
  The plan activates only after Stripe confirms payment.
- **Onboarding**: step 7 now runs a real test chat (it previously said this was
  unavailable), and step 8 has **Activate your AI employee** (publishes the
  tested setup and switches it on), then the dashboard.
- **Dashboard**: "Welcome to Mairo Assist!" card with current plan (Free
  Forever), AI credits (e.g. 100 / 100 remaining), the real next reset date and
  **Explore Upgrades**, plus "Unlock More From Your AI Employee." with Starter,
  Growth and Pro cards.
- **Upgrade Plan** button in the dashboard navigation (and header on Free),
  opening a **Plans** page: current plan, credits, reset date, what each plan
  adds over yours, and upgrade / switch / downgrade buttons. **Billing & Usage**
  shows credits, token usage and invoices.
- **Stripe billing**: Checkout for the first purchase, verified activation,
  prorated in-place plan changes that only apply if paid, downgrade at period
  end, Billing Portal, signed and deduplicated webhooks, invoices recorded.
- **Real plan enforcement**: the old "everyone gets Pro during early access"
  rule is gone. Credits, team access (Pro), hand-off to a person (Growth) and
  knowledge base size follow the actual plan.

## 2. Database changes (`20260927000100_free_plan.sql`)
- `subscriptions`: `free` plan and `none` provider allowed; Free ⇔ no provider
  enforced; trigger adds Free for every new business; existing businesses
  backfilled.
- `usage_counters.ai_responses` + `record_ai_response()` (service only) and
  `business_credit_usage()` (members read their own credits).
- `billing_checkouts` (Stripe session ↔ business; server-only).

## 3. Tests
- Unit: 95 (plans, credits and reset dates, Stripe signature and encoding).
- SQL: 11 new checks (one Free subscription per business, no duplicates, Free
  never tied to a provider, credits isolated per business and not writable by
  members, checkout records server-only).
- Integration: each live reply uses one credit; a Free business hands off after
  100 responses.
- Playwright: 37 scenarios, including landing and pricing, the full Free
  sign-up → plan → onboarding → activation → Free dashboard, paid plan from the
  pricing page through a fake Stripe (declined card, then paid; charged only
  after confirmation), cancel at checkout, upgrade from the dashboard with
  settings preserved, in-place switch, downgrade and cancellation webhook,
  forged webhook refused, and mobile layout (Start Free visible, plans stacked
  Free first, no sideways scrolling).

## 4. Limitations
- Customers can't reach the AI yet (the storefront widget is Phase 4), so
  live credits won't be used until then. Preview tests are free.
- Paid plans can be bought only once the Stripe settings are added; until then
  the Plans page says so and nothing is charged.
- Enterprise is arranged by contacting sales (`NEXT_PUBLIC_SALES_EMAIL`).
- Shopify Billing (required for an App Store listing) is still Phase 7.
- Onboarding keeps its existing 8 steps (business, what you sell, goals, name
  your AI, Shopify, policies, test, activate), which cover the 7 steps asked for.

---

# AI employee welcome report

- **When**: once, right after choosing a plan on "Choose Your Plan" (before
  business setup), at `/onboarding/welcome`.
- **What**: the AI employee materializes in the center (electric-blue and
  purple glow, rotating rings, a scan line, drifting particles) while
  "Activating Your AI Employee…" shows for about two seconds. Then "Your New
  Employee Has Officially Joined the Team." and "Available 24/7. Ready to help
  your customers. Powered by Mairo Assist." appear, with the AI's name (or "Your
  AI Employee"), the Free Forever plan card, **Set Up My AI Employee** and
  **Explore All Plans** (an overlay with every plan that leaves Free active).
- **Honest status**: a "Setup in progress — switches on once you finish setting
  up" badge. The AI is only shown as active after onboarding and activation.
- **Once only**: stored on the person's login (`welcome_seen_at` in their
  account metadata) when setup starts, so it follows them across devices and
  never replays. No database migration needed.
- **Skip** at any time. With reduced motion the final state appears
  immediately. It's CSS-driven, so nothing waits on the animation, and it's
  responsive.
- **Tests**: the Free journey watches the full sequence (loading text, then
  the welcome, plan card, plans overlay) and checks it never replays. The paid
  journey checks the reduced-motion version and the "You picked Growth" note.
  Other suites use Skip. 37/37 Playwright scenarios pass.
