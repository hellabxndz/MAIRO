"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EXAMPLES, HERO_ORDER, type ExampleType } from "@/lib/demo/examples";
import { CHAPTERS, HERO_DURATION, STAGE, boxes, camera, chapterStart, restingTime, sceneAt, type ChapterId, type Layout } from "@/lib/demo/timeline";
import { heroVariant, track } from "@/lib/analytics/track";
import { RENDERED_MEDIA } from "@/lib/demo/media";
import { INVITE_BUTTON_HEIGHT, STAGE_BACKGROUND, StoryStage } from "./story-stage";

// The landing page's animated story. A deterministic 24-second timeline in
// six chapters, played by one requestAnimationFrame clock that stops whenever
// the story is off screen, the tab is hidden, the visitor pauses, or the
// visitor is typing in the website box (hold). Choosing an example or a
// chapter never restarts it: the example swaps in place, a chapter jumps
// there. With reduced motion it doesn't play on its own — each chapter shows
// as a still, and the visitor can choose to play it. It plays twice at most,
// then rests on its closing question; there is no sound and no popup.
//
// It's a picture of the product with sample data. The real preview — the
// visitor's own website — is the form beside it, and nothing typed there
// changes this story. The one live control inside the picture is the closing
// "Build My Free Ad Plan" button, which hands over to that form (onInvite).

const MAX_LOOPS = 2;
const FIRST_FRAME = 1200;
/** Phones get the narrow composition. Kept in step with the max-[591px] classes below. */
const NARROW_QUERY = "(max-width: 591px)";

export function HeroStory({ initialType = "service", onTypeChange, hold = false, onInvite }: { initialType?: ExampleType; onTypeChange?: (t: ExampleType) => void; hold?: boolean; onInvite?: () => void }) {
  const [type, setType] = useState<ExampleType>(initialType);
  const [t, setT] = useState(FIRST_FRAME);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [visible, setVisible] = useState(true);
  const [layout, setLayout] = useState<Layout>("wide");
  const [scale, setScale] = useState(0);
  const [announce, setAnnounce] = useState("");
  const [asVideo, setAsVideo] = useState(false);
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
  }, [asVideo]);

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
  }, [asVideo]);

  // The clock. It holds while the visitor types, so nothing moves beside the box they're using.
  const running = playing && visible && !hold;
  useEffect(() => {
    if (!running) return;
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
  }, [running]);

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
  const rendered = RENDERED_MEDIA.story[type];
  const posters = { wide: rendered?.wide?.poster, narrow: rendered?.narrow?.poster };
  const clip = rendered?.[layout] ?? rendered?.wide;
  const progress = t / HERO_DURATION;
  // The closing call to action is a real button, laid over the picture where the story draws it.
  const invite = boxes(t, layout).invite;
  const cam = camera(t);
  const at = (v: number, centre: number) => centre + (v - centre) * cam.s;
  const inviteButton = onInvite && invite.o > 0.6 ? { left: at(invite.x, stage.w / 2), top: at(invite.y + invite.h - INVITE_BUTTON_HEIGHT, stage.h / 2), width: invite.w * cam.s, height: INVITE_BUTTON_HEIGHT * cam.s, opacity: Math.min(1, invite.o) } : null;

  return (
    <div className="w-full" data-palette="classic">
      {/* The examples: three complete businesses, not random content. */}
      <div role="radiogroup" aria-label="Example business" className="flex flex-wrap gap-2">
        {HERO_ORDER.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={type === k}
            onClick={() => chooseType(k)}
            className={`min-h-[38px] rounded-full border px-3.5 text-[13px] font-medium transition ${type === k ? "border-[#8fb8ff]/70 bg-[#2f6bff]/20 text-white" : "border-white/12 bg-white/[0.03] text-white/70 hover:border-white/30 hover:text-white"}`}
          >
            {EXAMPLES[k].label}
          </button>
        ))}
      </div>

      <div className="relative mt-3">
        {/* The rendered video and poster carry the same label in the picture; the live stage gets it here. */}
        {!asVideo && (scale > 0 || !posters.wide) && (
          <p className="absolute left-3 top-3 z-20 rounded-full border border-[#f0c463] bg-[#fff8e6] px-2.5 py-1 text-[11px] font-semibold text-[#7a5200]">Product demo — sample data</p>
        )}
        {asVideo && clip && RENDERED_MEDIA.captions.story ? (
          <video key={clip.mp4} controls autoPlay muted playsInline poster={clip.poster} className="aspect-[760/560] w-full rounded-[22px] border border-white/10 bg-black max-[591px]:aspect-[360/600]" aria-label={`The story as a video, ${ex.label.toLowerCase()} example, without sound`}>
            <source src={clip.mp4} type="video/mp4" />
            <track kind="captions" src={RENDERED_MEDIA.captions.story} srcLang="en" label="English" />
          </video>
        ) : (
        <div
          ref={box}
          role="img"
          aria-label={`Product story, ${ex.label.toLowerCase()} example with sample data. Current chapter: ${scene.label}`}
          className="relative aspect-[760/560] w-full overflow-hidden rounded-[22px] border border-white/15 max-[591px]:aspect-[360/600]"
          style={{ background: STAGE_BACKGROUND }}
        >
          {scale > 0 ? (
            <>
              <div aria-hidden className="absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})`, width: stage.w, height: stage.h }}>
                <StoryStage ex={ex} t={t} layout={layout} drawInviteButton={!onInvite} />
              </div>
              {inviteButton && (
                <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ transform: `scale(${scale})`, width: stage.w, height: stage.h }}>
                  <div className="absolute flex justify-center" style={inviteButton}>
                    <button
                      type="button"
                      onClick={() => {
                        track({ name: "hero_play", props: { state: "invite", variant: variant.current } });
                        onInvite?.();
                      }}
                      className="pointer-events-auto flex items-center gap-2 rounded-full bg-gradient-to-r from-[#6b5cff] to-[#5b3fd9] px-6 text-[15px] font-semibold text-white shadow-[0_14px_36px_-14px_rgba(91,63,217,0.8)] hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b3fd9]"
                    >
                      Build My Free Ad Plan <span aria-hidden>→</span>
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            // Before the stage is measured: the rendered first frame, in the shape CSS already chose.
            posters.wide && (
              <picture>
                {posters.narrow && <source media={NARROW_QUERY} srcSet={posters.narrow} />}
                <img src={posters.wide} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" fetchPriority="low" decoding="async" />
              </picture>
            )
          )}
        </div>
        )}
      </div>

      {ex.note && <p className="mt-2 text-[12.5px] leading-snug text-white/70">{ex.note}</p>}

      {/* Controls: play, pause, replay, and the six chapters. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={togglePlay} aria-pressed={playing} className="flex h-9 min-w-[88px] items-center justify-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 text-[12.5px] font-medium text-white hover:border-white/35">
          <span aria-hidden>{playing ? "❚❚" : "▶"}</span> {playing ? "Pause" : reduced ? "Play animation" : "Play"}
        </button>
        {playing && hold && <span className="text-[12px] text-white/60">Paused while you type</span>}
        <button type="button" onClick={replay} className="flex h-9 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-3 text-[12.5px] font-medium text-white hover:border-white/35">
          <span aria-hidden>↺</span> Replay
        </button>
        {clip && (
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setAsVideo((v) => !v);
            }}
            aria-pressed={asVideo}
            className="order-last ml-auto h-9 rounded-full px-3 text-[12.5px] text-white/65 underline-offset-4 hover:text-white hover:underline"
          >
            {asVideo ? "Back to the interactive story" : "Watch as a video"}
          </button>
        )}
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
        <div data-story-progress className="h-full rounded-full bg-gradient-to-r from-[#5b6cff] to-[#8fb8ff]" style={{ width: `${Math.round(progress * 1000) / 10}%` }} />
      </div>
      <p className="sr-only" aria-live="polite">{announce}</p>
      <p className="sr-only">{CHAPTERS.map((c) => `${c.label}: ${c.describe}`).join(" ")}</p>
    </div>
  );
}
