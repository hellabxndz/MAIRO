"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXAMPLES, EXAMPLE_ORDER, type ExampleType } from "@/lib/demo/examples";
import { CHAPTERS, HERO_DURATION, HERO_SCENES, STAGE, chapterStart, restingTime, sceneAt, type ChapterId, type Layout } from "@/lib/demo/timeline";
import { heroVariant, track } from "@/lib/analytics/track";
import { StoryStage } from "./stage";

// The landing page's animated story. A deterministic 20-second timeline,
// played by one requestAnimationFrame clock that stops whenever the story is
// off screen, the tab is hidden, or the visitor pauses. Choosing an example or
// a chapter never restarts it: the example swaps in place, a chapter jumps
// there. With reduced motion it doesn't play on its own — each chapter shows
// as a still, and the visitor can choose to play it.
//
// It's a picture of the product with sample data. The real preview — the
// visitor's own website — is the form beside it, and nothing typed there
// changes this story.

const MAX_LOOPS = 3;
const FIRST_FRAME = 1200;
/** Phones get the narrow composition. Kept in step with the max-[591px] classes below. */
const NARROW_QUERY = "(max-width: 591px)";

export function HeroStory({ initialType = "service", onTypeChange }: { initialType?: ExampleType; onTypeChange?: (t: ExampleType) => void }) {
  const [type, setType] = useState<ExampleType>(initialType);
  const [t, setT] = useState(FIRST_FRAME);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [layout, setLayout] = useState<Layout>("wide");
  const [scale, setScale] = useState(0);
  const [announce, setAnnounce] = useState("");
  const loops = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const variant = useRef("story");

  // Pick the composition — the phone layout is its own design, not a shrunk
  // desktop. The same media query sets the box's shape in CSS, so the space
  // the story takes never changes when the script arrives.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const mq = window.matchMedia(NARROW_QUERY);
    const fit = () => {
      const l: Layout = mq.matches ? "narrow" : "wide";
      setLayout(l);
      setScale(Math.min(1.25, el.clientWidth / STAGE[l].w));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    mq.addEventListener("change", fit);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", fit);
    };
  }, []);

  // Respect reduced motion: no autoplay, still frames per chapter.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setPlaying(false);
        setT(restingTime("business"));
      }
    };
    apply();
    mq.addEventListener("change", apply);
    variant.current = heroVariant();
    return () => mq.removeEventListener("change", apply);
  }, []);

  // Pause when off screen or when the tab is hidden.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let inView = true;
    const apply = () => setVisible(inView && document.visibilityState === "visible");
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting;
      apply();
    }, { threshold: 0.15 });
    io.observe(el);
    document.addEventListener("visibilitychange", apply);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  // The clock.
  useEffect(() => {
    if (!playing || !visible) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      setT((prev) => {
        const next = prev + dt;
        if (next < HERO_DURATION) return next;
        loops.current += 1;
        if (loops.current >= MAX_LOOPS) {
          // Rest on the invitation rather than looping forever.
          setPlaying(false);
          return HERO_DURATION - 1;
        }
        return 0;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, visible]);

  const scene = sceneAt(t);
  const chooseType = useCallback(
    (next: ExampleType) => {
      setType(next);
      onTypeChange?.(next);
      track({ name: "hero_example", props: { type: next, variant: variant.current } });
    },
    [onTypeChange],
  );
  const goChapter = (id: ChapterId) => {
    setT(playing ? chapterStart(id) : restingTime(id));
    const c = CHAPTERS.find((x) => x.id === id)!;
    setAnnounce(`${c.label}: ${c.describe}`);
    track({ name: "hero_chapter", props: { chapter: id, variant: variant.current } });
  };
  const togglePlay = () => {
    const next = !playing;
    if (next && t >= HERO_DURATION - 2) {
      setT(0);
      loops.current = 0;
    }
    setPlaying(next);
    track({ name: "hero_play", props: { state: next ? "playing" : "paused", variant: variant.current } });
  };
  const replay = () => {
    loops.current = 0;
    setT(0);
    setPlaying(true);
    track({ name: "hero_play", props: { state: "replay", variant: variant.current } });
  };

  const ex = EXAMPLES[type];
  const stage = STAGE[layout];
  const progress = t / HERO_DURATION;

  return (
    <div className="w-full" data-palette="classic">
      {/* The examples: three complete businesses, not random content. */}
      <div role="radiogroup" aria-label="Example business" className="flex flex-wrap gap-2">
        {EXAMPLE_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={type === k}
            onClick={() => chooseType(k)}
            className={`min-h-[38px] rounded-full border px-3.5 text-[13px] font-medium transition ${type === k ? "border-[#a78bfa]/70 bg-[#7c5cff]/20 text-white" : "border-white/12 bg-white/[0.03] text-white/70 hover:border-white/30 hover:text-white"}`}
          >
            {EXAMPLES[k].label}
          </button>
        ))}
      </div>

      <div className="relative mt-3">
        <p className="absolute left-3 top-3 z-20 rounded-full border border-amber-300/40 bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-amber-200">Example campaign — sample data</p>
        <div
          ref={box}
          role="img"
          aria-label={`Product story, ${ex.label.toLowerCase()} example with sample data. Current chapter: ${scene.label}`}
          className="relative aspect-[760/560] w-full overflow-hidden rounded-[22px] border border-white/10 max-[591px]:aspect-[360/600]"
          style={{
            background: "radial-gradient(ellipse 70% 60% at 50% 40%, rgba(124,92,255,0.22), transparent 70%), radial-gradient(ellipse 50% 40% at 85% 90%, rgba(59,107,255,0.12), transparent 70%), #05060d",
          }}
        >
          {scale > 0 ? (
            <div aria-hidden className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})`, width: stage.w, height: stage.h }}>
              <StoryStage ex={ex} t={t} layout={layout} />
            </div>
          ) : (
            // Before the stage is measured: the same first scene, as a still, in the shape CSS already chose.
            <picture>
              <source media={NARROW_QUERY} srcSet={`/walkthrough/hero-${type}-narrow-poster.webp`} />
              <img src={`/walkthrough/hero-${type}-wide-poster.webp`} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            </picture>
          )}
        </div>
      </div>

      {/* Controls: play, pause, replay, and the five chapters. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={togglePlay} aria-pressed={playing} className="flex h-9 min-w-[88px] items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 text-[12.5px] font-medium text-white hover:border-white/35">
          <span aria-hidden>{playing ? "❚❚" : "▶"}</span> {playing ? "Pause" : reduced ? "Play animation" : "Play"}
        </button>
        <button type="button" onClick={replay} className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 text-[12.5px] font-medium text-white hover:border-white/35">
          <span aria-hidden>↺</span> Replay
        </button>
        <nav aria-label="Story chapters" className="flex flex-wrap gap-1.5">
          {CHAPTERS.map((c) => {
            const here = scene.id === c.id;
            return (
              <button key={c.id} type="button" onClick={() => goChapter(c.id)} aria-current={here ? "step" : undefined} title={c.describe} className={`h-9 rounded-full px-3 text-[12.5px] transition ${here ? "bg-white text-[#0b0b18]" : "text-white/70 hover:bg-white/[0.06] hover:text-white"}`}>
                {c.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div aria-hidden className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#5b6cff] to-[#a78bfa]" style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
      <p className="sr-only">{HERO_SCENES.slice(0, 5).map((s, i) => `${CHAPTERS[i].label}: ${CHAPTERS[i].describe}`).join(" ")}</p>
    </div>
  );
}
