# MAIRO as a managed advertising service: audit, October 2026

The request: MAIRO should run a business's Meta advertising the way an agency would — set up and watch tracking, monitor campaigns, recommend and (within permission) make changes, keep the owner informed, and report real results — with a simple customer dashboard and a founder command center.

This audit reads the code as it is on `claude/myro-ad-platform-u3ynfe` (7bf0442) before anything new is built. "Exists" means there is working code and an automated check for it; it does not mean it has been exercised against a live Meta account, which only the owner can do.

## What already exists

| Area | What is there | Where |
|---|---|---|
| Meta connection | OAuth, encrypted tokens, token-expiry detection and alerts, account switching, App Review scope control | `lib/meta/oauth.ts`, `connection.ts`, `token-expiry.ts`, `notifications/detect.ts` |
| Pixel setup | Find, choose or create a Pixel in the customer's ad account; install routes (Shopify app, WordPress, Wix, Squarespace, GTM, MAIRO tag, manual) | `lib/tracking/setup.ts`, `pixel-setup.ts`, `state.ts` |
| Event verification | Per-event counts from Meta (`/{pixel}/stats`): ViewContent, AddToCart, InitiateCheckout, Purchase, Lead, CompleteRegistration, Contact. Purchase value and currency checked. Browser vs server copies counted. Every check is stored (`TrackingVerification`). Nothing is called working without a Meta count. | `lib/tracking/measurement-store.ts` (`verifyMeasurement`), `measurement.ts` |
| Conversions API | Server-side events with hashed identifiers and the browser's event id (deduplication) | `lib/tracking/meta-pixel.ts` (`sendMetaConversions`), `orders.ts`, `tag-relay.ts` |
| Shopify orders | Order webhooks with HMAC validation, recorded once (idempotent), relayed to Meta server-side, consent policy respected | `app/api/orders/[token]`, `lib/tracking/orders.ts` |
| Launch gate | A campaign that needs purchases tracked can't launch until the Pixel is receiving | `lib/tracking/pixel-rules.ts` |
| Daily monitoring | One daily cron: decisions refresh, Coach diagnosis, intelligence, experiments, notifications, weekly/monthly reports, stuck-run sweep, unpaid stop | `app/api/cron/review`, `lib/decisions/run.ts` |
| Recommendations | Rules + engine produce decisions (pause, scale, shift budget, new creative, audience) with evidence, risk, confidence; repeats of failed actions suppressed | `lib/decisions/*`, `lib/engine/*`, `lib/coach/*` |
| Creative fatigue | Detected and notified (`CREATIVE_FATIGUE`) | `lib/intelligence`, `notifications/kinds.ts` |
| Permissions | Three levels — Manual, Assisted, Autopilot — with a closed list of actions; total budget, launches, spending past the ceiling and new platforms always need approval. Ceilings: max daily budget, max shift %, max daily increase/decrease, stop-loss, monthly cap | `lib/automation/levels.ts`, `decisions/guardrails.ts`, `AutoOptimizeSettings`, `SpendProtection` |
| Real Meta actions | Approved or permitted decisions are applied in Meta with a claim (no double apply), operation health checks, and failures recorded on the decision | `lib/decisions/apply.ts` |
| Action history | Every change MAIRO makes or a person approves, automatic or not | `MairoActivity`, `AgentRun`, collaboration trail |
| Approvals | One queue with budget impact and required authorisation | `lib/approvals/queue.ts`, `/dashboard/decisions` |
| Meta ad review | Approved / rejected / with issues, synced and notified | `lib/campaigns/ad-review-sync.ts` |
| Notifications | In-app, plus SMS where configured; per-kind preferences | `lib/notifications/*` |
| Briefs and reports | Daily Brief from records; weekly and monthly reports | `lib/team/brief.ts`, `lib/reports/*` |
| Attribution | Results name their source: Meta, MAIRO counted, You marked, You entered, Your store. Store orders shown but never divided by ad spend. Lead outcomes: reported → qualified → booked → customer | `lib/results/model.ts`, `lib/leads/*` |
| AIOS | Customers, operations (failed runs, Meta write health, decisions waiting), Meta check, Meta intelligence, founder workspace | `app/aios/*` |
| Tenant isolation | Organisation-scoped queries, roles, audit log, isolation suites | `scripts/check-*-db.ts`, `AuditLog` |

## What is missing or incomplete

| # | Gap | Phase | Plan |
|---|---|---|---|
| 1 | **Tracking is verified only when someone presses "check".** Nothing re-verifies on a schedule, so a Pixel that stops receiving events after a theme change goes unnoticed. | 1 | A tracking-health monitor in the daily cron that re-runs the real Meta checks, stores a health state, and notifies on changes. |
| 2 | **No "tracking verified" or "tracking stopped" notification.** | 1 | Two notification kinds, sent on state transitions only (never repeated daily). |
| 3 | **Tracking health isn't on Home.** The owner has to open Account → Pixel. | 1 | One line on Home: Working / Needs attention / Not set up, with the fix. |
| 4 | **AIOS doesn't show tracking health per customer.** | 4 | A column on AIOS → Customers. |
| 5 | **No "pause Autopilot" that keeps the chosen level.** Turning it off today means choosing Manual and re-choosing the level later. The schema already supports it (`AutoOptimizeSettings.enabled`). | 3 | Pause and resume, one tap, from Home and Settings; recorded in the activity history. |
| 6 | **Home doesn't say what MAIRO is allowed to do or has just done.** | 2–3 | "MAIRO is in Approval mode / on Autopilot (paused)", the last actions, and pending approvals on Home. |
| 7 | **Email is used only for password resets.** Important notifications reach the app (and SMS) but not email. | 4 | Email for the notifications an owner must act on, when Resend is configured and the person hasn't turned it off. |
| 8 | **CRM and booking integrations** (HubSpot, Calendly, GoHighLevel, etc.) don't exist. Leads are marked in MAIRO or come from Meta lead forms. | 4 | Requires app registration and OAuth credentials per provider. Not built in this round; listed as external setup. |
| 9 | **Phone-call conversion tracking** doesn't exist (SMS sending exists; call tracking needs a tracking-number provider). | 4 | External setup (Twilio numbers + call webhooks). Not built in this round. |
| 10 | **Shopify app (OAuth)** isn't built; orders arrive by webhook with a per-store token. | 1 | The webhook route works today. A listed Shopify app needs Shopify Partner registration and review: external. |
| 11 | **Scheduling is daily.** Vercel's Hobby plan refuses any cron more frequent than daily, so monitoring runs once a day (and on page load when stale). | 2 | Hourly monitoring needs Vercel Pro (an owner decision). The code paths don't change. |

## Constraints that shape the build

- **No invented data.** Health, briefs and reports are computed from stored records and Meta's own counts. Where a count is missing, it says missing.
- **Nothing reaches Meta in tests.** Every new check runs against the local database with Meta replaced by a stub, as the existing suites do.
- **Migrations:** adding notification kinds and tracking-health columns needs a migration (flagged in the commit and the report). It only adds; nothing is dropped or rewritten.
- **Meta App Review:** `ads_management`, `ads_read` and `business_management` are needed for the actions above; which ones the live app has is on `/aios/setup`. Nothing here asks for a new permission.

## Status after this round (branch `feature/managed-platform`)

### Built and tested (simulated Meta, local database)

| Gap | What now exists | Tests |
|---|---|---|
| 1–2 | Daily tracking-health check (`lib/tracking/monitor.ts`, in `/api/cron/review`): re-reads the Pixel and each chosen event from Meta, stores the verdict on `TrackingProfile`, notifies on change only — `TRACKING_WORKING` (first time, and "working again") and `TRACKING_PROBLEM` (stopped, access lost, permission removed). A day Meta doesn't answer changes nothing. Manual checks on the Pixel page refresh it too. | `check:tracking-health` (21) |
| 3, 6 | Home → "MAIRO is managing": tracking health with its fix, Approval mode / Autopilot / Autopilot paused in plain words, the last actions with who did them, and failed changes shown with a link. | `check:tracking-health`; browser check at 1440 and 390 |
| 4 | AIOS → Customers: tracking health, MAIRO mode and approvals waiting per customer, and a "Tracking problems" count. Read from records; AIOS never calls Meta from that page. | `check:aios` |
| 5 | Pause / resume Autopilot from Home and Settings. Keeps the chosen level; while paused both automatic paths act as Manual. Role-checked (`budget.change`), written to the activity history and the audit log. | `check:tracking-health` |
| 7 | Email copies of the notifications worth acting on, to owners and admins only, when Resend is configured; one switch on the Notifications page. Never lost when an email fails. | `check:notify-email` (6) |

All 101 suites pass; lint, typecheck and the production build are clean.

### Needs the owner (external setup or a decision)

- **Run the migrations on Neon** before (or as) this deploys: `20261210120000_tracking_health` and `20261210130000_notify_email`. Both only add.
- **Email:** set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel (and verify the sending domain in Resend). Until then, notifications stay in the app and SMS, exactly as today.
- **Hourly monitoring:** Vercel Hobby allows daily crons only. On Vercel Pro the review cron can run more often with no code change.
- **Verify with a real account:** the tracking check uses the same Meta calls as the Pixel page (`/{pixel}`, `/{act}/adspixels`, `/{pixel}/stats`). Confirm once on a connected test account (AIOS → Live Meta check shows the Pixel's last fire).

### Not built in this round (and not claimed)

- **CRM and booking integrations** (HubSpot, Calendly, GoHighLevel…): each needs an app registration, OAuth and per-provider webhooks. Leads are still marked in MAIRO or come from Meta lead forms.
- **Phone-call conversion tracking:** needs a call-tracking number provider and its webhooks.
- **A listed Shopify app:** needs Shopify Partner registration and review. Order webhooks (HMAC-validated, deduplicated, relayed through the Conversions API) work today with a per-store link.
- **A daily Morning Brief by email:** the Daily Brief exists in the app from records; emailing it every day was left out on purpose (the weekly report is emailed; the brief would be daily inbox noise). Easy to add if wanted.
