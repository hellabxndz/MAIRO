# MAIRO — paid beta readiness, 22 October 2026

What this covers: the Stripe checkout loop, and the beta blockers left after
the [October audit](LAUNCH-AUDIT-2026-10.md). Nothing in this work touched
production. No real card was charged, no ad was launched, no customer was
contacted, and no secret value was read or printed.

**Two kinds of evidence, kept apart throughout:**

- **Simulated:** automated checks against the real code and database, with
  Stripe and Meta replaced by in-memory fakes.
- **Not verified:** anything that needs the production environment, Stripe
  itself or Meta itself. This sandbox can't reach www.mairo.io or
  api.stripe.com (the proxy refuses both).

## 1. The checkout redirect loop

### Root cause (from the code; production itself couldn't be observed)

There were three separate faults. Together they look like "I pressed pay and
ended up back on the activation page".

1. **The plan buttons never started a checkout.** On `/plan/activate`, "Get
   Started with Pro" and "Start Scaling with MAIRO" were links to
   `/plan/activate?skip=1&tier=…`. That is the same page again, showing a
   summary card. Only a second button on that card ("Continue to Payment")
   opened Stripe. From the customer's side, pressing the plan's button
   reloaded the activation page.
2. **"This plan can't be bought here yet"** is shown only when
   `purchasableTiers()` leaves the plan out. It does that only when that
   plan's price variable is empty on the running deployment. For Scale, that
   variable is `STRIPE_PRICE_SCALE_V2`.
   - **The code side:** the page showed a grey sentence with no way forward and
     told nobody.
   - **The config side:** that variable isn't set on Vercel's Production
     environment. It may be missing, set only for Preview, or set without a
     redeploy afterwards. The owner's setup page hid this too: it showed an
     unset sold plan as a neutral "NOT SOLD".
3. **The return from Stripe trusted the webhook alone.** Stripe sent the
   customer back to `/plan/activate?subscribed=1`. That page then refreshed
   every 4 seconds, forever, until a webhook updated the database. If the
   webhook never arrived (wrong `STRIPE_WEBHOOK_SECRET`, wrong endpoint, or a
   test-mode endpoint receiving live events), a paying customer stayed on the
   activation page indefinitely.

Two smaller faults:

- The cancel URL left out `skip=1`. A customer who cancelled before connecting
  Meta came back to a page with no plans on it.
- Stripe error messages meant for the operator ("Check STRIPE_SECRET_KEY…")
  were shown to customers.

### Fix

- **One press opens Stripe.** Each plan card is now the checkout button.
- **Each plan buys its own price, or says it can't.** A plan whose price isn't
  configured shows that it can't be bought right now and that nothing was
  charged. It never falls back to the other plan's price. The page reports
  this to error tracking, so the operator finds out before the customer does.
- **Errors are explicit, and the button becomes "Retry checkout".** The
  customer sees a short reason plus a reference code (for example
  `stripe_config` or `plan_unavailable`). The operator's detail goes to the
  server logs and Sentry: which variable is wrong, and which mode the key is in.
- **No duplicate sessions:**
  - repeated presses reuse the open session for that plan;
  - choosing the other plan expires the first one, so Pro and Scale can't both
    be paid in two tabs;
  - each create carries a Stripe idempotency key, for presses that arrive at
    the same moment;
  - the button is disabled while the request is in flight.
- **The return is checked with Stripe, not trusted.** Stripe now returns
  customers to `/billing/return?session_id=…`. That page:
  - reads the Checkout Session from Stripe with the secret key;
  - checks it belongs to the signed-in business (the session's organization id
    and the Stripe customer on file);
  - records the subscription with the same code the webhook uses;
  - unlocks only when Stripe reports `active` or `trialing`;
  - sends the customer on to the approved plan → `/dashboard/launch`.

  The other outcomes each say what happened:
  - expired;
  - not finished;
  - declined;
  - still processing (checks again for about 40 seconds, then says so);
  - "paid, but the price matches no plan" (tells them not to pay again);
  - not this account's session.

  A session that is merely `open` (the customer typed the success URL by hand)
  unlocks nothing.
- The webhook still runs. Both paths write the same state and send one
  welcome notice.
- Pro still carries `trial_period_days: 7`. Scale sends no trial field and
  bills at once.
- `/billing/return` is outside `/dashboard`, so the "unpaid → plans" redirect
  can't catch it. The proxy doesn't run on it or on `/api/stripe/webhook`.
  Unpaid users reach the plans, checkout, Stripe and the return page.
  Protected pages still require `active` or `trialing`.

### Tests (simulated Stripe)

`npm run check:checkout` runs 27 checks covering all 15 scenarios in the
brief:

- Pro checkout, Scale checkout, Pro trial, Scale billed immediately;
- config errors and missing price ids;
- auth redirects, success return, failed checkout, user cancels;
- webhook confirmation, duplicate attempts, activation;
- returning active users, onboarding preserved.

The existing `check:plans-v2`, `check:payment-gate` and `check:funnel` still
pass.

### Browser test (simulated Stripe)

`scripts/e2e/checkout.mjs` drives Chromium against a production build. That
build is pointed at `scripts/e2e/fake-stripe.mjs`, a local stand-in for
Stripe's API and Checkout page. The app honours `STRIPE_FAKE_API` only with an
`sk_test_` key. All 5 steps pass:

- signed out → sign in, and back;
- Pro: one press → checkout for Pro's price, 7 days free → pay →
  `/dashboard/launch` → can't be sent back to the plans → billing shows Pro;
- Scale: one press → Scale's price, due today → pay → `/dashboard/launch`;
- cancel → back on the plans with a working button. Typing the success URL for
  the unpaid session shows "Checkout wasn't finished" with **Retry checkout**,
  and the dashboard stays locked;
- pressing again reuses the open checkout.

The fake sends no webhook, so these runs also prove the return page unlocks on
its own.

Also checked by hand in the browser:

- **Stripe unreachable:** "Stripe didn't respond in time. Nothing was charged.",
  reference `stripe_unavailable`, and the button becomes **Retry checkout**.
- **`STRIPE_PRICE_SCALE_V2` unset:** Scale's card says it can't be bought right
  now. Pro still sells, and the server log names the missing variable.

While running these, one more trap turned up and was fixed: a paying customer
who hadn't connected Meta was redirected away from `/dashboard/billing`, so they
couldn't manage or cancel their plan.

**A real Stripe test-mode purchase has not been made.** It is still
unverified; see §2.

## 2. Stripe readiness

What is in the code:

| Item | State |
|---|---|
| Pro $139/mo, 7-day trial; Scale $299/mo, no trial | From `lib/plans.ts`; checkout reads the trial from the plan |
| Price ids | `STRIPE_PRICE_PRO`, `STRIPE_PRICE_SCALE_V2`. Earlier plans' ids stay mapped for their subscribers |
| Webhook | Signature verified on the raw body. Re-reads the live subscription. Idempotent. Ignores stale events |
| Entitlement | Only `active`/`trialing` unlocks a free-plan account. A trial ending unpaid stops execution |
| Second subscription | Refused while one is live. A declined (`incomplete`) one is replaced |

**Open decision (not changed):** a business that cancels during its Pro trial
and checks out again gets another 7 days free. Turning that off would mean
"no trial if the business has had a subscription before" (`canceledAt` or
`hasPaid` set), along with a change to the trial copy. It's a pricing decision,
so it's left to you.

**Do this in Vercel → Settings → Environment Variables → Production.** Then
redeploy, because variables only reach a new build.

1. `STRIPE_SECRET_KEY`: `sk_live_…` for real customers, `sk_test_…` for a
   rehearsal.
2. `STRIPE_PRICE_PRO`: a **recurring, monthly, $139** price created **in the
   same mode as the key**.
3. `STRIPE_PRICE_SCALE_V2`: a recurring, monthly, $299 price, in the same mode.
   **This is the one blocking Scale.**
4. `STRIPE_WEBHOOK_SECRET`: the signing secret of a webhook endpoint at
   `https://www.mairo.io/api/stripe/webhook`, created in the same mode. Its
   events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. `NEXT_PUBLIC_APP_URL=https://www.mairo.io`. It sets Stripe's return address.
   Unset, it falls back to Vercel's production domain, which works but goes
   through the apex redirect.
6. `BILLING_ENFORCED=1`. It matters only for accounts older than the free plan.
   Free-plan sign-ups always need a subscription.

**Then check it without exposing anything.** Signed in as the owner, open
`/aios/setup`. It shows:

- the key's mode;
- each price read back from Stripe (amount, interval, found or not);
- a red **MISSING — CAN'T BE BOUGHT** on a sold plan with no price;
- whether each variable is set. It never shows a value.

**Real test-mode rehearsal (manual).** Use a Preview deployment with test keys,
or production while it still has test keys and no real customers:

1. Sign up a fresh account, build and approve the free plan, skip Meta.
2. Press **Get Started with Pro**. Stripe Checkout should open, showing "7 days
   free" and then $139/month.
3. Pay with `4242 4242 4242 4242`. You should land on `/dashboard/launch`, not
   the plans. Billing should show Pro, trialing.
4. In Stripe: the subscription has metadata `organizationId`, the webhook
   delivery shows 200, and there is one subscription.
5. Second account: **Start Scaling with MAIRO**. Stripe should show $299 due
   today with no trial. Pay, and you should reach the dashboard. Billing shows
   Scale, active.
6. Third account: use `4000 0000 0000 0002` (declined). You should stay on
   Stripe with the card error. Then cancel: you're back on the plans with
   "checkout cancelled" and a working button.
7. Press a plan button twice quickly. Stripe should show only one open session
   for that customer.
8. Temporarily break `STRIPE_WEBHOOK_SECRET` on Preview and buy again. The
   return page should still unlock, because it confirms with Stripe directly.
   Restore the secret afterwards.

Only after this passes is the checkout verified for real.

## 3. Meta readiness

There were no code changes this round; the audit's findings stand. The spend
gates were re-read:

- **Built paused.** The campaign, ad set and ad are created `PAUSED`
  (`createCampaign(…activate: false)` is the only caller).
- **Nothing goes live without a person's approval.** Auto-launch only switches
  on campaigns with `launchApprovedAt` set (a person pressed Approve or Launch),
  claimed atomically, one campaign at a time when scoped. While
  `autoLaunchHeld` is set (it is after activation), the spend agreement ticked
  during building does not count as approval.
- **Meta must confirm the account can be charged.** If the funding check is
  unknown, nothing launches.
- **Paused when payment fails.** A trial that ends unpaid or a declined renewal
  stops execution and pauses MAIRO's campaigns (`stopUnpaidExecution`).
  **Cancelling** the plan does not pause running Meta campaigns. That is stated
  to the customer before they cancel.
- **Review status:** the daily `review` cron reads each campaign's status from
  Meta. A campaign that Meta rejects or disables is recorded as such, and the
  customer is told.

**Manual real-account checklist** (a Meta test ad account, or a real one with a
$1/day budget, with you watching):

1. Connect Meta. The ad account should show **Connected**, "nothing was created
   and nothing was spent", and no new objects in Ads Manager.
2. Build the first campaign without approving. In Ads Manager, the campaign, ad
   set and ad should exist, all **Off/Paused**, with spend $0.
3. Wait for the 09:00 UTC launch cron, or reload the dashboard. It should stay
   paused, with "waiting for your approval" in the Approval Center.
4. Approve, with the budget at $1/day. Only that campaign should switch on in
   Ads Manager: the ad first, the campaign last.
5. Watch it move from In review to Active (or Rejected) on MAIRO's next review
   run.
6. Press **Pause everything**. Everything should be Off in Ads Manager within a
   minute, with a confirmation in MAIRO.
7. Raise the budget in MAIRO. It should ask for approval and show the new daily
   total before anything changes in Meta.
8. Disconnect, or let the token expire. MAIRO should say it can't reach the
   account, and nothing else should change in Meta.
9. Delete the test campaign in Ads Manager. Verify the spend in Billing &
   payments. Expected: at most a few dollars.

## 4. Security

**TOKEN_ENCRYPTION_KEY (critical until confirmed).** It can't be read from
here. Check it on `/aios/setup`: Environment → Token encryption key should say
**SET**. If it says MISSING, Meta tokens are stored in plain text: treat that as
a launch blocker.

1. Generate a key with `openssl rand -base64 32`.
2. Store a copy in a password manager. Losing it makes every stored token
   unreadable.
3. Add it to Production and redeploy.
4. Back up the database (§6).
5. Run `npx tsx scripts/encrypt-stored-secrets.ts` against production. It
   reports counts only and changes nothing. Then run it again with `--apply`.

Only tokens that are written again get encrypted automatically. The script
handles the ones that never are:

- Meta, GTM and TikTok tokens;
- the Shopify signing secret.

Each write is checked to decrypt back to the original before it is saved, and
the script never prints a value. Tested locally: 36 tokens were encrypted, then
restored byte for byte.

**Password reset.** The flow exists: emailed one-use links, valid for an hour,
stored only as a hash, rate-limited. To switch it on:

- `RESEND_API_KEY`;
- `EMAIL_FROM` on a domain verified in Resend.

Without them, the page tells people to email support.

New in this round: **a reset signs every other session out.** Each session
token now carries a stamp of the password it was issued under, checked on every
server-side session read. One side effect when this deploys: sessions issued
before it have no stamp, so **everyone signs in once more**. That was chosen
over leaving those sessions impossible to revoke for up to 30 days. The proxy
can't check stamps (it runs without the database), but every page and action
can, so a stale cookie reaches nothing. This is covered in
`check:password-reset` (12 checks).

**Dependency advisories:** 13 now (6 moderate, 7 high). Advisories published
since the audit raised the count above 8.

- **Fixed:** `brace-expansion` (high, dev-only) via `npm audit fix`, with no
  breaking changes.
- **`undici` / `@fastify/busboy` (high).** These come from `openai` (an optional
  transport) and the AI SDK's `provider-utils`. The SDK uses `undici` only to
  download a URL given to it as a model input. MAIRO sends images as bytes,
  except two calls that pass our own Blob URLs. Neither is an
  attacker-controlled server, so neither advisory (decompression bomb, request
  smuggling) is reachable. The fix needs `ai@7` and `@ai-sdk/*@4`, a major
  upgrade with API changes. Plan it as its own change with the AI suites.
- **`eslint-config-next` chain (`micromatch`/`braces`/`fast-glob`, high).**
  Development only; never shipped. npm's suggested "fix" is a downgrade to
  Next 14's config, so don't apply it.
- **`@ai-sdk/*` moderates:** the same `undici` path; fixed by the same upgrade.

**Error tracking and uptime:**

- Sentry is wired in already: server errors, client errors, checkout failures,
  and cron check-ins for `launch` and `review`. Set `SENTRY_DSN` (Sentry →
  Project → Client Keys) in Production and redeploy. Then set an alert rule:
  any new issue → email.
- **Uptime (new endpoint):** `GET /api/health` returns 200 `{"ok":true}`, or 503
  if the database doesn't answer within 4 seconds. Point an uptime monitor at
  `https://www.mairo.io/api/health` every 1–5 minutes, with alerts to email or
  phone. Better Stack, UptimeRobot or Sentry Uptime all work. Add a second
  monitor on `https://www.mairo.io/` for the page itself.

## 5. Recommendations (not implemented — need your approval)

### Count only active campaigns toward Pro's 15

**Today, creating a campaign** counts every campaign that isn't archived:
drafts, paused and finished ones included (`campaign-actions.ts`). **Launching**
already counts only live ones (`auto-launch.ts`). So a Pro customer with 15
paused campaigns can't create a 16th, even though nothing is running.

**Proposal.** Count campaigns that can spend toward the limit: any platform
campaign that is `ACTIVE`, or `PENDING_REVIEW` with launch approval. Apply the
same count at create, approve, resume and auto-launch, all through one helper.

Abuse safeguards:

1. **Resume and approve check the limit too.** Otherwise someone could create
   paused campaigns freely and switch them all on. Auto-launch already does;
   `protection/run.ts` and the decision-approval resume path would get the same
   check.
2. **A ceiling on total campaigns** (for example 3× the plan's limit, so 45 on
   Pro), so a script can't create thousands of Meta objects.
3. **No limit bypass by quick toggling.** The check runs inside the same claim
   that switches a campaign on.
4. **Downgrades never pause anything.** Campaigns over the new limit keep
   running, but no new ones start. That matches the current billing copy.

### AI credits renewing on the billing anniversary

**Today:** credits reset on the 1st of each calendar month (UTC)
(`creative-studio/credits.ts`, `currentMonthKey`). Someone who subscribes on the
28th gets a full allowance and then another one 3 days later.

**Proposal.** Key the ledger to the subscription period instead of the calendar
month. The period start comes from Stripe's `current_period_start`, which the
webhook already receives; store it next to `currentPeriodEnd`. This needs a
**migration**: one nullable `currentPeriodStart` column.

How each case would work:

- **Trial:** the trial is one period, with Pro's full allowance (as now).
- **Upgrade (Pro→Scale):** immediately gets Scale's allowance minus what was
  already used this period. The period doesn't reset, matching how Stripe
  prorates.
- **Downgrade:** takes effect at the next period, as Stripe applies it. No
  clawback of what was used.
- **Cancel:** credits work until the period ends.
- **Failed payment:** credits stop when the plan stops (as now).
- **Stripe changes** (billing-anchor change, pause): follow
  `current_period_start` from the next webhook.

**Rollout without changing anyone's entitlement mid-month.** Existing
subscribers keep the calendar month until their next renewal, then switch. New
subscribers start on their anniversary.

## 6. Neon backups

The database can't be seen from here; the local database is a plain Postgres.
To check in Neon's console:

- **History retention** (Project → Settings → Storage): at least 7 days. This
  is what point-in-time restore relies on.
- Note the production branch's name and compute size.

**Non-destructive restore drill** (about 15 minutes; production is never
touched):

1. In Neon, create a branch from production **at a timestamp** from an hour
   ago. This is point-in-time restore into a new branch.
2. Copy its connection string. Don't put it in Vercel.
3. Locally:
   - run `psql "<branch url>" -c 'select count(*) from "Organization"'`;
   - compare with the production count;
   - spot-check the newest `Organization.createdAt`. It should be at or before
     the chosen time.
4. Run the app against the branch: `DATABASE_URL=<branch url> npm run dev`.
   Sign in with a known account and look at its plan and campaigns. Read only.
5. Delete the branch.

Also keep a logical backup off Neon:

- `pg_dump --format=custom "<prod url>" > mairo-YYYY-MM-DD.dump`, weekly, kept
  somewhere private. Restoring it into a new branch with `pg_restore` is the
  same drill.
- Before running `encrypt-stored-secrets.ts --apply` or any migration, take a
  Neon branch first. It costs nothing and is an instant rollback.
