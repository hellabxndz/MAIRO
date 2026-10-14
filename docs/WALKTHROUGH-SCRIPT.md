# The MAIRO demo — script and storyboard

A 73-second product walkthrough in seven scenes, on one invented business
(Brightwater Plumbing). It plays on the landing page as an interactive player
(`src/components/walkthrough/`) and as rendered MP4 files
(`public/walkthrough/walkthrough-{wide,narrow}.mp4`), both drawn from the same
components at the same times (`src/lib/demo/walkthrough.ts`).

**Status: captioned, not narrated.** The narration below is written and timed,
and it is the caption track (`public/walkthrough/walkthrough.vtt`) word for
word. No voice is recorded and no music is used, because no licensed voice or
music is available to this project yet. The player says "No voice-over yet —
captions carry the script", and the video files are silent. Nothing presents
the demo as narrated until a recording exists.

Every figure is sample data, and the frame carries "Product demo — sample data"
throughout. The ad concepts are words and a direction for the picture — the
placement previews say "Illustration — your picture or video goes here" — not
AI-generated photographs or video.

## How it's made

- **MAIRO's own screens, not drawings of them.** Each scene renders the real
  component, inert, driven by the demo's clock: the free plan form
  (`FreePlanForm` with `demo`), the website read (`ScanProgressView`), what
  MAIRO discovered and the objective (`Discovered`, `GoalFieldset`), the plan
  (`PlanView`), the concept cards with their Facebook feed, Instagram feed and
  Story mock-ups (`ConceptCard` with `demo`), and the approvals and overview
  screens (`DemoFrame` + `DemoScreen`, the dashboard's console panels). When
  the product changes, the demo changes with it.
- **A cursor that finds its targets.** `WALK_CURSOR` names targets ("the
  button reading Save concept", a selector) rather than coordinates; the stage
  finds them in the rendered screen and moves between them, with a press and a
  ripple on each click. On a phone, targets that aren't drawn (the plan's
  section list) are skipped.
- **A camera that frames each moment.** `WALK_CAMERA` says what to look at and
  how close; the stage eases between framings and never shows past the screen's
  edges.
- **Look:** night background `#07080D`, panels `#111426`/`#151B36`, violet
  `#7952FF` and blue `#356CFF` light. Motion typography for the intro ("Meet
  MAIRO.") and the end screen.
- **Two compositions:** wide 16:9 (960 × 540, rendered at 1440 × 810) and phone
  9:16 (360 × 640, rendered at 540 × 960). On a phone the same screens reflow
  through their container queries, as the app does.

## Storyboard and narration

| # | Time | Scene | What's on screen | Narration (= captions) | On-screen text |
|---|------|-------|------------------|------------------------|----------------|
| 1 | 0:00–0:08 | Intro and request | The MAIRO wordmark; "Meet MAIRO." resolves from wide letter-spacing; "Your AI advertising team." Then the free plan form: the cursor clicks the website field, the sample site is typed, "More enquiries & leads" is chosen, and "See Your Free Plan" is pressed. | "Advertising your business shouldn't mean learning another complicated dashboard." / "Meet MAIRO, your AI advertising team. Start with your website, or a few words about your business." | Meet MAIRO. · Your AI advertising team. |
| 2 | 0:08–0:18 | Analysis | "MAIRO is reading brightwater-plumbing.example": home page, other pages (1–3 of 3), links, report. Then "Here's what MAIRO found": business, products and services, audience, likely goal — each saying it came from the website — and the missing Meta pixel as an opportunity. The owner confirms the objective (Leads) and presses "Build my free plan". | "MAIRO reads your website and shows what it found, and where it found it." / "You confirm what matters: your offer, your area, and what you want from your ads." | 02 · MAIRO reads your business |
| 3 | 0:18–0:28 | Free plan | The plan, in the console: the header ("Not launched · nothing spent"), the four glance tiles, then — following the cursor down the section list — the recommended objective, the Meta campaign strategy, the budget allocation (an example amount, labelled), and why MAIRO recommends each part. | "Then MAIRO builds your free advertising plan: the objective, the audience and the budget." / "Every recommendation comes with the reason behind it, and nothing is spent to see it." | 03 · Your free plan |
| 4 | 0:28–0:42 | Creative concepts | Three concepts, one marked "Test this first". The camera moves in on it: Instagram feed preview; "Edit headline", a new headline typed, "Done"; Instagram Story preview; "Save concept". Then back out to all three. | "Three creative concepts, written for your business, with the one to test first." / "Preview them where they'd run, and make the words your own." / "Save the concept you want to test first." | 04 · Creative concepts |
| 5 | 0:42–0:52 | Review and approval | The Approvals screen: the launch review with the ad, $20 a day, Facebook + Instagram, who sees it and where people go. The cursor presses "Approve launch · $20/day"; it becomes "Approved by you" and "Waiting for Meta's review" — it runs only once Meta approves. | "With a subscription, MAIRO builds the campaign in your own Meta ad account." / "Nothing launches, and nothing is spent, until you approve it." | 05 · Review and approve |
| 6 | 0:52–1:05 | Results and a recommendation | The Overview: money spent, value (empty until leads are marked), leads and cost per lead — each saying where it comes from — the 14-day chart, then the AI Action Center: "Ask which area the job is in", from the Audience Agent, with what it does to spending, waiting for approval. | "Follow your results in one place: what Meta reports, kept apart from what you confirm." / "And see what MAIRO recommends next, with the figures behind it, waiting for your yes." | 06 · Results and next steps |
| 7 | 1:05–1:13 | End screen | The wordmark; "Your AI Advertising Team Is Ready."; the eight specialists of the AI team; the call to action. | "Your AI advertising team is ready. See your free plan." | Your AI Advertising Team Is Ready. · See Your Free Plan → · Free · no credit card · nothing runs until you approve it |

Chapters in the player: Intro, Analysis, Free plan, Creative, Approval,
Results, Get started. Play, pause, replay, a position slider, captions on or
off, and keyboard control (Space or K, ← →, Home, End, C).

## What is real, and what is not shown

- Shown as MAIRO does it: the free plan form; reading a website and marking
  what came from it; asking the owner to confirm the objective; the plan's
  sections and reasons; three concepts with one to test first; previews in
  Facebook feed, Instagram feed and Stories; editing a headline; saving a
  concept; approval before launch, with the campaign waiting for Meta's
  review; results with their sources; a recommendation that waits for the
  owner.
- Sample, and labelled: the business, its website, every figure, the budget
  (an example amount), the campaign and its results.
- Not shown, because it isn't available: AI-generated video, TikTok, Google
  Ads, results promised in advance. Pictures for concepts appear as
  placeholders, because the free plan doesn't make pictures.

## Recording the narration (when a licensed voice is available)

1. **Voice:** a confident, polished voice at a natural pace — either a voice
   actor under a written licence for web and advertising use, or a
   text-to-speech voice whose terms allow commercial use. Keep the licence
   with the project files.
2. **Read** the narration column exactly; each line must land inside its time
   window (the captions are the timing sheet). Aim for about 2.4 words per
   second; the tightest window (scene 1, second line) allows 4 seconds for 17
   words, so read it briskly or trim it in `WALK_CAPTIONS` first.
3. **Music:** a licensed bed (keep the licence), mixed about 18–22 dB under the
   voice, ducked further under speech, fading out by 1:12.
4. **Master** to −16 LUFS integrated, −1 dBTP, 48 kHz stereo AAC at 160 kbps.
5. **Mux** into the rendered files without re-encoding the picture:
   `ffmpeg -i walkthrough-wide.mp4 -i narration-mix.m4a -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart walkthrough-wide-narrated.mp4`
   (and the same for `walkthrough-narrow.mp4`).
6. **Publish:** replace the files, set `audio: true` on both entries in
   `src/lib/demo/media.ts` (with the new byte sizes — `check:preview` compares
   them), and change the player's "No voice-over yet" note only then. The
   video starts muted; sound is the viewer's choice.
7. Update the `walkthrough` entry in `src/lib/capabilities.ts` with what was
   recorded and its licence.

## Re-rendering the picture

```
npm run build && MAIRO_RENDER_ROUTE=1 npx next start -p 3100
node video/render.mjs --base http://localhost:3100 --only walkthrough --fps 30 --scale 1.5
```

This writes the MP4s, the posters (the "Meet MAIRO." frame) and the captions
file, and updates `src/lib/demo/media.ts`. `npm run check:preview` then checks
the files exist as rendered and the captions match the script.
