# Running MAIRO: release, rollback, incidents

What to do when shipping, when something breaks, and where to look. Backups and
the restore drill are in [BETA-READINESS-2026-10.md §6](BETA-READINESS-2026-10.md#6-neon-backups).

## Releasing

- **A push to `claude/myro-ad-platform-u3ynfe` deploys production.** It's the
  repository's default branch and Vercel's production branch. Don't push
  anything you haven't checked.
- The build (`vercel-build`) runs, in order: `prisma generate`, the database
  migrations (`scripts/migrate-deploy.mjs`), the Meta contract tests
  (`check:meta-contract` — a critical failure stops the deploy), then `next build`.
  A failed step leaves the previous deployment serving.
- Migrations are written to be additive (new tables and columns, backfills),
  so the previous deployment keeps working against the new schema. A migration
  that drops or renames anything must say so in its commit message, and gets a
  Neon branch taken first (an instant rollback for the data).
- Before pushing: `npx tsc --noEmit -p .`, `npx eslint .`, `npm run audit`
  (every suite, against a local database), `npx next build`. For journey or
  billing changes, also the browser checks:
  `scripts/e2e/journey.mjs` and `scripts/e2e/checkout.mjs` against the fake
  Stripe (see their headers), and `scripts/mobile/audit.mjs`.

## Rolling back

1. **Code**: in Vercel → Deployments, open the last good deployment and
   *Promote to Production* (instant; no rebuild). Then revert the bad commit on
   the branch so the next push doesn't bring it back.
2. **A feature, not the deploy**: Meta features behind flags are switched Off in
   AIOS → Meta Intelligence → Feature Flags; that is their rollback.
3. **The Meta API version**: set `META_GRAPH_API_VERSION` to the previous
   version in Vercel and redeploy. No code change needed (the version lives in
   `src/lib/meta-intelligence/capabilities`).
4. **Data**: restore from Neon point-in-time into a new branch (the drill
   below), check it, then point production at it. Never restore over
   production in place.

Rolling back MAIRO never pauses or changes a customer's campaigns on Meta.
Anything already live keeps running there.

## When something breaks

| Symptom | Where to look | What to do |
| --- | --- | --- |
| Uptime workflow failed (GitHub email) | Actions → Uptime: which step — the health check (site or database down) or the homepage on mairo.io / www.mairo.io (redirect loop, certificate, DNS) | Health: Vercel status, Neon status, roll back the last deploy. Homepage only: compare Vercel → Domains (which address redirects to which) with `NEXT_PUBLIC_APP_URL` — the app sends pages to that address, so Vercel must not redirect it back the other way. |
| Customers can't pay | AIOS → Setup check (Stripe keys, prices, webhook); Sentry `checkout` errors; Stripe → Developers → Events | A plan with no price configured shows "can't be bought here" and alerts; fix the env var. Webhook failures: Stripe retries for 3 days; the return page also reads the session back, so access isn't lost while you fix it. |
| Meta connection failures | AIOS → Meta Intelligence → Errors ("whose problem": Meta's side, the customer's connection, or MAIRO) | Meta's side: wait; MAIRO pauses only the failing kind of action and tells customers. Customer side: they reconnect from the notice they see. MAIRO side: a developer looks — it's a refused request. |
| Meta changed something | AIOS → Meta Intelligence → Overview (changelog check freshness, updates, confirmed impact) | Review the update, confirm whether it affects MAIRO, fix through the pipeline (tests → approval → normal deploy). |
| Jobs not running | AIOS → Customers (failed and stuck runs); the changelog check's "Checked …" time | The two daily crons (`vercel.json`) need `CRON_SECRET` set in Vercel. Re-run from AIOS where offered. |
| Errors in general | Sentry (`SENTRY_DSN`), Vercel → Logs | Tokens and secrets are scrubbed before reporting; don't paste raw request URLs from logs into tickets. |

## Monitoring that runs on its own

- **Uptime** (`.github/workflows/uptime.yml`, every 10 minutes): `/api/health`
  (site and database), and the homepage on both mairo.io and www.mairo.io with
  at most 5 redirects, so a redirect loop, an expired certificate or a broken
  DNS record fails it. A failure emails whoever last changed the file.
- **Daily crons** (`vercel.json`): `/api/cron/launch` at 09:00 UTC (approved
  campaigns go live once Meta can run them) and `/api/cron/review` at 09:30 UTC
  (results, recommendations, Meta changelog check, error and operation sweeps).
  Vercel's Hobby plan allows one run a day each; the changelog check's "stale"
  threshold (36 hours) allows for that.
- **Errors**: Sentry, when `SENTRY_DSN` is set. Without it, errors only reach
  Vercel's logs.

## Things only a person can verify

These are never done by automated tests:

- A real Stripe test-mode purchase of each plan (Stripe dashboard in test mode,
  card 4242…), then the same in live mode with a real card you refund.
- Connecting a real Meta account, choosing an ad account, Page and Pixel.
- Launching one campaign at the minimum budget on a real ad account, watching
  it through Meta's review to delivering, then pausing it from MAIRO and
  confirming in Ads Manager that it's paused.
