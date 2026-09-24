# Architecture

## Why a separate app in this repository

The repository root is the Mairo ad platform (Next.js 16 + Prisma/Neon +
NextAuth, deployed on Vercel from the root). Mairo Assist has a different
database (Supabase), auth system and deployment, and must never be able to
break Mairo. So it is an isolated project in `mairo-assist/`:

- own `package.json` / lockfile / `node_modules`
- `next.config.ts` pins `turbopack.root` and `outputFileTracingRoot` to this folder
- the root `tsconfig.json` and `eslint.config.mjs` exclude `mairo-assist/` (the only change to Mairo)
- deployed as a second Vercel project with Root Directory `mairo-assist`

When the products integrate later (Mairo drives traffic, Mairo Assist converts
it), they should talk through an explicit API between the two services, not a
shared database.

## Modules

| Module | Where | Responsibility |
| --- | --- | --- |
| Authentication | `lib/auth`, `app/(auth)`, `app/auth/*`, `proxy.ts` | Supabase Auth sessions, email verification, password reset, device sessions |
| Businesses / tenancy | `lib/tenancy`, `lib/business`, `lib/team` | Workspaces, membership, roles, permissions, invitations |
| AI | `lib/validation/ai-employee.ts` (config) — engine in Phase 2 | AI employee configuration, versions, tool layer |
| Conversations | tables now, UI in Phase 2 | Inbox, human takeover |
| Shopify | tables now, integration in Phase 3 | OAuth, sync, webhooks, theme app extension |
| Orders | tables now, flows in Phase 4–5 | Verified lookups, approval center |
| Billing | `lib/billing/plans.ts` | Plans, entitlements, usage allowances; providers in Phase 6 |
| Analytics | `lib/analytics` | Aggregation of real events, attribution definitions |

## Multi-tenancy and authorization

Every tenant-owned table has a `business_id`. Authorization is enforced twice:

1. **In the server** — every page calls `requireBusiness(permission)` and every
   Server Action calls `authorize(permission)` before doing anything. The
   permission matrix lives in `lib/tenancy/permissions.ts`:
   - **Owner**: everything, including billing, integrations, team and deletion.
   - **Admin**: day-to-day operations (AI settings, knowledge, approvals,
     analytics). Owners may grant `integrations.manage`. Never billing
     management, team management or deletion.
   - **Support Agent**: inbox, customers, orders, tickets. No settings, billing,
     analytics or approvals.
2. **In the database** — row-level security on every table, via the helper
   functions `is_business_member()` / `has_business_role()`. Writes that need
   invariants (AI status, approvals, audit logs) are revoked from the
   `authenticated` role entirely and only happen through the server. Column-level
   grants stop users from changing system columns even on rows they may edit.

The active business is a cookie *preference*. `getBusinessContext()` only
honours it if the user is a member; a forged cookie falls back to the user's
own business (covered by an e2e test).

Tables holding secrets or system state (`shopify_credentials`,
`shopify_oauth_states`, `order_verifications`, `background_jobs`,
`rate_limits`, `integration_webhooks`, `platform_admins`) have RLS on and **no
policies**, and are revoked from browser-facing roles. Only the service-role
client (`lib/supabase/admin.ts`, server-only) can touch them.

## Identifiers

- Internal IDs: `uuid` (`gen_random_uuid()`).
- Shopify IDs: the GraphQL global ID (`gid://shopify/Product/123`) in a
  `shopify_gid` column, unique per business.

## Security measures in Phase 1

- Supabase Auth with email verification; sessions refreshed in `proxy.ts`;
  identity read from verified JWT claims (`getClaims()`).
- Passwords: 10+ characters with letters and numbers; changing a password
  requires the current one (verified on a throwaway client) and signs out other
  devices; users can list and revoke device sessions.
- Rate limits (Postgres-backed, shared across serverless instances) on sign-up,
  sign-in (per IP and per email), password reset, verification resend and
  password change.
- Open-redirect protection on every post-login/email-link redirect.
- No account enumeration on sign-up or password reset.
- Invitations: 256-bit random tokens, stored only as SHA-256 hashes, single use,
  7-day expiry, bound to the invited email (checked in the database).
- Append-only audit log for administrative actions, written only by the server.
- AES-256-GCM (`lib/security/secrets.ts`) for store tokens, with the row ID as
  associated data so ciphertexts can't be swapped between rows.
- Logs strip emails and token-like strings (`lib/log.ts`).
- Security headers (HSTS, frame denial, nosniff, referrer policy).
- An AI employee cannot be `active` unless a version is published *and* it was
  tested — enforced by a database constraint, not just the UI.

## Background jobs

`background_jobs` is a Postgres queue: `claim_background_jobs()` uses
`FOR UPDATE SKIP LOCKED`, recovers jobs from crashed workers, and
`fail_background_job()` retries with exponential backoff before dead-lettering.
Jobs carry an `idempotency_key`. `/api/cron/jobs` (daily on Vercel Hobby;
more often on Pro) drains it and runs retention. Handlers for Shopify sync and
webhooks register in `lib/jobs/runner.ts` in Phase 3; a job with no handler
fails and dead-letters instead of being silently marked done. Webhooks are
deduplicated on the provider's delivery ID (`integration_webhooks` unique key).

## Billing decision

Merchants will install Mairo Assist as a **Shopify app** (the storefront widget
is a theme app extension). Apps distributed through the Shopify App Store must
charge through **Shopify's Billing API**, so that is the primary provider.
**Stripe** is kept behind the same abstraction for merchants who sign up
directly and are not billed through Shopify (e.g. an off-App-Store custom
distribution or future non-Shopify stores).

A business has exactly one `subscriptions` row with exactly one `provider`, so
it can never be billed twice for the same plan. Until the payment flows are
tested, `BILLING_ENFORCED=false`: nobody is charged, and every business gets Pro
features. Plan prices, features and allowances are defined once in
`lib/billing/plans.ts`.

## AI architecture

```
customer message ─▶ runTurn (lib/ai/turn.ts)
                     ├─ refuses: empty/too long, wrong business or channel
                     ├─ saves the message
                     ├─ silent if a person took over, or the AI is paused
                     ├─ hands to the team if the monthly allowance or conversation cap is hit
                     ├─ builds instructions (lib/ai/prompt.ts) from the published config
                     │   (preview uses the draft) — fixed Rules first, owner text fenced
                     ├─ runAgent (lib/ai/agent.ts) ⇄ provider (OpenAI Responses API, store:false)
                     │     model requests a tool ─▶ executeTool (lib/ai/tools-server.ts)
                     │        validate args (Zod) · check tool is enabled for this business
                     │        · run with the server's business ID · audit row (emails masked)
                     ├─ records usage per request (tokens + estimated cost)
                     └─ saves the reply with its knowledge sources and tools used
```

- **Provider-neutral loop.** `runAgent` only knows the `AiProvider` interface;
  `OpenAIProvider` adapts the Responses API. The key is server-only; the model
  comes from `OPENAI_MODEL`. The SDK retries 429/5xx twice with a 30 s timeout.
- **Tools** (`lib/ai/tools.ts`): `search_knowledge`, `get_business_policy`,
  `escalate_to_human`, `capture_lead`. Each has a strict schema, and the
  backend decides whether a call runs: tools not enabled for the business
  (plan, goals, escalation settings) are refused without executing. No tool
  takes a business ID, reads arbitrary tables, or can change an order.
  Product, inventory and order tools join in Phases 3–4.
- **Preview** runs the same engine against the draft, in a private
  `channel = 'preview'` conversation visible only to the person testing.
  Tools with side effects (escalation, leads) are simulated. A successful
  preview reply sets `tested_at`, which (with a published version) is what the
  database requires before the AI can be switched on.
- **Prompt-injection defenses.** The fixed Rules come first and say that
  customer messages, knowledge passages and tool results are information, not
  instructions. Owner instructions are fenced and subordinate to the Rules.
  Tool results are passed as JSON data. Even if a model were talked into
  requesting something, tool authorization is enforced in code, not in the
  prompt.
- **Failure behaviour.** Provider down → an honest fallback reply and the
  conversation is flagged *needs attention*. Allowance used up or conversation
  too long → a handover message and the team takes over. The AI never answers
  after a person takes over, and never while paused.
- **Knowledge.** Documents are chunked (~1,200 characters with overlap) and
  indexed with Postgres full-text search; `search_knowledge_chunks` matches any
  meaningful word, ranks by relevance, and is scoped to one business. Uploads
  (.txt, .md, .pdf, .docx, ≤ 5 MB) are type-checked by content, text is
  extracted on the server, and only the text is stored. Vector embeddings can be
  added later without changing the tool interface.
- **Human takeover.** Taking over or replying sets `handled_by = 'human'`;
  handing back returns control to the AI. System messages record who joined.
  Resolving a conversation with no human reply counts toward the AI resolution
  rate.

## Data retention and deletion

- `business_settings.conversation_retention_days` (30–3650, default 365) drives
  the daily retention job (`purge_expired_conversations`); preview chats are
  kept 7 days.
- Deleting a business cascades to all of its rows, including audit rows.
- Shopify `customers/redact`, `customers/data_request` and `shop/redact`
  compliance webhooks are implemented with the Shopify integration (Phase 3);
  `customers.redacted_at` and `conversations.content_redacted_at` exist for it.
