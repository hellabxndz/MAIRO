# MAIRO pre-launch audit — October 2026

Branch `claude/myro-ad-platform-u3ynfe`. Audit commits: `8a3feb4`, `15a15a1`, `aa8772f`, `997ee95`, `0d29861`, `1ac8c99`.

> **Update, 22 October:** the checkout redirect loop and the remaining beta blockers are covered in [BETA-READINESS-2026-10.md](BETA-READINESS-2026-10.md).

## Verdict: READY FOR CONTROLLED BETA, not for public launch

The product does what it says in every flow that could be exercised here, and this audit fixed the problems it found. Two things that matter most to a paying customer have still not been seen working end to end on the new plans:

1. A MAIRO Pro or MAIRO Scale purchase through Stripe.
2. A campaign that MAIRO built, switched on, and Meta approved, in a real ad account.

Until both have been done once, by you, in a controlled way (see "Manual validation" below), take a small number of known customers you can talk to. Don't open the doors to the public yet.

## How this was tested

- **Local production build** (`next build` + `next start`) on Postgres, with Meta, Stripe and AI simulated. The AI was replaced by fixtures. Nothing was sent to Meta or Stripe, nothing was spent, and no real customer data was used.
- **Automated suites:** `npm run audit` passes all 86 suites, including two new ones: `check:password-reset` and the extended `check:onboarding-db`.
- **TypeScript and lint:** both clean.
- **Browser runs (Playwright):**
  - the free plan → feedback → sign-up → confirm → approve → choose a plan journey: 35/35 checks;
  - sign-in throttling;
  - password reset: 14/14 checks;
  - a public-site crawl: 43 pages at phone width, 0 problems after fixes;
  - every dashboard page as an unpaid account and as a Pro trial account.
- **Production was not reachable from here.** The live site, the Vercel dashboard, Stripe and Meta were all blocked by the network policy. Anything marked NOT TESTED below needs the manual steps.

## Results by feature

| Area | Feature | Result | Evidence / note |
| --- | --- | --- | --- |
| Plans | Exactly two plans on sale: Pro $139 with a 7-day trial, Scale $299 with no trial | PASS | `check:plans-v2`, `check:pricing`, `check:entitlements`; crawl of /pricing |
| Plans | Pro limits: 1 ad account, 50 image credits, up to 15 campaigns | PASS (code) | Entitlements suites. The campaign count includes drafts and paused campaigns. The spec says "active or pending". This is a product decision; see Remaining issues. |
| Plans | Scale: 3 businesses, 200 credits, unlimited campaigns, team | PASS (code) | `check:plans-v2`, `check:members` |
| Stripe | Checkout, trial, upgrade/downgrade, cancel, failed payment, webhook signature, duplicate events | PASS (simulated) / **NOT TESTED live** | Simulated by `check:payment-gate` and `check:trust-db`. No Pro/Scale checkout has been bought on Stripe, in test or live mode. |
| Stripe | Existing subscribers on earlier plans | PASS (code) | Legacy prices still match in the webhook; no records changed |
| Social | Organic Instagram/Facebook posting removed; ads on Instagram kept | PASS | `check:social*`, `check:ads`; scopes reduced to the four advertising permissions |
| Journey | Free plan → feedback → account → confirm → approve → choose plan | PASS | Browser, 35 checks |
| Journey | Payment → connect Meta → build → approve → launch | PASS (simulated) / **NOT TESTED live** | `check:onboarding-db` (27 checks against a simulated Meta) |
| Meta | OAuth, ad account choice, token expiry warnings, reconnect | PASS (simulated) | `check:hardening-db`, `check:onboarding-db` |
| Meta | Builds campaigns switched off; nothing goes live without a recorded approval and a live funding check | PASS (simulated) | `check:onboarding-db`, `check:decision-claim`, `check:payment-gate` |
| Meta | "Live" only when Meta confirms delivery | **FAIL → fixed** | Was called live once Meta accepted the switch-on. Now reads Meta's ad review back first (`1ac8c99`). |
| Meta | Error explanations (expired token, rate limit, permission) | **FAIL → fixed** | Codes were misclassified; fixed in `15a15a1` |
| Meta | Live publishing to a real ad account | **NOT TESTED** | Needs the manual check below |
| Dashboard | Real data only; empty states for new accounts | PASS | Every page walked as unpaid and as Pro: no invented numbers |
| Dashboard | Plan shown in Settings for an unpaid account | **FAIL → fixed** | Showed the legacy $239.99 plan as if it were theirs (`0d29861`) |
| Specialists | Eight specialists, honest statuses, every action needs approval | PASS (suites, fixtures) | AI replies were fixtures, not live model calls |
| Creative | AI images | **NOT TESTED live** | Needs OPENAI_API_KEY and Blob storage; suites only |
| Creative | No AI-video claims | PASS | AI video is listed as unavailable; no page claims it |
| Security | Sign-in throttling | **FAIL → fixed** | There was no limit at all. Now 10 attempts per account and 30 per visitor per 15 minutes (`aa8772f`). |
| Security | Password reset | **FAIL → fixed** | Didn't exist. Added in `997ee95`; email delivery needs a provider. |
| Security | Cron endpoints need the secret | PASS | Both return 401 without it |
| Security | Tenant isolation, roles, webhook signatures | PASS (suites) | `check:members`, `check:trust-db`, `check:decision-claim` |
| Security | Dependency vulnerabilities | PARTIAL | Next.js upgraded to 16.3.8 (`8a3feb4`). 8 remain (2 high) in `@fastify/busboy`/`undici` via `openai@7` and `@ai-sdk`; the only fix is a breaking upgrade. |
| Website | Titles, descriptions, one h1, alt text, links, phone width | PASS after fixes | /pricing had no h1; legal titles said "MAIRO" twice (`0d29861`) |
| Reliability | Error pages | PASS after fix | Added a root-level error page (`0d29861`) |
| Reliability | Error monitoring | **ADDED — needs SENTRY_DSN** | Server errors, browser crashes, failed cron steps, Stripe webhook failures, and missed or failed cron runs are reported to Sentry, scrubbed first. Tested against a local fake Sentry; never against real Sentry. Uptime checks are set up in Sentry's dashboard. |
| Reliability | Database backups | **NOT TESTED** | Neon's backup and restore have not been checked |

## Problems found and fixed

| Problem | Fix | Files | Commit |
| --- | --- | --- | --- |
| Next.js had published security advisories | Upgraded to 16.3.8 | `package.json`, `package-lock.json` | `8a3feb4` |
| Organic posting code, scopes and copy were still present | Removed. Ads kept. The Scale feature list and the privacy and terms wording were updated. | `src/lib/social/access.ts`, `src/lib/meta/oauth.ts`, `src/app/api/cron/launch/route.ts`, `src/app/privacy/page.tsx`, `src/app/terms/page.tsx`, … | `15a15a1` |
| Meta errors were misclassified: rate limits and permissions came out as the wrong message | Classified by Meta's error code | `src/lib/meta/performance.ts` | `15a15a1` |
| No limit on password guesses | Throttle in the credentials provider, stored as hashes (no email or IP stored) | `src/lib/login-throttle.ts`, `src/lib/auth.ts`, `src/lib/actions/auth-actions.ts` | `aa8772f` |
| The usage-counter table grew without limit | The daily review cron deletes counters older than 3 days | `src/app/api/cron/review/route.ts` | `aa8772f` |
| No way to reset a forgotten password | One-use, one-hour links stored as hashes; 3 requests an hour per account; same answer whether or not the account exists. Without an email provider, the page sends people to support. | `src/lib/password-reset.ts`, `src/lib/email/send.ts`, `src/app/(auth)/forgot-password/`, `src/app/(auth)/reset-password/`, migration `20261121120000_password_reset` | `997ee95` |
| Settings told an unpaid account it was on "$239.99/month" and that "nothing is charged" | Shows "No plan yet"; a price appears only for a real subscription | `src/app/dashboard/settings/billing-section.tsx` | `0d29861` |
| A campaign was called "live" before Meta's review approved its ad | MAIRO reads Meta's review back after switching on, and says "live" only for ACTIVE ads | `src/lib/campaigns/auto-launch.ts`, `src/app/dashboard/launch/page.tsx`, `src/app/dashboard/page.tsx`, `src/lib/onboarding/launch.ts`, `src/components/decisions/launch-approve.tsx` | `1ac8c99` |
| /pricing had no h1; legal page titles repeated "MAIRO"; no root error page | Fixed | `src/app/pricing/page.tsx`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`, `src/app/data-deletion/page.tsx`, `src/app/global-error.tsx` | `0d29861` |

## Remaining issues

1. **Stripe Pro/Scale never purchased** (blocker; see the manual steps).
2. **No real-account launch on the new flow** (blocker; see the manual steps).
3. **Error monitoring is built but off until `SENTRY_DSN` is set.** Until then, a failing cron or checkout only reaches the Vercel logs. *Set it before public launch.*
4. **No transactional email provider configured.** Until RESEND_API_KEY and EMAIL_FROM are set, password resets go through support by hand. *Recommended before beta; required before public launch.*
5. **A password reset doesn't sign out other sessions.** Sessions are 30-day JWTs, so someone already signed in stays signed in. Optional for beta.
6. **Dependency advisories** in `@fastify/busboy`/`undici` (via `openai@7`, `@ai-sdk`). These are reachable only through outbound AI calls, not public uploads, but they should be upgraded.
7. **Product decisions to confirm:**
   - Pro's 15-campaign limit counts drafts and paused campaigns, not just active and pending ones.
   - Image credits reset each UTC calendar month, not each billing period.
8. **Meta tokens last 60 days.** Owners are warned a week ahead and must reconnect.
9. **Configuration I couldn't verify in production:** `TOKEN_ENCRYPTION_KEY` (without it Meta tokens are stored unencrypted), `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE_V2`, and `BILLING_ENFORCED=1`. NEXT.md records it as set since 10 October.

## Readiness

**Stripe — conditionally ready.** The code paths are tested in simulation and an earlier live Starter trial came back through the webhook (NEXT.md item 8). Pro and Scale haven't been bought.

**Meta — conditionally ready.**
- App Review is approved for the advertising permissions (NEXT.md item 2).
- Campaigns are built switched off.
- Launch needs a recorded approval and a live funding check, and is now called live only on Meta's say-so.
- A real end-to-end launch on the new flow hasn't been observed.

**Security — ready for a beta.** Login throttling and password reset are now in place; isolation, roles, webhooks and crons are covered by suites. Before public launch, add monitoring and set the email provider.

## Blockers vs optional

**Blockers for public launch:** remaining issues 1–4 and confirming the config in item 9.

**Optional:** remaining issues 5–8.

## Manual validation (do these yourself; none were done here)

1. **Stripe test mode.** With test keys and test prices on a preview deployment:
   - buy Pro with card 4242…: the trial shows, the webhook sets PRO/trialing;
   - upgrade to Scale: no trial, the limits change;
   - cancel: access lasts to the period end;
   - use card 4000 0000 0000 0341 for a failed renewal: past_due shows, ads are not stopped until the rule says so;
   - resend a webhook event from the Stripe dashboard and confirm nothing changes twice.
2. **Stripe live, once.** Buy Pro with your own card and cancel inside the trial. Confirm no charge, and that cancel looks right everywhere.
3. **Meta, no spend.** On your own ad account, with a card on file:
   - let MAIRO build the first campaign and confirm it appears in Ads Manager **paused**;
   - before approving, set the campaign's daily budget in Ads Manager to the minimum, or approve and pause it within minutes;
   - confirm MAIRO says "switched on — Meta is reviewing" first and "live" only once Ads Manager shows the ad Active;
   - then pause from MAIRO and confirm it pauses in Ads Manager.
4. **Meta app dashboard.** Remove the organic posting permissions (`pages_manage_posts`, `instagram_content_publish` and the like) from the app's requested permissions, so the consent screen matches the reduced scopes.
5. **Email.** Set RESEND_API_KEY and EMAIL_FROM on a domain verified in Resend. Request a reset to your own inbox, use the link, confirm it can't be used twice.
6. **Monitoring.**
   - Create a Sentry project (platform: Next.js) and set `SENTRY_DSN` in Vercel (Production).
   - After the next 09:00/09:30 UTC runs, confirm the monitors `cron-launch` and `cron-review` appear under Crons, and set their alert rules.
   - In Sentry, add uptime checks on `/` and `/sign-in`.
   - Set an alert rule for new issues to email you.
7. **Backups.** In Neon, confirm point-in-time restore is on and do one test restore to a branch.
8. **Legal.** Have the privacy policy and terms re-read. They now say MAIRO doesn't post to Pages or Instagram profiles, and they list Resend only when it's configured.

## Deployment note

Pushing this branch deploys it on Vercel. The audit commits above were pushed under the existing auto-push arrangement, so they may already be live. One database migration runs on deploy: `20261121120000_password_reset` adds the `PasswordReset` table. It's additive, and no existing data changes. No customer data was touched; every test account was local and deleted.

## Recommendation: can you take paying customers today?

**Yes, a few — as a controlled beta.** Take customers you know, and tell them it's early. Do manual steps 1–3 first (about an hour), and set the email provider. Don't advertise publicly until monitoring is in place and one real campaign has gone through the full flow and been reported correctly.
