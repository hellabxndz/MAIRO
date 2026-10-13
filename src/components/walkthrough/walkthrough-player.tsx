"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { EXAMPLES } from "@/lib/demo/examples";
import { STAGE, type Layout } from "@/lib/demo/timeline";
import { WALK_CHAPTERS, WALK_DURATION, walkCaptionAt, walkChapterStart, walkRestingTime, walkSceneAt, type WalkChapterId } from "@/lib/demo/walkthrough";
import type { RenderedMedia } from "@/lib/demo/media";
import { track } from "@/lib/analytics/track";
import { WalkthroughStage } from "./walkthrough-stage";

// The 60-second walkthrough, as an interactive player: play and pause, a
// position slider, six chapters, captions on by default (there's no voice-over
// yet, so the captions carry the meaning), and keyboard control — Space or K
// to play and pause, the arrow keys to move five seconds, C for captions,
// Home and End. It starts on its own once, when it first comes into view, and
// never with reduced motion; it pauses when it leaves the screen or the tab.
//
// When a rendered video exists (lib/demo/media.ts), the same walkthrough can
// be watched as a file, with the same captions as a WebVTT track.

const NARROW_QUERY = "(max-width: 591px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReduced(cb: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

export function WalkthroughPlayer({ media }: { media: Pick<RenderedMedia, "walkthrough" | "captions"> }) {
  const ex = EXAMPLES.service;
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [captions, setCaptions] = useState(true);
  const [layout, setLayout] = useState<Layout>("wide");
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(false);
  const [asVideo, setAsVideo] = useState(false);
  const [announce, setAnnounce] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const autoplayed = useRef(false);
  const reducedMotion = useSyncExternalStore(subscribeReduced, () => window.matchMedia(REDUCED_QUERY).matches, () => false);
  // With reduced motion and nothing chosen yet, show the first chapter complete rather than an empty first frame.
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const mq = window.matchMedia(NARROW_QUERY);
    const fit = () => {
      const l: Layout = mq.matches ? "narrow" : "wide";
      setLayout(l);
      setScale(Math.min(1.4, el.clientWidth / STAGE[l].w));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    mq.addEventListener("change", fit);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", fit);
    };
  }, [asVideo]);

  // Start once on first sight (not with reduced motion); pause off screen and in hidden tabs.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let inView = false;
    const apply = () => setVisible(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(
      ([e]) => {
        inView = e.isIntersecting;
        apply();
        if (inView && !autoplayed.current && !window.matchMedia(REDUCED_QUERY).matches) {
          autoplayed.current = true;
          setPlaying(true);
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", apply);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, [asVideo]);

  useEffect(() => {
    if (!playing || !visible || asVideo) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setT((prev) => {
        const next = prev + dt;
        if (next >= WALK_DURATION) {
          setPlaying(false);
          return WALK_DURATION - 1;
        }
        return next;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, visible, asVideo]);

  const seek = useCallback((ms: number) => {
    setTouched(true);
    setT(Math.max(0, Math.min(WALK_DURATION - 1, ms)));
  }, []);
  const toggle = useCallback(() => {
    setTouched(true);
    if (!playing) track({ name: "walkthrough", props: { action: "play" } });
    if (!playing && t >= WALK_DURATION - 2) setT(0);
    setPlaying(!playing);
  }, [playing, t]);
  const goChapter = (id: WalkChapterId) => {
    seek(playing ? walkChapterStart(id) : walkRestingTime(id));
    const c = WALK_CHAPTERS.find((x) => x.id === id)!;
    setAnnounce(`Chapter: ${c.label}`);
    track({ name: "walkthrough", props: { action: "chapter" } });
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const onControl = target.closest("button, input, a, video");
    if ((e.key === " " || e.key === "Enter") && onControl) return;
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") && target.tagName === "INPUT") return;
    if (e.key === " " || e.key.toLowerCase() === "k") {
      e.preventDefault();
      toggle();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seek(t - 5000);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seek(t + 5000);
    } else if (e.key === "Home") {
      e.preventDefault();
      seek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      seek(WALK_DURATION - 1);
    } else if (e.key.toLowerCase() === "c") {
      setCaptions((c) => !c);
    }
  };

  const shown = reducedMotion && !touched ? walkRestingTime("website") : t;
  const scene = walkSceneAt(shown);
  const caption = walkCaptionAt(shown);
  const stage = STAGE[layout];
  const clip = media.walkthrough[layout] ?? media.walkthrough.wide;
  const hasVideo = Boolean(clip && media.captions.walkthrough);

  return (
    <div role="region" aria-label="Product walkthrough, 60 seconds, sample data" onKeyDown={onKey} className="w-full" data-palette="classic">
      <div className="relative">
        {!asVideo && <p className="absolute left-3 top-3 z-20 rounded-full border border-amber-300/40 bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-amber-200">Product demo — sample data</p>}
        {asVideo && clip ? (
          <video controls playsInline preload="none" poster={clip.poster} className="aspect-[760/560] w-full rounded-[22px] border border-white/10 bg-black max-[591px]:aspect-[360/600]" aria-label="The walkthrough as a video, without sound, with captions">
            <source src={clip.mp4} type="video/mp4" />
            <track kind="captions" src={media.captions.walkthrough} srcLang="en" label="English" default />
          </video>
        ) : (
          <div
            ref={box}
            role="img"
            aria-label={`Walkthrough on a sample business, chapter: ${scene.label}. ${caption.text}`}
            className="relative aspect-[760/560] w-full overflow-hidden rounded-[22px] border border-white/10 max-[591px]:aspect-[360/600]"
            style={{ background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(124,92,255,0.2), transparent 70%), #05060d" }}
          >
            {scale > 0 && (
              <div aria-hidden className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})`, width: stage.w, height: stage.h }}>
                <WalkthroughStage ex={ex} t={shown} layout={layout} showCaption={captions} />
              </div>
            )}
          </div>
        )}
      </div>

      {!asVideo && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={toggle} aria-pressed={playing} className="flex h-9 min-w-[88px] items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 text-[12.5px] font-medium text-white hover:border-white/35">
              <span aria-hidden>{playing ? "❚❚" : "▶"}</span> {playing ? "Pause" : t >= WALK_DURATION - 2 ? "Play again" : "Play"}
            </button>
            <button type="button" onClick={() => setCaptions((c) => !c)} aria-pressed={captions} className="h-9 rounded-full border border-white/15 bg-white/[0.04] px-3 text-[12.5px] font-medium text-white hover:border-white/35">
              <span aria-hidden>CC</span> <span className="sr-only">Captions</span>{captions ? " on" : " off"}
            </button>
            <span className="text-[12px] tabular-nums text-white/60" aria-hidden>{fmt(shown)} / {fmt(WALK_DURATION)}</span>
            {hasVideo && (
              <button type="button" onClick={() => {
                  setPlaying(false);
                  setAsVideo(true);
                  track({ name: "walkthrough", props: { action: "video" } });
                }} className="ml-auto h-9 rounded-full px-3 text-[12.5px] text-white/70 underline-offset-4 hover:text-white hover:underline">
                Watch as a video file
              </button>
            )}
          </div>
          <input
            type="range"
            min={0}
            max={WALK_DURATION}
            step={500}
            value={Math.round(shown)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Position in the walkthrough"
            aria-valuetext={`${fmt(shown)} of ${fmt(WALK_DURATION)}, ${scene.label}`}
            className="mt-3 w-full accent-[#8b5cf6]"
          />
          <nav aria-label="Walkthrough chapters" className="mt-2 flex flex-wrap gap-1.5">
            {WALK_CHAPTERS.map((c) => {
              const here = scene.id === c.id;
              return (
                <button key={c.id} type="button" onClick={() => goChapter(c.id)} aria-current={here ? "step" : undefined} className={`h-9 rounded-full px-3 text-[12.5px] transition ${here ? "bg-white text-[#0b0b18]" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`}>
                  {c.label}
                </button>
              );
            })}
          </nav>
          <p className="mt-2 text-[11.5px] text-white/45">Keyboard: Space or K plays and pauses · ← → move 5 seconds · C turns captions on or off.</p>
        </>
      )}
      {asVideo && (
        <button type="button" onClick={() => setAsVideo(false)} className="mt-3 h-9 rounded-full border border-white/15 px-3 text-[12.5px] text-white/85 hover:border-white/35">
          Back to the interactive walkthrough
        </button>
      )}
      <p className="sr-only" aria-live="polite">{announce}</p>
      {playing && captions && <p className="sr-only" aria-live="polite">{caption.text}</p>}
    </div>
  );
}
