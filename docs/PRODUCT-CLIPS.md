# Product clips and film

The homepage shows MAIRO working at every stage with short, silent videos of
the product. This file says what each one shows, how it is made, what is and
isn't a recording, and what still has to be produced by hand.

## What they are — and aren't

**They are renders of MAIRO's own components, not screen recordings.** Each
clip is a pure function of time (`src/components/clips/`): the real
components are laid out at a fixed width, fed sample data, driven by a clock,
framed by a camera and pointed at by a cursor that finds its targets in the
rendered screen. `video/render.mjs` sets the time, waits for the paint and
captures every frame from `/demo/render` (only served when the app runs with
`MAIRO_RENDER_ROUTE=1`), then encodes the frames with ffmpeg. So a clip can't
drift from the components — re-render it and it shows the product as it is.

None of the files is a recording of a person using a live MAIRO account, and
none contains real customer data, a real ad account, or a real result. Every
frame carries the burned-in label **"Product demo · fictional business ·
sample data"**.

**One business throughout.** Fernleaf Ceramics — a fictional online shop
(`fernleaf-ceramics.example`, a reserved address) selling handmade mugs, with
the goal "more online sales" and $1,000 a month for Meta
(`src/lib/demo/shop-sample.ts`). Its free plan is built by the generator's
own report builder, so the plan in the clips is what the tool gives for those
answers. Its dashboard figures are sample figures, each shown with where it
would come from (Meta, the shop's own orders). The results clip also shows
Brightwater Plumbing, the fictional service business, for leads and booked
jobs.

**Silent, with captions.** No voice or music has been licensed, so the
narration is the captions: a WebVTT file per clip, drawn by the player (on by
default) and listed as a transcript under each video.

## The clips

| Clip | Length | Shows | Drawn with |
| --- | --- | --- | --- |
| `creative` | 22.5 s | Angles MAIRO suggests; the owner edits a headline; the finished picture (one credit, used only if made); Facebook and Instagram feed previews; review and approval ("Nothing is published"); then sample ads for other kinds of business | The free plan's ad preview (`AdMock`), the console panels and pills, the shared sample-creative cards. **A composition**: laid out for the clip with the Creative Studio's own wording — not a capture of `/dashboard/creatives` |
| `understand` | 17 s | The generator's six stages ticking as each finishes, then the report's "Your business, understood": facts with their source, MAIRO's suggestions labelled as suggestions | The generator's progress view (`Running`) and the real report (`PlanReportView`) |
| `campaign` | 26.5 s | Plan active (Growth, from `PLANS`), connect Meta, the builder's goal, audience and budget steps, the approved creative, the launch review with the spend agreement, then "Approved by you · Waiting for Meta's review" | The real `StepGoal`, `StepAudience`, `StepBudget`, the builder's `Question`/`Choice` parts and `PlanSummary`. The step rail around them and the Meta-connect card reproduce the builder's markup; Meta's own sign-in screen is not shown |
| `team` | 18.5 s | One morning's review: each specialty's state changing only when a recorded step happens, the change checked against limits and sent for approval, and a specialty with nothing to do saying so | `TeamPanel` and the AI Team page's `FeedLine` |
| `dashboard` | 23.5 s | Overview ("Your business at a glance."), Campaigns, Creative Studio (with the five statuses), Performance, AI Team, Recommendations, Approvals, Results — one sidebar click each | The real sidebar (`PRIMARY_NAV`), `ConsoleHeader`, `MetricStrip`, `ResultsPanel` (the real chart), `CampaignsPanel`, `CreativesPanel`, `ActionCenter`, `TeamPanel`, `Journey` |
| `optimize` | 21.7 s | Results by ad, then "Consider testing a new opening line." with what was noticed, the change, the reason, the evidence, the budget effect, the risk and the authorisation; approved; then what may run within limits and what always waits | `ResultsPanel` and the Approval Center's `MairoDecisionCard`; the two lists come from `lib/automation/levels.ts` |
| `results` | 17.5 s | The shop's figures with their sources, the journey from ad to order, the weekly summary and the next suggestion; then a service business's leads → good leads → booked jobs, with job value shown as missing | `MetricGrid`, `Journey`, `ActionCard` |
| `film` | 74 s | Title card "Meet your AI advertising team."; discovery; the strategy and the $1,000 split; creative; subscribe and connect Meta; the builder; approval and Meta's review; the dashboard; a recommendation with evidence; end card "Your AI advertising team is ready." / "Build Your Free Ad Plan →" | The clips' own scenes, cut together on one clock |

Each clip is rendered at 16:9 (1440 × 810) and 9:16 (540 × 960), with a WebP
poster. Files are in `public/demo/`; the manifest the pages read is
`src/lib/demo/media.ts`, written by the renderer and listing only files that
exist.

## How they play

`src/components/clips/demo-video.tsx`:

- nothing loads until the clip is near the screen (its poster shows first);
- it plays, muted, only while it's on screen, and pauses when scrolled away or
  when the tab is hidden; it never takes over scrolling;
- with reduced motion it never starts by itself — the visitor presses play;
- play/pause/replay, a position slider and a captions switch, all reachable by
  keyboard; a transcript under each clip;
- a phone gets the 9:16 file; when no file has been rendered, or the browser
  can't play H.264, the clip is drawn live from its components instead.

## Re-rendering

```bash
npx next build
MAIRO_RENDER_ROUTE=1 npx next start -p 3100            # with the usual env
cd video && FFMPEG_PATH=… node render.mjs --base http://localhost:3100 --only clips
# one clip, one layout:  --clips film --layouts wide
npm run check:clips
```

`check:clips` pins: every clip in both compositions with its MP4, poster and
captions; the film at 60–90 s and each demonstration at 12–30 s; captions in
order, readable, equal to their WebVTT; nothing claiming another ad network,
AI video, a guarantee or a forecast; and the sample-data label on every frame.

## What still needs producing by hand

1. **Screen recordings of a real person using MAIRO**, in a demo workspace
   connected to a Meta sandbox or test ad account, for the moments a render
   can't honestly stand in for: signing in with Facebook through Meta's own
   screen, Meta's ad preview, and a real Meta review status changing.
2. **Real pictures made by MAIRO's image model** for the Creative Studio clip
   and the showcase. The clips use drawn illustrations labelled "Sample image"
   and "Sample creative" because no image model was available where these were
   made; a real output should replace them only with the business's
   permission, still labelled as a sample.
3. **Photographic sample creatives** for the showcase gallery, if wanted —
   original photography (no stock), of products for fictional brands, with no
   people presented as customers.
4. **A licensed voice-over and music** for the film; until then the captions
   are the narration.

The design reference the brief names (larven.ai) could not be reached from the
build environment, so nothing here is copied from it.
