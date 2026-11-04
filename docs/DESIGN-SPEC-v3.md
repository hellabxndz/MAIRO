# MAIRO design language, v3: "Signal"

One idea runs through the whole product. MAIRO reads a business the way an instrument reads a field: quietly, precisely, and in black and white. A single line of neon lime appears only where MAIRO is actually doing something. Everything else steps back.

This replaces the v2 cinematic layer (electric blue, the particle sphere, glass with blue edges, uppercase display type). Nothing functional changes: routes, APIs, Stripe, Meta, campaign logic, tracking and permissions are untouched.

## 1. Principles

1. **Feeling over content.** Fewer sections, fewer words, more space. Each screen has one thing to say.
2. **Monochrome by default.** Near-black and white carry the whole design. There are no gradients, coloured glows or decorative colour.
3. **The signal is lime, and it is rare.** Neon lime means MAIRO is working or something is live. It never decorates.
4. **One form.** The Field (§5) is MAIRO's only illustration. No spheres, planets, robots or dashboard screenshots used as decoration.
5. **Real or labelled.** Anything that isn't the account's own data is marked as an example of a fictional business.
6. **Fast and calm.** Motion explains a change of state and then stops. Under reduced motion there is none.

## 2. Colour

| Token | Value | Use |
|---|---|---|
| `--v3-ink` | `#050505` | page background (near-black) |
| `--v3-ink-2` | `#0d0d0d` | raised surfaces |
| `--v3-line` | `rgba(255,255,255,0.10)` | hairlines, borders |
| `--v3-line-strong` | `rgba(255,255,255,0.22)` | focus-adjacent borders, hover |
| `--v3-text` | `#ffffff` | primary text |
| `--v3-text-2` | `rgba(255,255,255,0.62)` | secondary text |
| `--v3-text-3` | `rgba(255,255,255,0.40)` | labels, metadata |
| `--v3-signal` | `#d4ff3a` | neon lime: the signal (see rules) |
| `--v3-signal-ink` | `#0a0a0a` | text on lime |

Where the signal may appear:

- the Field's scan line;
- live and working status dots;
- the keyboard focus ring;
- the active navigation marker;
- the MAIRO core while it works.

Never more than one or two lime elements on screen at once, and never as a fill larger than a button.

Warnings (amber) and errors (red) remain for safety-relevant states only, at low saturation.

## 3. Typography

- **Family:** the existing brand sans (`brandFont`) for everything, and a mono (`font-mono`) for indices and labels only.
- **Display:** sentence case, weight 600, tracking −0.055em, leading 0.92. The homepage hero is `clamp(52px, 16vw, 72px)` on phones and `clamp(72px, 11vw, 200px)` from 640px; section titles are `clamp(40px, 6vw, 96px)`.
- **App titles:** `clamp(30px, 4.4vw, 48px)`, weight 600, tracking −0.04em, leading 1.02 (`PageHeader` and the section pages).
- **Body:** 16–18px, weight 400, leading 1.55, `--v3-text-2`.
- **Labels:** mono 11–12px, uppercase, tracking 0.18em, `--v3-text-3`, with numbered indices ("01 — Analyze").
- No uppercase display type and no gradient text.
- Short display headlines carry no full stop, lime or white (November 2026).

## 4. Space, layout and components

- **Grid:** 12 columns with a 1320px max width. Gutters are 20px on phones, 40px on tablets and 64px on desktop.
- **Section rhythm:** 160–220px between homepage sections on desktop, 96–120px on phones.
- **Surfaces:** `--v3-ink-2` with a 1px `--v3-line` border and 20–28px radius. No blur and no shadows except one soft drop under floating panels.
- **Buttons:**
  - Primary is solid white with ink text and is fully rounded, 52–56px tall on the website and 44px in the app.
  - Secondary is a hairline outline.
  - The lime button appears once per screen at most, for "working"/"live" contexts only.
- **Inputs:** 56px tall, hairline border, 16px text (no zoom on phones). Focus shows a 2px lime ring.
- **Status:** a small dot plus a word. The dot is lime for live or working, white at 40% for idle or paused, amber for "needs you".
- **Example labels:** the mono label "EXAMPLE · FICTIONAL BUSINESS" sits on every sample.

## 5. The Field: MAIRO's form

The Field is a surface of fine white lines drawn by thousands of particles (WebGL2, `components/cinematic`), slowly undulating, with one lime scan line passing through it. It reads like an instrument, not a planet. The cursor bends it slightly.

| Shape | Meaning | Where |
|---|---|---|
| `ribbon` | a twisted band of lines; MAIRO at rest | homepage hero, closing, app |
| `field` | a flat, undulating plane being scanned; MAIRO analysing | "Analyze" step, app analyzing |
| `creative` | the lines settle into an ad frame | "Create" step, app generating |
| `results` | columns rising | "Track" step |
| `network` | campaigns connected | app building |

Rules:
- White particles; the lime scan line is the only colour.
- Density: 16k particles on desktop, 7k on phones, 3k on weak devices; 30 fps on weak hardware.
- It stops off-screen and in background tabs.
- Under reduced motion it renders still frames; without WebGL2 it shows a still SVG of the ribbon.

## 6. Motion

- **Easing:** `cubic-bezier(0.22, 1, 0.36, 1)`.
- **Durations:**
  - micro: 160ms;
  - UI: 240–320ms;
  - text reveals: 700–900ms;
  - Field morphs: about 1.2s.
- **Text reveals:** a line rises 16px and fades in, staggered 60ms per line, once only.
- **Field:** morphs on scroll; drift is always on but slow; the scan line moves about one screen width every 16s.
- **App:** a page enters with 6px rise and fade over 320ms; figures count up over 900ms the first time.
- **The MAIRO core** moves only for real operations (see `lib/cinematic/activity.ts`).
- **Reduced motion:** no transforms, no count-ups, no scan; final states only.

## 7. Homepage

1. **Hero:** headline "Your ads, handled" (no full stop), one line of explanation, a website input with "Build my free plan" (→ `/preview?website=`), and a note: free, no card, nothing launches without approval. The Field behind it.
2. **How it works:** three numbered steps (Analyze, Create, Track) beside a sticky Field that morphs `field` → `creative` → `results`.
3. **Demonstration:** an example ad being made (prompt → picture → headline), then the example's results. Both are labelled as a fictional business.
4. **Pricing:** Pro $139.99 and Scale $299.99, from `lib/plans` only, with a link to full pricing.
5. **Closing:** "Start with your website" and the input again.
6. **Footer:** legal, privacy, security, help, solutions and status, all accessible but quiet.

## 8. App workspace

- **Navigation:** Home, Campaigns, Creatives, Results, plus **Ask MAIRO** (⌘K / Ctrl+K from anywhere, and a sidebar button). Account sits behind the profile button.
- **Sidebar:** near-black, white labels; the active item has a lime marker. No icons in colour.
- **Home:** greeting, the MAIRO core (ribbon), the question box, one next step, the summary, approvals and campaigns.
- **Contextual, not in the navigation:** pixel and tracking, Meta connection, billing, business settings, the AI specialists' activity, all approvals and advanced analytics. They live in Account, in flows, and as "More".
- **Phones:** a four-tab bottom bar, Ask MAIRO in the top bar, safe areas, and no horizontal scrolling.

## 9. v3.1: the same Signal, pushed further (November 2026)

Same identity, nothing new to learn: black and white, one lime, huge type, the Field. What changed is that the page now answers the visitor and shows the product working.

**Audit of v3, and what was elevated.** The hero's type was strong but the Field only decorated it. "How it works" was abstract shapes with no product in it. The site never showed the one thing MAIRO is — one AI managing a business. There was no sense of progress while scrolling, and phones lost the call to action after the hero.

1. **Hero.**
   - The headline lines rise out of their own masks, like a title card.
   - A live readout beside the label ("● MAIRO / Reading your business → Making your ads → Running them on Meta → Reporting what worked") says what MAIRO does in four beats.
   - Typing a website does two things: the readout says "Reading lumenskin.com…", and the Field quickens with the lime scan sweeping it (`FIELD_EVENT`). Nothing is sent until the button is pressed.
   - A scroll cue sits at the bottom: a drop of lime running down a hairline.
2. **How it works.**
   - A lime progress rail across the three steps.
   - An example readout card beside the Field for each step (what MAIRO read, the ad it made, the 30-day figures), labelled "Example".
3. **One MAIRO** (new, the "wow" scene).
   - A framed MAIRO window plays a conversation once as it scrolls in: "I want more customers." → typing → an answer from figures that says what it can't see → a change prepared for approval, inside the 20-mile rule → status chips (tracking, budget against its maximum, Autopilot) → the ⌘K box.
   - Labelled "Example · fictional business"; the buttons are inert.
4. **Control band** (new). Four statements at display size — You approve every dollar / Your own Meta account / Inside your limits / Pause any time — each brightening as it's read. Trust, said as loudly as the headline.
5. **Conversion.**
   - A lime scroll-progress hairline.
   - On phones, a sticky "Build my free plan" bar between the hero's box and the closing one.
   - The CTA arrow nudges on hover.

**Rules kept.**
- Every animation lives inside `prefers-reduced-motion: no-preference`; under reduced motion everything shows in its final state (`.v3-beat`).
- No new dependencies. About +12 KB of JavaScript (uncompressed) on the homepage.
- Every sample is labelled; no figure is presented as a customer's.
