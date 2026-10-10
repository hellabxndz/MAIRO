# What's left

Honest running list of what stands between MAIRO and paying customers.
Ordered by what blocks what. Updated as things land.

## Blocking a real launch

**1. Test one live Meta campaign — done (10 October 2026).** A campaign built
in MAIRO was launched on the owner's live ad account at $1/day, Meta approved
it, and pausing it from MAIRO showed "Paused · confirmed by Meta" with the
campaign Off in Ads Manager. That proves the campaign → ad set → ad pipeline,
the picture upload and pause against the real Meta API. (Earlier the same day,
connecting Meta failed with "URL Blocked" because the return address followed
Vercel's production domain, www.mairo.io; it now follows the address the
visitor is on, and the connection then went through.)

**2. Meta App Review — approved (October 2026).** Any Facebook account can now
connect, not only people with a role on the app. (The posting permissions are
a separate review — item 7.)

**3. Billing is on (10 October 2026).** `BILLING_ENFORCED=1` is set in Vercel
(Production) and deployed. Checked live: an account with no plan sees "Choose a
plan" in its first steps, Create answers "Choose a MAIRO plan to activate your
strategy", the free advertising plan still works, and pausing is never blocked.
Next: one live Starter trial, cancelled inside the 7 days, to see the cancel
flow end to end on the live Stripe account.

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

**Billing is enforced** — see item 3.

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
processing agreements referenced. Also: whether MAIRO is a controller or a
processor for customers' leads and store shoppers (the privacy policy now says
those are "held on your behalf" — confirm that's the right legal footing);
whether the Terms should require customers to have their own lawful basis for
collecting leads and for sending hashed shopper details, IP addresses and
click IDs to Meta; whether the policy needs an international-transfer section
(every processor above is US-based); and which privacy laws (GDPR, UK GDPR,
CCPA/CPRA) apply to where your first customers are, and whether the "Your
rights" section needs to name them.

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

Building the domain's reputation (security filters rate new domains low):
- Google Search Console: add `mairo.io` as a Domain property (DNS TXT record),
  then submit `https://www.mairo.io/sitemap.xml`. Or set
  `GOOGLE_SITE_VERIFICATION` and use the HTML-tag method.
- Meta Business Settings → Brand safety → Domains: add mairo.io and verify it
  (DNS TXT, or set `META_DOMAIN_VERIFICATION`). Needed before ads link to it.
- Until there's a mailbox on the domain, publish "no mail" records so nobody
  can send email pretending to be mairo.io: TXT `@` = `v=spf1 -all` and TXT
  `_dmarc` = `v=DMARC1; p=reject;`. Replace them when email is set up.
- The site already sends HSTS and other security headers and serves
  `/.well-known/security.txt`.

Later: a support mailbox on the domain (needs email hosting and MX records) to
replace the Gmail address — set `NEXT_PUBLIC_SUPPORT_EMAIL`.

## Standing caveat

Nothing in this repo has run against live Meta, Google or Anthropic
from the development container — there are no credentials in it. Everything is
verified by construction, by the `npm run check:*` scripts, and against mock
servers. The first real connection to each is where surprises will show up.
