# Controlled beta: one pilot business, start to first results

This guide takes one real business from sign-up to MAIRO showing that campaign's
results from Meta. It is the live test that the automated suites can't do.

**Stance for the pilot.** The pilot uses small money that you are watching. A
person approves each launch. Meta's own account spending limit is set as the
hard ceiling.

Status labels used below:

- **VERIFIED LIVE**: seen working in production against a real provider.
- **VERIFIED IN TESTS**: proven by MAIRO's suites (`npm run audit`), browser runs and simulated Stripe and Meta. Real providers weren't involved.
- **NOT VERIFIED**: needs a real account. Doing that is what this walkthrough is for.

## 0. Before the pilot (one-time, you)

| Need | Where | Why |
|---|---|---|
| Deploy approval for the beta branch | You | Production now runs `a8339cc`. The beta fixes are on `beta/controlled-pilot` and include one additive migration (§9). |
| Neon restore point | Neon console → Branches → create from `main` | A rollback point just before that deploy. |
| `RESEND_API_KEY`, `EMAIL_FROM` | Vercel → Production env | Email alerts: Meta rejected an ad, tracking stopped, a payment failed. Without them, alerts appear in the app only. |
| `ANTHROPIC_API_KEY` | Vercel → Production env | Ask MAIRO and plan writing. Without it MAIRO falls back to its rules, and chat is unavailable. |
| Stripe live keys and prices | `/aios/setup` shows mode, prices and webhook, never values | The pilot pays a real subscription, or you comp it. |
| Pilot business's Meta access | Their Business Manager | They must be an admin of the ad account and the Facebook Page. MAIRO's ads permissions have passed App Review, so no tester role is needed. |

## 1. What the pilot business provides

- The website address, and what they sell. MAIRO reads public pages only.
- The goal: leads (calls, forms) or online sales.
- A monthly ad budget they're comfortable losing entirely in a test. Suggested: $10–$20 a day for 7 days.
- Their service area and any rules, for example "no further than 20 miles" or "never mention discounts". These go into the Business Brain in Settings, and MAIRO enforces the radius in code.
- A payment method on the **Meta** ad account. Ad spend is paid to Meta, never through MAIRO.

## 2. Sign up, plan, subscription

1. Sign up at `/preview`. The business answers four questions and gets the free plan. They approve it and choose Pro or Scale.
2. Checkout opens with Pro's 7-day trial, or Scale billed today. After paying they land on `/dashboard/launch`.
3. **Check:** Billing shows the plan. In Stripe there's exactly one subscription, whose metadata includes `organizationId`, and the webhook delivery returned 200.

Status: routing, checkout and duplicate-press protection are **VERIFIED IN TESTS** (browser, simulated Stripe). A live Scale purchase is **VERIFIED LIVE**: you completed one on 29 Oct. A live Pro trial is **NOT VERIFIED**.

## 3. Connect Meta

1. Launch checklist → Connect Meta. Choose the ad account and the Page.
2. **Check:** it says Connected and "nothing was created and nothing was spent", and Ads Manager shows no new objects.
3. **Set the hard ceiling now.** In Ads Manager → Billing & payments → Account spending limit, set the pilot total, for example $150. This is the only limit Meta itself enforces on everything. MAIRO's limits are rules MAIRO applies plus daily checks (§6).

Status: **VERIFIED IN TESTS** (simulated Graph, including declined permissions, no Page, and an expired token). Live connection is **NOT VERIFIED**.

## 4. Tracking

- **Leads to a Meta lead form or a phone call:** no Pixel is needed. Meta counts the leads.
- **Leads to a website form:** a Pixel is optional. Without one, MAIRO counts the leads the owner marks.
- **Online sales:** a purchase campaign **does not launch** until Meta has received a Purchase event. If Meta reports which fields arrived, those purchases must also carry an order value and a currency.
  1. Settings → Pixel. Choose or create the Pixel, then install it (Shopify, Google Tag Manager or the website code).
  2. Place one real test order, refunding it is fine, or send a Purchase from Events Manager → Test events.
  3. Press **Check**. It should read "Receiving purchase events". If it says the value or currency is missing, fix the event and check again.

Status: the rules and the refusals are **VERIFIED IN TESTS** (`check:pixel-setup`, `check:measurement`, `check:controlled-beta`). Live events are **NOT VERIFIED**.

## 5. Campaign, creative, review, approval

1. New campaign. MAIRO builds it from the plan and Business Brain: goal, area, audience, ads and budget.
2. **Review the exact terms on screen:** daily budget, schedule, area and radius, destination, and the ads. Approve the creative.
3. MAIRO builds it on Meta **switched off**. **Check in Ads Manager:** the campaign, ad set and ad exist, all Off, with $0 spend.
4. **Approve the launch.** The approval records exactly what was approved. If anything material changes before it goes live (budget, dates, area, destination), the approval stops covering it. The status says "Changed since you approved — approve again", and it's back in the Approval Center.

Status: build-switched-off, approval binding, re-approval after a change, the double press, cancelling, and Meta refusing a switch-on are all **VERIFIED IN TESTS** (simulated Graph; `check:onboarding-db`, `check:controlled-beta`). A real build is **NOT VERIFIED**.

## 6. Spending controls: what is hard, what is a check

| Control | Enforced by | Hard? |
|---|---|---|
| Account spending limit (§3) | Meta | **Yes.** Meta stops all delivery at it. |
| Each campaign's daily budget | Meta | It's an average. One day can spend up to 75% more, but no more than seven days' worth in a week. |
| Lifetime budget, if chosen | Meta | Yes, for that campaign. |
| "Maximum daily budget" (Autopilot) | MAIRO, before every change it makes | A ceiling on the budgets MAIRO sets. It isn't a cap on Meta's spending. |
| Monthly spend check / no-results check | MAIRO, at least daily and on every visit | No. It warns or pauses, and spend can go past it before the pause lands. |
| Budget increases and launches | MAIRO's approvals | Yes, within MAIRO. Nothing launches or raises spend without a recorded approval. |

Status: MAIRO's checks are **VERIFIED IN TESTS** (`check:autopilot`, `check:decisions`, `check:budget`). Meta's own enforcement is Meta's.

## 7. Launch, review, delivery

1. After approval MAIRO switches it on: the ad first, the campaign last. The statuses are kept apart:
   - **Approved by you — waiting for Meta:** approved; MAIRO is waiting on Meta's review or the account's funding.
   - **Switched on — waiting for Meta's review:** Meta accepted the switch-on.
   - **Under Meta review:** Meta's ad review is running.
   - **Approved by Meta — delivery not confirmed yet** (or **no delivery yet**): the review passed, but Meta hasn't reported impressions.
   - **Running:** Meta reported impressions. Only this one is shown in lime.
   - **Rejected by Meta — see why** or **Needs attention — see why:** opens Meta's reason and the fix.
2. **Check:** Ads Manager matches each step. Within 24 hours it should show In review, then Active or Rejected.
3. Press **Pause everything** once. **Check:** everything is Off in Ads Manager within a minute, and MAIRO confirms which campaigns paused and which, if any, failed.

Status: the states and their order are **VERIFIED IN TESTS**. Live review and delivery are **NOT VERIFIED**.

## 8. Results

- Results shows spend, the result for the goal, cost per result, and revenue and ROAS where measured. Each figure is read from Meta as the page loads, labelled with its source, with a note that Meta can lag a few hours.
- A figure Meta didn't report shows as missing, never $0. When Meta can't be read, the page says so.
- **Check:** after a day of delivery, MAIRO's spend and results for the campaign match Ads Manager for the same dates, within Meta's reporting lag.

Status: the labelling and "missing, not zero" are **VERIFIED IN TESTS** (`check:results`, `check:results-db`). Live figures are **NOT VERIFIED**.

## 9. The beta fixes and their migration

`20261215120000_launch_approval_terms` only adds things. It adds:

- `MairoCampaign.launchApprovalHash`, a nullable text column;
- the `IdempotencyKey` table.

Nothing is dropped, renamed or rewritten, and it passes `check:release-safety`. It runs only on a production build, never on a Preview.

## 10. End the pilot

Pause everything, or let the account spending limit stop it. Download the Results. In Ads Manager, confirm the total spend matches what MAIRO showed.
