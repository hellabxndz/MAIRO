"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { captionsVtt, CLIP_STAGE, type ClipId, type ClipLayout } from "@/lib/demo/clip";
import { ClipStage, type Clip } from "./stage";
import { loadClip } from "./registry";

// One frame of a product clip at a time, for the video renderer
// (video/render.mjs): it sets the time, waits for the paint and takes a
// screenshot — so the video is the components, frame for frame, with the
// sample-data label burned in. Captions go to a WebVTT file the player shows,
// not into the picture.

declare global {
  interface Window {
    __mairoSetT?: (t: number) => Promise<void>;
    __mairoVtt?: string;
    __mairoClip?: { duration: number; posterAt: number };
    __mairoFound?: Record<string, string[]>;
    __mairoMissing?: Record<string, string[]>;
  }
}

function noteTargets(id: string, missing: string[], found: string[]) {
  const seen = (window.__mairoFound ??= {});
  seen[id] = [...new Set([...(seen[id] ?? []), ...found])];
  (window.__mairoMissing ??= {})[id] = missing;
}

export function RenderClip({ id, layout, captions = false }: { id: ClipId; layout: ClipLayout; captions?: boolean }) {
  const [clip, setClip] = useState<Clip | null>(null);
  const [t, setT] = useState(0);
  useEffect(() => {
    let live = true;
    void loadClip(id).then((c) => live && setClip(c));
    return () => {
      live = false;
    };
  }, [id]);
  useEffect(() => {
    if (!clip) return;
    window.__mairoSetT = (next: number) =>
      new Promise<void>((resolve) => {
        flushSync(() => setT(next));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    window.__mairoVtt = captionsVtt(clip.captions);
    window.__mairoClip = { duration: clip.duration, posterAt: clip.posterAt };
    void document.fonts?.ready.then(() => {
      document.documentElement.dataset.renderReady = "1";
    });
    return () => {
      delete window.__mairoSetT;
    };
  }, [clip]);
  const { w, h } = CLIP_STAGE[layout];
  return (
    <div data-clip-frame className="relative overflow-hidden" style={{ width: w, height: h, background: "#090909" }}>
      {clip && <ClipStage clip={clip} t={t} layout={layout} showCaption={captions} onMeasured={noteTargets} />}
    </div>
  );
}
