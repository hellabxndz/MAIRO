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
throughout. The ad concepts are illustrations, not AI-generated photographs.

## Look

- Obsidian background `#07080D`, midnight panels, electric violet `#7952FF`
  and blue `#356CFF` light.
- Real MAIRO screens for scenes 2–6, moving on their own timeline, with a slow
  3% push-in across each scene and the scene's title in the top corner as it
  starts.
- Motion typography for the intro ("MEET MAIRO.") and the ending.
- Two compositions: wide (760 × 560, rendered at 1140 × 840) and phone
  (360 × 600, rendered at 540 × 900).

## Storyboard and narration

| # | Time | Scene | What's on screen | Narration (= captions) | On-screen text |
|---|------|-------|------------------|------------------------|----------------|
| 1 | 0:00–0:08 | Intro | Dark backdrop; the MAIRO wordmark fades in; three sample ad concepts rise and fan out; "MEET MAIRO." resolves from wide letter-spacing. | "Your business deserves more than another complicated advertising dashboard." | MEET MAIRO. |
| 2 | 0:08–0:19 | Business | The sample website is typed into MAIRO and opened; the goal is picked; "What MAIRO found" lists what came from the website, asks what it didn't say, and the owner confirms. | "Meet MAIRO. Your AI advertising team." / "Start with your website, and MAIRO builds an understanding of your business." | 01 · Your business |
| 3 | 0:19–0:30 | Strategy | The draft plan: where the ads run, what they're for, who sees them and why, an example budget (marked "Example"); then three ad concepts, one marked "Recommended first test". | "MAIRO recommends an advertising strategy" / "and shows you which creative ideas are worth testing first." | 02 · Your ad strategy |
| 4 | 0:30–0:43 | Creative Studio | The recommended concept is selected; the owner rewrites the opening line (the original is kept as a version); the ad is previewed in the feed and in Stories. | "Review your ad concepts, customize the message," / "and turn your brand into creative that fits your goals." | 03 · Creative Studio |
| 5 | 0:43–0:53 | Approval | "Ready to launch?" checklist with the Meta ad account connected; the review before launch with budget, placements and objective; the owner approves. | "When you're ready, connect your Meta account." / "Review the campaign, approve your budget," / "and stay in control before anything launches." | 04 · Your approval |
| 6 | 0:53–1:05 | Performance | The dashboard with figures marked "Sample figures": money spent, new, qualified and booked leads; a lead marked booked; a proposed next action with its reason. | "Follow your results in one place." / "Understand what's working, what needs attention," / "and what MAIRO recommends next." | 05 · Your results |
| 7 | 1:05–1:13 | Ending | Backdrop returns; wordmark; the two end lines; the three concepts; the call to action with a soft glow. | "You run the business. MAIRO runs the ads." | You run the business. MAIRO runs the ads. · BUILD YOUR FREE AD PLAN · Free to start. Nothing runs without your approval. |

## What is real, and what is not shown

- Shown as MAIRO does it: reading a website and marking what came from it,
  asking what it didn't say, a draft plan with reasons, three directions with
  one recommended, editing a line with versions kept, feed and Stories
  previews, the checklist and approval before launch, lead outcomes, a
  proposed next step that waits for the owner.
- Sample, and labelled: the business, its website, every figure, the budget
  ("Example"), the dashboard ("Sample figures").
- Not shown, because it isn't available: AI-generated video, TikTok, Google
  Ads, results promised in advance.

## Recording the narration (when a licensed voice is available)

1. **Voice:** a confident, polished British female voice at a natural pace —
   either a voice actor under a written licence for web and advertising use,
   or a text-to-speech voice whose terms allow commercial use. Keep the
   licence with the project files.
2. **Read** the narration column exactly; each line must land inside its time
   window (the captions are the timing sheet). Aim for about 2.4 words per
   second; the longest window (scene 2, second line) allows 7.2 seconds.
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

This writes the MP4s, the posters (the "MEET MAIRO." frame) and the captions
file, and updates `src/lib/demo/media.ts`. `npm run check:preview` then checks
the files exist as rendered and the captions match the script.
