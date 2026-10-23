# MAIRO — mobile responsiveness audit, 23 October 2026

What this covers: every page MAIRO serves, at phone and tablet widths, and the
whole customer journey on a phone — from the homepage's free plan to checkout
and the dashboard. The design and branding were not changed; the fixes are to
layout, sizing and touch targets.

**How it was tested.** Headless Chromium (Playwright) emulating phones —
touch, mobile viewport, device pixel ratio 2 — against a local production
build (`next build` + `next start`) with a local database. Not tested on a
physical iPhone or Android device, and not in Safari's WebKit engine: see
"Not verified" below.

## Pages audited

69 routes, each at 8 widths — **552 page loads** per full run:

- **Public (19):** home, pricing, the free plan (`/preview`, `/preview/example`),
  help (hub and an article), tools (hub and a calculator), a solutions page,
  for-freelancers, privacy, terms, data deletion, sign-in, sign-up,
  forgot/reset password, the classic landing page, and the 404 page.
- **A business that has made its free plan and not paid (5):** `/plan`,
  `/plan/activate`, `/plan/start`, `/billing/return`, `/dashboard`.
- **A paying business with Meta connected and three campaigns (37):** every
  dashboard page — overview, campaigns list and detail, create, creatives and
  suggestions, Creative Studio, Approval Center, analytics, reports and the
  monthly report, leads, coach, AI team and specialists, mission, business,
  tracking, website, Meta, integrations, launch, health, activity,
  notifications, settings and its five sub-pages, billing (change, cancel),
  account, guide, plan, sales setup.
- **AIOS, the owner's console (8).**

Widths: **320, 360, 375, 390, 393, 414, 430** (phones) and **768** (tablet),
portrait; plus landscape (844×390) for the homepage and the dashboard, and
1440 to check desktop wasn't disturbed.

On every load the audit measures: sideways scrolling; anything running past the
screen's edge (outside a deliberate sideways scroller); anything cut off by a
clipping container; form fields under 16px (which make iPhones zoom); and tap
targets under 32px.

## Issues found and fixed

| Where | What was wrong | Fix |
|---|---|---|
| Public top bar, ≤360px | Logo, "Get My Free Plan" and the menu button didn't fit: the **menu button was pushed off the screen**, unreachable, and the button covered the logo | Below 375px the bar's own button steps aside (it's in the menu and directly under the bar in every hero); menu button 44×44; smaller wordmark on phones; `100dvh` menu with safe-area padding |
| Campaigns list (dashboard) | **The page scrolled sideways** (99px at 320): one long campaign name widened the whole list | Root cause, fixed everywhere at once: a grid with no column template (the phone layout of every `grid sm:grid-cols-2`, ~118 of them) now gets one column that can shrink to the screen (`globals.css`, base layer — any `grid-cols-*` still wins) |
| Free plan report, ≤320px | Monthly-budget box cut off its percentages; three cards wider than the screen | Same grid fix, plus `min-w-0` on the budget row |
| Business Brain | A select with long options pushed the page sideways | `max-w-full`; 44px tall on phones |
| Notifications (dashboard) | The panel hung off the left edge on small phones (anchored to the bell, which isn't at the edge) | On phones it opens as a panel above the bottom bar; desktop keeps the dropdown |
| Every form | Fields at 14–15px make iOS zoom in and stay zoomed | On touch screens and screens under 1024px every field is at least 16px (`globals.css`); Help and Tools search boxes set to 16px directly |
| Footer, video controls, headers, back links | Tap targets 16–36px tall | 44px tap areas on phones (footer links, play button, captions button, progress bar, "Read what the video shows", the wordmark link, the dashboard avatar, notifications bell, Ask button, Simple/Advanced, card links, legal-page links, the onboarding header's My account / Sign out, "← Settings") — desktop sizes unchanged |
| Homepage form | "Build My Free AI Ad Plan" wrapped onto two lines at 320; "What you sell" cut off its own text | Slightly tighter button on the narrowest phones; three-line textarea |
| Dashboard bottom bar | Last control could sit under the bar plus the home indicator | Page bottom padding includes `env(safe-area-inset-bottom)` |
| Text | iOS inflates text when a phone turns sideways | `text-size-adjust: 100%` |

Also in this round, as asked: **the Instagram option is gone** from the
homepage's free plan ("Website / No website") and from `/preview`'s form, and
the copy that offered it ("your Instagram") was removed from How it works, the
before/after strip, the example plan and the walkthrough.

Checked and already right: the dashboard has a five-tab bottom bar on phones
and the Settings hub (from the avatar) reaches everything else; the showcase
and campaign tabs are swipeable rows; videos load nothing until near the
screen, phones get the narrow (portrait) encodes (0.7–1.2 MB), autoplay
respects reduced motion, and posters show first; showcase images are sized
responsive images.

## The journey on a phone

`scripts/mobile/journey.mjs`, at **320, 390 and 430** — every screen checked for
sideways scrolling, every key button checked to be on screen and ≥40px tall:

1. Homepage → menu opens and closes
2. "No website" → a sentence → **Build My Free AI Ad Plan**
3. The three questions → submitting empty shows what's missing → answered
4. The plan → **I like it — get started**
5. Sign up
6. Quick start → MAIRO writes the strategy → **Approve and choose my MAIRO plan**
7. **Get Started with Pro** → Stripe Checkout (**simulated**: the local fake
   Stripe, nothing charged) → Pay
8. Back in MAIRO **on the dashboard, not a plan screen** (the known
   payment-flow risk)
9. Connect Meta screen

Also checked at 320: the Create menu, notifications, and the Ask MAIRO
assistant (all open fully on screen); the homepage and the Approval Center in
landscape.

## Results

- Mobile audit (production build): **552 of 552 page loads clean** — no sideways
  scrolling, nothing off screen or cut off, no field under 16px, no page errors.
- Journey: complete at 320, 390 and 430 (12 screens each); after paying, MAIRO
  lands on the dashboard every time.
- Test suites: `npm run audit` — 90 of 90 passed.
- `tsc --noEmit`, `eslint` — clean. `next build` — succeeded.
- Desktop at 1440: homepage, pricing, dashboard and campaigns unchanged.

Re-run any time against a running build:

    npx tsx scripts/mobile/fixtures.ts create     # local database only
    node scripts/mobile/audit.mjs http://localhost:3300 <out dir>
    node scripts/mobile/journey.mjs http://localhost:3300 <out dir> 390

## Not verified

- **No physical device, and not Safari.** Everything above ran in Chromium's
  phone emulation. iOS Safari is WebKit: worth one pass on a real iPhone
  (the free plan, sign-up, checkout and the dashboard) before calling it done.
- **Real Stripe Checkout on a phone** — the journey used the local fake. Stripe's
  own hosted page is responsive, but the return trip should be tried once for
  real on a phone.
- **Meta's connect dialog** — the sandbox can't reach Meta, so only MAIRO's
  screen before it was checked.
- **Performance figures** (Lighthouse/Core Web Vitals on a real network) were
  not measured; the changes here don't add any script or media.
- Some secondary text links are still smaller than 44px (e.g. inline links in
  running text, which WCAG exempts, and links inside AIOS tables).
- The homepage is long on a phone (about 45 screens at 320px) — that's its
  content, not a layout fault, and shortening it would be a redesign.
