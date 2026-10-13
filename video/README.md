# Landing videos

Renders the landing page's 20-second story (three example businesses, wide and phone) and the 60-second walkthrough (wide and phone) to muted MP4 files, WebP posters and WebVTT captions in `public/walkthrough/`, then rewrites `src/lib/demo/media.ts` to list exactly what was rendered. The pages only offer a video that's listed there, and `npm run check:preview` fails if a listed file is missing or has changed since it was rendered.

Every frame is the real component (`/demo/render`) at a fixed time, so the video can't drift from the interactive version. There is no voice-over; the captions carry the meaning.

## Render

1. Build and start the app with the render page switched on (it's a 404 otherwise):

   ```sh
   npm run build
   MAIRO_RENDER_ROUTE=1 npx next start -p 3100
   ```

2. In this folder, install the browser driver once (`npm install`), make sure `ffmpeg` (with libx264 and libwebp) is on the PATH or set `FFMPEG_PATH`, and run:

   ```sh
   node render.mjs --base http://localhost:3100 --fps 30 --scale 1.5
   ```

   `--only story` or `--only walkthrough` renders one set and keeps the other's entries. A full render takes about 15 minutes.

3. Rebuild the app so it picks up the new `media.ts`, run `npm run check:preview`, and commit `public/walkthrough/` together with `src/lib/demo/media.ts`.

Re-render whenever the story, the walkthrough or their example data change — the check compares captions with the code, but it can't see a changed frame.
