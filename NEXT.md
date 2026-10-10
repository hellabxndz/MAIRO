# What's left

Honest running list of what stands between MAIRO and paying customers.
Ordered by what blocks what. Updated as things land.

## Blocking a real launch

**1. Test one live Meta campaign.** The full pipeline — campaign → ad set → ad,
including uploading the picture to Meta — is built but has never talked to the
real Meta API. Launch one campaign on a live ad account at $1/day, leave it
PAUSED, and see what Meta objects to. This is the only way to find out whether
the enum spellings, the `promoted_object` shape and the image upload are right.

Needs first: a connected ad account with a Page picked, an approved creative
with a final picture, and the business's website filled in. The ad is refused
without any of those, on purpose.

**2. Meta App Review.** Still pending. Until it clears, only accounts added as
testers can connect, so nobody outside that list can use the product at all.

**3. Turn billing on.** `BILLING_ENFORCED` is off, so everyone — including
people who have never paid — is treated as a Starter customer. Leave it off
until App Review is through (the submission promises the reviewer full access),
then switch it on.

This is now the switch that makes two other things real, so nothing else needs
changing when it flips: the AI specialists are locked behind a paid plan (the
index, the chat page, and the API, which answers 402), and "choose a plan" is
the first outstanding step on the dashboard checklist. Both are invisible while
the variable is off, by design.

**4. CRON_SECRET — set.** Both crons in `vercel.json` refuse every request
without it — including Vercel's own. Keep it marked **Secret**, not Config.

`/api/cron/launch` fires scheduled campaign starts; until the secret is set, a
campaign booked for Friday 6am starts whenever the customer next opens the
dashboard instead. `/api/cron/review` re-runs safety checks that could not run
at all, which is the only way a creative ever ends up at IN_REVIEW; without the
secret those retry only when the customer opens their creatives page, or when
you press the button on `/aios/creatives`.

Hobby allows **two** crons and no more, so there is no room for a third without
upgrading — and a third would fail the deployment the same silent way an
over-frequent schedule does.

Two things worth knowing about the schedule itself. **Hobby refuses to deploy
a cron that runs more than once a day** — it does not quietly run it less
often, it fails the build with "Hobby accounts are limited to daily cron jobs".
An hourly entry blocked every deployment for days while the last good build
kept serving, which looks exactly like a frozen site with nothing broken. The
schedule is daily for that reason; on Pro it can go back to hourly.

And the granularity is the cron's, not the customer's: the start time is a
floor that Meta also enforces through the ad set's own `start_time`, so a
campaign never begins early — it can begin up to one cron interval late. On
Hobby that interval is a day, so timeliness comes from the dashboard render
path instead, and the cron is only the backstop for someone who books a launch
and then doesn't visit.

**5. Stripe — done.** The site now runs on a new Stripe account (live mode,
restricted `rk_live_` key without payout/transfer access). Starter $149.99,
Growth $239.99 and Scale $499.99 exist as monthly prices, `/aios/setup` shows
all three matching, the customer portal is configured, and the webhook listens
for the four events the route handles. After any future price change, create a
new Price rather than editing one, and point `STRIPE_PRICE_*` at it.

Organizations that went through checkout under the old account carry a
customer id the new key can't see; checkout replaces it automatically.

Studio and Agency have no Stripe prices yet, so they show "Not available yet".

**Billing isn't enforced.** `BILLING_ENFORCED` is unset, so an account with no
plan gets Growth free. Set it to `1` only once the Meta App Review is through.

**6. Old plan rows are cleared on deploy.** PlanConfig overrides the compiled
plans, so rows seeded under the old pricing would have kept the old prices and
limits on every in-app screen. The `meta_only_plan_reset` migration deletes
them, and the code defaults apply. After any *later* pricing change, run
`npm run plans:sync` (prints a diff) and `-- --write` to apply it.

**7. Meta App Review, round 2: the posting permissions.** Scale's Instagram
and Facebook posting need `instagram_basic`, `instagram_content_publish`,
`pages_read_engagement` and `pages_manage_posts`. All are review-gated, so
until they clear only people with a role on the Meta app can post.
`pages_manage_posts` is asked for in its own dialog (the Facebook posts page's
"Allow posting on Facebook"), never in the everyday connect, so round 1 is
unaffected. Before recording round 2, set the review account's organization to
Scale in `/aios/organizations/<id>` — the Social pages are Scale-only, and with
billing off everyone else gets Growth.

**7b. Social Manager is Scale-only and needs an active subscription.** For
the App Review round 2 recording, set the review account to Scale in
`/aios/organizations/<id>` — that now also records it as active, which Social
Manager requires.

**7c. After App Review: put the customer-action question into Create.** The
Mission already asks "What do you want customers to do?" and prefills Create.
The wizard's own first step still uses its existing outcome wording because
its steps are frozen while review is pending.

**8. Payment flow proven — done.** A live trial checkout came back through
the webhook and the account showed Starter on a free trial.

**9. Watch the first real Mairo Decisions.** The rules are tested against
constructed figures (`npm run check:decisions`), not yet against a live
account's. Before anyone switches on AI Assist or Full Autopilot, check the
first week of decisions on a real campaign. Every automatic change is in
Mairo Activity.

**10. `ANTHROPIC_API_KEY` — set.** Powers the Ad Score, Business Analyzer,
Fix with AI, One-Click Fix and the social post captions.

**11. Two switches to flip when the time comes.** `META_POSTING_APPROVED=1`
once Meta approves the posting permissions (round 2) — until then every
Social page, the pricing page and the privacy policy say publishing is
waiting for Meta. `NEXT_PUBLIC_SUPPORT_EMAIL` once a monitored mailbox exists
on a business domain (e.g. on mairo.io); until then the legal pages show the
current Gmail address. Redeploy after either.

**12. Legal review before charging the first customers.** Have a qualified
person check: the exact registered name of the operating company (the pages
say "BLING Marketing"); the missing governing-law/jurisdiction clause in the
Terms; whether "the current month isn't refunded" (on cancelling and on
account deletion) holds where your customers are; the "within 30 days"
backup and log promise — confirm Neon's history retention and Vercel's log
retention on your plans are 30 days or less; and whether the processors list
(Meta, Anthropic, OpenAI, Google, Stripe, Twilio, Neon, Vercel) needs data
processing agreements referenced.

## TikTok (retired)

MAIRO no longer runs TikTok. The `TIKTOK_*` variables in Vercel can be deleted,
and the pending app on TikTok's developer portal can be withdrawn. The enum
value and old tables stay so existing rows still load.

## Smaller, whenever

**8. Google Cloud project** for the Tag Manager API, so MAIRO can install the
tracking tags itself instead of handing over a file. The file works today.

**9. www.mairo.io — connected in Vercel, not switched on yet.** Vercel shows
mairo.io (308 → www.mairo.io) and www.mairo.io (Production) as Valid
Configuration. www is the main address, as Vercel recommends; the app follows
whatever `NEXT_PUBLIC_APP_URL` says. To switch over, in this order, so Facebook
and Google sign-in keep working throughout:

1. Confirm https://www.mairo.io loads with a valid certificate from outside
   Xfinity (phone on mobile data, or ssllabs.com). Xfinity's "Advanced
   Security" flagged the new domain; get it reviewed through Xfinity's report
   form and check VirusTotal before customers or Meta see it.
2. Add the new addresses everywhere that keeps one — `/aios/setup` → "Addresses
   outside services keep" lists each with its exact value once
   `NEXT_PUBLIC_APP_URL` is set; before that they are, on www.mairo.io:
   Meta Valid OAuth Redirect URI `https://www.mairo.io/api/meta/callback`,
   App domains `mairo.io`, privacy/terms/data-deletion links; Google
   redirect URIs `https://www.mairo.io/api/auth/callback/google` and
   `https://www.mairo.io/api/gtm/callback`, origin `https://www.mairo.io`;
   Stripe webhook endpoint `https://www.mairo.io/api/stripe/webhook` (edit the
   URL — that keeps the signing secret). Keep the old `.vercel.app` entries.
3. Vercel → Environment Variables (Production):
   `NEXT_PUBLIC_APP_URL=https://www.mairo.io`. The Facebook and Tag Manager
   return addresses follow it. If `AUTH_URL` or `NEXTAUTH_URL` is set, change
   it to the same or remove it. Redeploy.
4. Check: mairo-three.vercel.app pages redirect to www.mairo.io (API routes
   stay, on purpose), Facebook login and Google sign-in work, and the next
   Stripe event shows as delivered.

Until step 3, keep an eye on `/aios/setup` → "Meta OAuth redirect URI": with
no `NEXT_PUBLIC_APP_URL` it comes from Vercel's production-domain variable,
which may now name mairo.io. If it does, either register it in Meta or pin
`META_REDIRECT_URI=https://mairo-three.vercel.app/api/meta/callback` (and
`GOOGLE_REDIRECT_URI` likewise) until you switch.

Later: a support mailbox on the domain (needs email hosting and MX records) to
replace the Gmail address — set `NEXT_PUBLIC_SUPPORT_EMAIL`.

**11. Two switches to flip when the time comes.** `META_POSTING_APPROVED=1`
once Meta approves the posting permissions (round 2) — until then every
Social page, the pricing page and the privacy policy say publishing is
waiting for Meta. `NEXT_PUBLIC_SUPPORT_EMAIL` once a monitored mailbox exists
on a business domain (e.g. on mairo.io); until then the legal pages show the
current Gmail address. Redeploy after either.

**12. Legal review before charging the first customers.** Have a qualified
person check: the exact registered name of the operating company (the pages
say "BLING Marketing"); the missing governing-law/jurisdiction clause in the
Terms; whether "the current month isn't refunded" (on cancelling and on
account deletion) holds where your customers are; the "within 30 days"
backup and log promise — confirm Neon's history retention and Vercel's log
retention on your plans are 30 days or less; and whether the processors list
(Meta, Anthropic, OpenAI, Google, Stripe, Twilio, Neon, Vercel) needs data
processing agreements referenced.

## TikTok (retired)

MAIRO no longer runs TikTok. The `TIKTOK_*` variables in Vercel can be deleted,
and the pending app on TikTok's developer portal can be withdrawn. The enum
value and old tables stay so existing rows still load.

## Smaller, whenever

**8. Google Cloud project** for the Tag Manager API, so MAIRO can install the
tracking tags itself instead of handing over a file. The file works today.

**9. mairo.io — bought, not connected yet.** In this order, so Facebook and
Google sign-in keep working throughout:

1. Vercel → the project → Settings → Domains: add `mairo.io` and
   `www.mairo.io` (set www to redirect to mairo.io). Vercel shows the DNS
   records to create.
2. At the registrar: create exactly those records (usually an A record for
   `mairo.io` and a CNAME for `www`), or switch the nameservers to Vercel's.
   Wait for both domains to show **Valid Configuration** and a certificate.
3. Before anything points at the new address, add the new copies everywhere
   that keeps one. `/aios/setup` → "Addresses outside services keep" lists
   each with its exact value: Meta's Valid OAuth Redirect URIs, App domains and
   policy links; the Google OAuth client's redirect URIs and origin; Stripe's
   webhook endpoint (edit its URL — that keeps the signing secret). Keep the
   old `.vercel.app` entries until nobody uses them.
4. Vercel → Environment Variables (Production): `NEXT_PUBLIC_APP_URL=https://mairo.io`.
   If `AUTH_URL` or `NEXTAUTH_URL` is set, change it to the same or remove it.
   Leave `META_REDIRECT_URI` and `GOOGLE_REDIRECT_URI` unset — they follow
   the production domain. Redeploy.
5. Check: the `.vercel.app` address now redirects pages to mairo.io (API
   routes are left alone on purpose), Facebook login and Google sign-in work
   from mairo.io, and the next Stripe event shows as delivered.

Only set `NEXT_PUBLIC_APP_URL` after step 2 shows Valid Configuration: once it
is set, the old address sends every visitor to the new one.

Later: a `support@mairo.io` inbox (needs email hosting and MX records) to
replace the Gmail address in `src/lib/legal.ts`.

## Standing caveat

Nothing in this repo has run against live Meta, Google or Anthropic
from the development container — there are no credentials in it. Everything is
verified by construction, by the `npm run check:*` scripts, and against mock
servers. The first real connection to each is where surprises will show up.
