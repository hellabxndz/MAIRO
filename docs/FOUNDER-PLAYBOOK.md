# MAIRO founder playbook: first market, first 10 pilots, 30/60/90

MAIRO is an AI agency for Facebook and Instagram ads. The goal is to be very good at one painful job first: a business owner hands over their website, and their ads get made, launched with their approval and improved from real results. Every number below is either measured in AIOS or marked **unknown** with how to measure it.

## 1. Where to measure

AIOS → Growth → **The funnel** (last 30 days), counts only, no personal data:

| Step | Event | Recorded in |
|---|---|---|
| Landing views | `hero_view` | browser, once per visitor per day |
| First ads started (website entered) | `preview_start` | browser |
| First ads shown | `preview_complete` | browser |
| Accounts created with their plan | `plan_created` | `lib/actions/start-actions.ts`, `strategy-actions.ts` |
| Plans approved | `plan_approved` | same |
| Checkout started | `checkout_start` | `lib/billing/checkout.ts` |
| Subscribed | `checkout_success` | `lib/stripe/apply-subscription.ts` (Stripe says live) |
| Meta connected | `meta_connected` | `lib/meta/connection.ts` |
| Purchase tracking verified (shops only) | `tracking_ready` | `lib/tracking/measurement-store.ts` (Meta verified a Purchase) |
| First launch approved | `launch_approved` | `lib/campaigns/approval.ts` |
| First campaign live on Meta | `first_launch` | `lib/campaigns/auto-launch.ts` |
| First result reported by Meta | `first_result` | `lib/dashboard/console.ts` |
| First follow-up test approved | `next_test_approved` | `lib/actions/decision-actions.ts` |

Below the funnel, AIOS shows **median time to first ad** (seconds, same visitor), **sign-up → first live campaign** and **sign-up → first result** (hours/days), and 30-day paid retention. Business-level steps are recorded once per business. The "shops only" step is skipped when comparing the steps after it, so lead businesses don't read as a leak.

Not yet instrumented (measure by hand during the pilot):
- **Acquisition source and customer type segmentation:** unknown. Record per pilot in the sheet below; add `utm_source` capture to sign-up next.
- **Subscription gross margin after AI generation and support:** unknown. Per pilot account, record AI image credits used (Creative Studio), Anthropic usage (Anthropic console, per day), and founder support minutes.
- **Weekly active customers with a live, measurable campaign** (the operating metric): count businesses with `first_launch` whose campaign reported spend in the last 7 days and has measurement (verified purchase tracking for shops; lead form or calls for lead gen). Count it weekly from AIOS → Customers until it's a tile.

## 2. First market: start with ecommerce, keep local lead-gen open

Hypothesis: **online stores with an established offer, usable product photos, existing traffic, and $1,000–$5,000 a month they're willing to spend on Meta.** Why: MAIRO's strongest verified loop is ecommerce. It reads the store, uses its own product imagery, verifies purchase tracking before launch, and judges ads on cost per purchase and ROAS. That's measurable inside 14 days at this budget.

The data is **unknown**. MAIRO doesn't yet have enough signups or pilots to confirm this. Revise after 10 pilots using time to first live campaign, % reaching a verified result in 30 days, and retention by segment. Local lead-gen (calls, Meta lead forms) is already supported and can't fail on tracking, so it's the likely second segment, or the first if stores keep stalling at purchase-tracking setup.

## 3. Founder-led pilot: the first 10 businesses

**Who qualifies**
- Sells online on Shopify, WooCommerce or similar, with checkout on its own site.
- Has 5+ product photos it owns, and at least one offer or best seller.
- Admin of its Meta Business, ad account and Facebook Page, with a payment method on the ad account.
- Willing to spend $30–$150 a day for 30 days and set a Meta account spending limit.
- Can get a Purchase event into Meta (Shopify's Meta channel counts), or will let you help set it up.
- Disqualify: no owned imagery, a restricted category (health claims, finance, housing — Special Ad Categories), or someone who wants guaranteed results.

**How to find them:** your own network and local business groups first. Then store owners already spending on Meta (the Meta Ad Library shows who advertises), Shopify communities, and agencies' small clients they turn away. Track the source of every pilot in the sheet.

**What to show on the call (15 minutes)**
1. Type their website into mairo.io and press **See my first ad**. Their first ad, with their own picture, appears in seconds.
2. Click **Show me another idea**, and note how the hypothesis and first test change.
3. Show a dashboard with a campaign. Point out the **Right now** box (doing / needs you / results), and on Results the **best ad and next test**, approved from the same screen.
4. Be explicit: ads run in *their* Meta account, nothing launches or raises spend without their approval, and MAIRO's fee is separate from Meta ad spend.

**What you help set up (one 45-minute session):** sign-up and Pro trial, then Meta connection (ad account, Page, Instagram). Then the Pixel and a test purchase until tracking reads **verified**, and the account spending limit. Then the first campaign review and approval, together on screen.

**What to record at 30 days (one row per pilot)**

| Field | Example |
|---|---|
| Business, segment, source | Kiln & Co · store · referral |
| Days: sign-up → Meta connected → tracking verified → first live → first result | 0 / 1 / 3 / 4 / 6 |
| Spend, purchases or leads, cost per result, ROAS (Meta) | $1,240 · 31 · $40 · 2.1× |
| Follow-up tests approved / run | 2 / 2 |
| Founder support minutes | 95 |
| AI cost (credits + model usage) | $14 |
| Still subscribed at day 30? | yes |
| If it failed, why (one of): couldn't connect Meta · tracking never verified · rejected by Meta · no results at budget · owner stopped approving · price · other | — |
| Permission to use as a case study? | yes, figures only |

Case studies use only verified figures from that account, with the owner's written permission.

## 4. Where the funnel leaks today

| Leak | Status |
|---|---|
| Typing a website on the homepage led to a 4-question form before any ad | **Fixed:** goes straight to the first ad, asking only what the site couldn't answer. |
| The free result opened with a strategy document, and the "ads" were text with no picture | **Fixed:** opens with the first ad, using the store's own share image, plus who it's for, why, and the first test. |
| Junk location read from shop pages ("now serving: our winter menu") | **Fixed.** |
| No way to see which ad won, or to approve the next test from results | **Fixed:** Results shows the best ad, the evidence, the data basis, and the next test with Approve. |
| Checkout → Meta connect → tracking → launch | Instrumented now. The conversion rates are **unknown** until real traffic arrives; the expected biggest real-world drop is purchase-tracking verification for stores. |

## 5. 30 / 60 / 90 days

**Days 0–30: prove the first ad sells the service, and run 10 pilots.**
- Exit criteria:
  - 10 pilots signed.
  - ≥7 reach a live campaign.
  - Median sign-up → first live ≤ 3 days.
  - ≥5 reach a first Meta-reported result.
  - Median time to first ad ≤ 20 s.
  - Every pilot has a filled 30-day row.
- Engineering:
  - Capture acquisition source (`utm_source`) on sign-up.
  - Add a weekly-active-measurable tile to AIOS.
  - Make AI-written first ads the default in production, and confirm `ANTHROPIC_API_KEY` there.
  - Fix whatever blocks the most pilots at tracking verification.

**Days 31–60: make results compound.**
- Exit criteria:
  - ≥50% of live pilots approve at least one follow-up test.
  - Weekly report opened by ≥60% of owners.
  - 30-day paid retention among pilots ≥ 60%, measured.
  - Support minutes per account per week trending down, measured.
- Engineering:
  - Record which creative version went live against each Meta ad, and tie the weekly report's "best creative" and "what MAIRO learned" to that history.
  - Feed the creative history into the next batch's brief (Business Brain).
  - Add a concise owner-facing weekly report built from the same verdicts as Results.

**Days 61–90: repeatable growth.**
- Exit criteria:
  - Measured paid retention, gross margin per account and support minutes, by segment.
  - 3 published case studies with permission.
  - One acquisition experiment run on the leakiest measured stage, with a clear read.
  - A decision memo on the first market (confirm stores or switch to local lead-gen).
- Engineering:
  - Referral flow for pilots who saw results.
  - Limited, opt-in automation (already gated per plan) only for accounts with clean reconciliation history.
  - A partner channel (agencies, Shopify experts) only if pilots show retention.

## 6. Next three engineering priorities

1. **Purchase-tracking completion for stores.** The step most likely to block a live campaign. Guided Pixel / Conversions API setup to a verified Purchase, with the test-purchase flow on one screen, measured by `tracking_ready`.
2. **Creative version history tied to Meta ads and results.** Every new version (including the ones the next-test loop builds) gets a stable id linked to the Meta ad id and its results. The weekly report and the next brief read from it. This is the start of the moat: what each business tried, what happened, what to test next.
3. **Acquisition source and margin instrumentation.** `utm_source` on sign-up, AI cost per account, and support minutes, so retention and unit economics can be read by segment before spending on growth.
