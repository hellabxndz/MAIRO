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

**4. Set CRON_SECRET in Vercel.** Both crons in `vercel.json` refuse every
request without it — including Vercel's own, if the variable is missing. Mark
it **Secret**, not Config.

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

**5. Point Stripe at the new prices.** The plans are now Starter $149.99,
Growth $239.99 and Scale $499.99 a month. `priceMonthly` in src/lib/plans.ts is only
what the customer is *shown* — what they are charged is the Stripe Price
behind `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH` and `STRIPE_PRICE_SCALE`.
Each must be a $149.99 / $239.99 / $499.99 monthly recurring Price. If the ones in Vercel
are for any other amount, create new Prices in Stripe (Product catalog → the
plan → Add another price) and paste their `price_…` ids into those three
variables, then redeploy. Until they match, the site advertises one number and
the card is charged another.

Existing subscribers stay on the price they signed up at unless their
subscriptions are migrated, which is a separate decision and a deliberate one.

**6. Old plan rows are cleared on deploy.** PlanConfig overrides the compiled
plans, so rows seeded under the old pricing would have kept the old prices and
limits on every in-app screen. The `meta_only_plan_reset` migration deletes
them, and the code defaults apply. After any *later* pricing change, run
`npm run plans:sync` (prints a diff) and `-- --write` to apply it.

**7. Meta App Review needs two more permissions.** `instagram_basic` and
`instagram_content_publish` are needed for Scale-plan Instagram posting. Both are review-gated, so until they clear, only accounts
added as testers can post — the rest get a permission error from Meta. Worth
submitting in the same round as the ads permissions rather than after.

**8. Prove the payment flow end to end.** Subscribe → Stripe webhook → plan
changes in the database has never fired with a real event. Worth doing with a
test-mode card before the first customer.

## TikTok (retired)

MAIRO no longer runs TikTok. The `TIKTOK_*` variables in Vercel can be deleted,
and the pending app on TikTok's developer portal can be withdrawn. The enum
value and old tables stay so existing rows still load.

## Smaller, whenever

**8. Google Cloud project** for the Tag Manager API, so MAIRO can install the
tracking tags itself instead of handing over a file. The file works today.

**9. A real domain.** Set `NEXT_PUBLIC_APP_URL` and the social previews,
sitemap and canonical links all point at it automatically.

## Standing caveat

Nothing in this repo has run against live Meta, Google or Anthropic
from the development container — there are no credentials in it. Everything is
verified by construction, by the `npm run check:*` scripts, and against mock
servers. The first real connection to each is where surprises will show up.
