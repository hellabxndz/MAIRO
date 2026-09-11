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

**4. Set CRON_SECRET in Vercel.** Scheduled campaign starts depend on the
hourly cron in `vercel.json` hitting `/api/cron/launch`, and that route refuses
every request without the secret — including Vercel's, if the variable is
missing. Until it is set, a campaign booked for Friday 6am starts whenever the
customer next opens the dashboard instead. Mark it **Secret**, not Config.

Two things worth knowing about the schedule itself. On the Hobby plan Vercel
only runs crons once a day, so the hourly entry needs Pro to mean an hour. And
the granularity is the cron's, not the customer's: the start time is a floor
that Meta also enforces through the ad set's own `start_time`, so a campaign
never begins early — it can begin up to one cron interval late.

**5. Create all three new prices in Stripe.** The pricing page now says
$39.99 / $129.99 / $249.99, and `priceMonthly` in src/lib/plans.ts is only what
the customer is *shown* — what they are charged is the Stripe Price behind
`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH` and `STRIPE_PRICE_SCALE`, all of
which still point at the old ones ($49 / $99 / $199). Until new Prices exist
and those three variables point at them, the site advertises one number and
the card is charged another — on every plan, not just one.

Existing subscribers stay on the price they signed up at unless their
subscriptions are migrated, which is a separate decision and a deliberate one.

**6. Meta App Review needs two more permissions.** `instagram_basic` and
`instagram_content_publish` were added to the OAuth scopes for Pro-plan
Instagram posting. Both are review-gated, so until they clear, only accounts
added as testers can post — the rest get a permission error from Meta. Worth
submitting in the same round as the ads permissions rather than after.

**7. Prove the payment flow end to end.** Subscribe → Stripe webhook → plan
changes in the database has never fired with a real event. Worth doing with a
test-mode card before the first customer.

## Needed before selling the TikTok features

**5. TikTok credentials.** `TIKTOK_APP_ID` / `TIKTOK_APP_SECRET` were never set
in production, so TikTok advertising reports itself as unconfigured. Nothing
TikTok-related can be sold until they are.

**6. TikTok ads stop at the ad set.** A TikTok ad needs a video and MAIRO makes
none, so a TikTok campaign gets a campaign and an audience but no ad. The
dashboard says so. Either build video, or keep TikTok to the posting and
organic side.

**7. TikTok posting credentials.** Separate again — `TIKTOK_CLIENT_KEY` /
`TIKTOK_CLIENT_SECRET`, plus TikTok's content audit before anything can post
publicly rather than to drafts.

## Smaller, whenever

**8. Google Cloud project** for the Tag Manager API, so MAIRO can install the
tracking tags itself instead of handing over a file. The file works today.

**9. A real domain.** Set `NEXT_PUBLIC_APP_URL` and the social previews,
sitemap and canonical links all point at it automatically.

## Standing caveat

Nothing in this repo has run against live Meta, TikTok, Google or Anthropic
from the development container — there are no credentials in it. Everything is
verified by construction, by the `npm run check:*` scripts, and against mock
servers. The first real connection to each is where surprises will show up.
