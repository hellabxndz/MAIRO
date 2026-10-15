"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CLIP_STAGE, captionAt, type ClipId, type ClipLayout } from "@/lib/demo/clip";
import { RENDERED_MEDIA, type ClipMedia } from "@/lib/demo/media";
import { ClipStage, type Clip } from "./stage";
import { loadClip } from "./registry";

// A product clip on a page: the rendered MP4 (16:9, or 9:16 on a phone) when
// there is one — otherwise, or when the browser can't play it, the same clip
// drawn live from its components.
//
//   - Nothing loads until the clip is near the screen; until then, its poster.
//   - It plays, muted, while it's on screen and pauses when it isn't (or the
//     tab is hidden). There's no sound to turn on: the clips are silent.
//   - With reduced motion it never starts by itself; the visitor presses play.
//   - Captions are drawn from the clip's WebVTT, on by default and switchable;
//     the whole narration is there as a transcript too.
//   - It never takes over scrolling.

type Props = { id: ClipId; title: string; className?: string; /** Ask for the 9:16 file whatever the screen (a tall slot). */ layout?: ClipLayout; transcript?: boolean };

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

const fmt = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export function DemoVideo({ id, title, className = "", layout: forced, transcript = true }: Props) {
  const media: ClipMedia | undefined = RENDERED_MEDIA.clips?.[id];
  const narrowScreen = useNarrow();
  const reduced = useReducedMotion();
  // A browser that can't play the file (no H.264) gets the clip drawn live instead.
  const [unplayable, setUnplayable] = useState(false);
  const rendered = unplayable ? undefined : media;
  const layout: ClipLayout = forced ?? (narrowScreen && rendered?.narrow ? "narrow" : narrowScreen && !rendered ? "narrow" : "wide");
  const file = rendered?.[layout] ?? rendered?.wide ?? null;

  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(false);
  const [inView, setInView] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [userPlayed, setUserPlayed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const nearIo = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "400px 0px" });
    const viewIo = new IntersectionObserver(([e]) => setInView(e.intersectionRatio >= 0.45), { threshold: [0, 0.45, 0.8] });
    nearIo.observe(el);
    viewIo.observe(el);
    const vis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => {
      nearIo.disconnect();
      viewIo.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  // Plays only while seen, never against the visitor's choice, and not by itself with reduced motion.
  const shouldPlay = near && inView && !tabHidden && !userPaused && !ended && (!reduced || userPlayed);

  // ── The rendered file ──
  useEffect(() => {
    const v = video.current;
    if (!v || !file) return;
    if (shouldPlay)
      void v.play().catch((e: unknown) => {
        setPlaying(false);
        if (e instanceof DOMException && e.name === "NotSupportedError") setUnplayable(true);
      });
    else v.pause();
  }, [shouldPlay, file]);

  // ── Drawn live, when there is no file to play ──
  const [clip, setClip] = useState<Clip | null>(null);
  useEffect(() => {
    if (file || !near || clip) return;
    let live = true;
    void loadClip(id).then((c) => live && setClip(c));
    return () => {
      live = false;
    };
  }, [file, near, clip, id]);
  const base = useRef(0);
  useEffect(() => {
    if (file || !clip || !shouldPlay) return;
    let raf = 0;
    const began = performance.now() - base.current;
    const tick = (now: number) => {
      const next = now - began;
      if (next >= clip.duration) {
        base.current = clip.duration;
        setT(clip.duration - 1);
        setEnded(true);
        return;
      }
      base.current = next;
      setT(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [file, clip, shouldPlay]);

  // Drawn live, it plays exactly when it should; a file says so through its own events.
  const isPlaying = file ? playing : Boolean(clip && shouldPlay);
  const duration = file?.ms ?? clip?.duration ?? 0;
  const cues = media?.cues ?? clip?.captions ?? [];
  const cue = captionsOn ? captionAt(cues, t) : null;

  const toggle = useCallback(() => {
    if (ended) {
      setEnded(false);
      base.current = 0;
      setT(0);
      if (video.current) video.current.currentTime = 0;
      setUserPaused(false);
      setUserPlayed(true);
      return;
    }
    if (isPlaying || shouldPlay) {
      setUserPaused(true);
    } else {
      setUserPaused(false);
      setUserPlayed(true);
    }
  }, [ended, isPlaying, shouldPlay]);

  const seek = (ms: number) => {
    setEnded(false);
    base.current = ms;
    setT(ms);
    if (video.current) video.current.currentTime = ms / 1000;
  };

  const stage = CLIP_STAGE[layout];
  const ratio = file ? file.width / file.height : stage.w / stage.h;
  const poster = file?.poster;

  return (
    <figure className={`relative ${className}`}>
      <div ref={root} className="group relative w-full overflow-hidden rounded-[22px] border bg-[#05070d] shadow-[0_50px_120px_-50px_rgba(47,107,255,0.45),0_30px_70px_-40px_rgba(0,0,0,0.9)]" style={{ aspectRatio: String(ratio), borderColor: "rgba(150,170,210,0.16)" }}>
        {file ? (
          <video
            ref={video}
            className="absolute inset-0 h-full w-full"
            src={near ? file.mp4 : undefined}
            poster={poster}
            muted
            playsInline
            preload="none"
            aria-label={`${title}. Product demo with a fictional business and sample data; no sound.`}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => {
              setEnded(true);
              setPlaying(false);
            }}
            onTimeUpdate={(e) => setT(e.currentTarget.currentTime * 1000)}
            onError={(e) => e.currentTarget.error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED && setUnplayable(true)}
          >
            {media?.vtt && <track kind="captions" src={media.vtt} srcLang="en" label="English" />}
          </video>
        ) : clip ? (
          <LiveStage clip={clip} t={t} layout={layout} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-white/40">Loading the demo…</div>
        )}

        {cue && (
          <p aria-hidden className="pointer-events-none absolute inset-x-3 bottom-14 z-10 text-center sm:bottom-16">
            <span className="box-decoration-clone rounded-md bg-black/75 px-2.5 py-1 text-[12.5px] font-medium leading-snug text-white sm:text-[15px]">{cue.text}</span>
          </p>
        )}

        {/* Controls: always reachable by keyboard; shown on hover, focus, pause or end. */}
        <div className={`absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-3 pb-2.5 pt-8 transition-opacity duration-300 focus-within:opacity-100 group-hover:opacity-100 ${isPlaying ? "opacity-0" : "opacity-100"}`}>
          <button type="button" onClick={toggle} aria-label={ended ? `Replay: ${title}` : isPlaying ? `Pause: ${title}` : `Play: ${title}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70">
            {ended ? (
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="1.8"><path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.5v3h3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            ) : isPlaying ? (
              <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 fill-current"><path d="M2.5 1.5h2.4v9H2.5zM7.1 1.5h2.4v9H7.1z" /></svg>
            ) : (
              <svg aria-hidden viewBox="0 0 12 12" className="ml-0.5 h-3 w-3 fill-current"><path d="M2 1.2v9.6L10.5 6z" /></svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(1, duration)}
            step={100}
            value={Math.min(t, duration)}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label={`Position in ${title}`}
            aria-valuetext={`${fmt(t)} of ${fmt(duration)}`}
            className="h-1 min-w-0 flex-1 cursor-pointer accent-[#5cc8ff]"
          />
          <span className="hidden shrink-0 text-[11.5px] tabular-nums text-white/75 sm:inline">
            {fmt(t)} / {fmt(duration)}
          </span>
          <button type="button" onClick={() => setCaptionsOn((c) => !c)} aria-pressed={captionsOn} aria-label="Captions" className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${captionsOn ? "border-white/70 text-white" : "border-white/30 text-white/50"}`}>
            CC
          </button>
          <span className="hidden shrink-0 text-[10.5px] text-white/55 md:inline">No sound</span>
        </div>

        {!isPlaying && !ended && t < 200 && (reduced || userPaused) && (
          <button type="button" onClick={toggle} aria-hidden tabIndex={-1} className="absolute inset-0 z-10 flex items-center justify-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] text-white shadow-[0_20px_50px_-12px_rgba(47,107,255,0.9)]">
              <svg viewBox="0 0 12 12" className="ml-1 h-5 w-5 fill-current"><path d="M2 1.2v9.6L10.5 6z" /></svg>
            </span>
          </button>
        )}
      </div>
      {transcript && cues.length > 0 && (
        <details className="mt-3 text-[13px] text-white/60">
          <summary className="cursor-pointer select-none hover:text-white">Read what the video shows</summary>
          <ol className="mt-2 space-y-1 leading-relaxed">
            {cues.map((c) => (
              <li key={c.start}>
                <span className="mr-2 tabular-nums text-white/35">{fmt(c.start)}</span>
                {c.text}
              </li>
            ))}
          </ol>
        </details>
      )}
    </figure>
  );
}

/** The clip drawn live, scaled to the box it sits in. */
function LiveStage({ clip, t, layout }: { clip: Clip; t: number; layout: ClipLayout }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const stage = CLIP_STAGE[layout];
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / stage.w));
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage.w]);
  return (
    <div ref={box} aria-hidden className="absolute inset-0">
      {scale > 0 && (
        <div className="origin-top-left" style={{ width: stage.w, height: stage.h, transform: `scale(${scale})` }}>
          <ClipStage clip={clip} t={t} layout={layout} />
        </div>
      )}
    </div>
  );
}
