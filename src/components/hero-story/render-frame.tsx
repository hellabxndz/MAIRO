"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { EXAMPLES, type ExampleType } from "@/lib/demo/examples";
import { STAGE, captionsVtt, type Layout } from "@/lib/demo/timeline";
import { walkCaptionsVtt } from "@/lib/demo/walkthrough";
import { StoryStage } from "./stage";
import { WalkthroughStage } from "@/components/walkthrough/walkthrough-stage";

// One frame of the story (or the 60-second walkthrough) at a time, for the
// video renderer (video/render.mjs).
// The renderer sets the time, waits for the paint, and takes a screenshot —
// so the video is the interactive story, frame for frame, with the same
// "Example campaign — sample data" label burned in.

declare global {
  interface Window {
    __mairoSetT?: (t: number) => Promise<void>;
    /** The clip's captions, so the renderer writes the same WebVTT the page uses. */
    __mairoVtt?: string;
  }
}

export function RenderFrame({ clip, type, layout, label }: { clip: "story" | "walkthrough"; type: ExampleType; layout: Layout; label: string }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    window.__mairoSetT = (next: number) =>
      new Promise<void>((resolve) => {
        flushSync(() => setT(next));
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
    window.__mairoVtt = clip === "walkthrough" ? walkCaptionsVtt() : captionsVtt();
    document.documentElement.dataset.renderReady = "1";
    return () => {
      delete window.__mairoSetT;
    };
  }, [clip]);
  const { w, h } = STAGE[layout];
  return (
    <div
      data-palette="classic"
      className="relative overflow-hidden"
      style={{
        width: w,
        height: h,
        background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(124,92,255,0.22), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 90%, rgba(59,107,255,0.12), transparent 70%), #05060d",
      }}
    >
      {clip === "walkthrough" ? <WalkthroughStage ex={EXAMPLES[type]} t={t} layout={layout} /> : <StoryStage ex={EXAMPLES[type]} t={t} layout={layout} />}
      <p className="absolute left-3 top-3 z-20 rounded-full border border-amber-300/40 bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-amber-200">{label}</p>
    </div>
  );
}
