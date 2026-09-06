"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpaceStage } from "./space-stage";
import { IntroAudio } from "./intro-audio";
import {
  AD_TERMS,
  AI_ADVANTAGES,
  BUDGET_SPLIT,
  CAPTIONS,
  ONBOARDING,
  OLD_WAY,
  PIPELINE,
  SCENES,
  SIGNALS,
} from "@/lib/intro/script";

// The "WHY MAIRO?" film, as an overlay.
//
// The site underneath is a fully loaded, working homepage the entire time. This
// is a layer on top of it, not a gate in front of it — closing it is a state
// change and nothing more. No navigation, no reload, no remount of the page
// below.
//
// It shows once. After that the visitor goes straight to the site, and the
// "Why MAIRO?" link in the footer is the only way back in.

/** Stand-in ad creatives for the generation beat. */
const CONCEPTS = [
  {
    headline: "Built for the walk home.",
    cta: "Shop now",
    wash: "linear-gradient(160deg, rgba(120,90,230,0.30), rgba(20,16,44,0.5))",
  },
  {
    headline: "Heavyweight. Nothing else.",
    cta: "See the drop",
    wash: "linear-gradient(160deg, rgba(200,80,140,0.26), rgba(30,14,30,0.5))",
  },
  {
    headline: "Made to be worn out.",
    cta: "Shop now",
    wash: "linear-gradient(160deg, rgba(60,110,220,0.28), rgba(12,20,44,0.5))",
  },
];

const STORAGE_KEY = "mairo.intro.v1";
const REPLAY_EVENT = "mairo:play-intro";
const CLOSE_MS = 380;

/** Once a device has failed to render this, it should not keep trying. */
type Outcome = "seen" | "dismissed" | "unsupported";

function remember(outcome: Outcome) {
  try {
    localStorage.setItem(STORAGE_KEY, outcome);
  } catch {
    // Private browsing. The intro will show again next time, which is a far
    // better failure than throwing on the homepage.
  }
}

function alreadyDecided() {
  try {
    return Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

const SCRIM =
  "pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.62)_0%,rgba(0,0,0,0.34)_42%,rgba(0,0,0,0)_72%)]";

export function CinematicIntro() {
  const [playing, setPlaying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [scene, setScene] = useState("enter");
  const [caption, setCaption] = useState(-1);
  const [sound, setSound] = useState(false);

  const audio = useRef<IntroAudio | null>(null);
  const alive = useRef(false);
  const closeTimer = useRef<number | undefined>(undefined);

  const close = useCallback((outcome: Outcome) => {
    if (!alive.current) return;
    alive.current = false;
    remember(outcome);
    audio.current?.stop();
    audio.current = null;
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setPlaying(false);
      setClosing(false);
      setSound(false);
      setScene("enter");
      setCaption(-1);
    }, CLOSE_MS);
  }, []);

  const begin = useCallback(() => {
    if (alive.current) return;
    alive.current = true;
    setClosing(false);
    setScene("enter");
    setCaption(-1);
    setPlaying(true);
  }, []);

  // Decide whether to play at all. Everything here is a reason not to.
  useEffect(() => {
    const replay = () => begin();
    window.addEventListener(REPLAY_EVENT, replay);

    let start: number | undefined;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduced && !alreadyDecided()) {
      // A beat before it begins, so the homepage has painted underneath. If the
      // visitor has already started reading or scrolling, they have chosen the
      // site over the film and should not be interrupted.
      start = window.setTimeout(() => {
        if (window.scrollY < 40) begin();
      }, 260);
    }

    return () => {
      window.removeEventListener(REPLAY_EVENT, replay);
      window.clearTimeout(start);
      window.clearTimeout(closeTimer.current);
      audio.current?.stop();
      audio.current = null;
      alive.current = false;
    };
  }, [begin]);

  // Hold the page still underneath, and put it back exactly as it was.
  useEffect(() => {
    if (!playing) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
  }, [playing]);

  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("dismissed");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, close]);

  // If nothing has rendered shortly after starting, get out of the way.
  const started = useRef(false);
  useEffect(() => {
    if (!playing) return;
    started.current = false;
    const guard = window.setTimeout(() => {
      if (!started.current) close("unsupported");
    }, 2500);
    return () => window.clearTimeout(guard);
  }, [playing, close]);

  const onScene = useCallback(
    (id: string) => {
      started.current = true;
      setScene(id);
      audio.current?.accent();
    },
    []
  );

  const onCaption = useCallback((index: number) => {
    setCaption(index);
    if (index >= 0) audio.current?.say(index, CAPTIONS[index].text);
  }, []);

  const enableSound = () => {
    if (!audio.current) audio.current = new IntroAudio();
    audio.current.start();
    setSound(true);
    // Pick up whatever line is on screen, rather than waiting for the next one.
    if (caption >= 0) audio.current.say(caption, CAPTIONS[caption].text);
  };

  if (!playing) return null;

  const line = caption >= 0 ? CAPTIONS[caption] : null;
  const mobile = typeof window !== "undefined" && window.innerWidth < 760;
  const length = (id: string) => {
    const s = SCENES.find((x) => x.id === id);
    return s ? s.to - s.from : 6;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Why MAIRO — introduction"
      className="fixed inset-0 z-[100] overflow-hidden bg-black"
      style={{
        opacity: closing ? 0 : 1,
        transition: `opacity ${CLOSE_MS}ms ease-out`,
      }}
    >
      <SpaceStage
        mobile={mobile}
        onScene={onScene}
        onCaption={onCaption}
        onEnd={() => close("seen")}
        onTooSlow={() => close("unsupported")}
      />

      {/* Everything below floats over the sky. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center sm:px-10">
        <div
          key={scene}
          className="w-full max-w-[1400px]"
          style={{ animation: `intro-scene ${length(scene)}s both` }}
        >
          {scene === "enter" && (
            <div className="relative">
              {/* The galaxy core is genuinely bright by this point and white
                  type sitting straight on it is hard to read. */}
              <div aria-hidden className={SCRIM} />
              <h1
                className="font-light leading-none tracking-[-0.04em] text-white"
                style={{ fontSize: "clamp(56px, 13vw, 200px)", animation: "intro-materialise 2.6s 3.2s both" }}
              >
                MAIRO
              </h1>
              <p
                className="mt-8 text-[11px] uppercase tracking-[0.45em] text-neutral-400 sm:text-sm"
                style={{ animation: "intro-rise 1.8s 4.6s both" }}
              >
                Intelligence for advertising.
              </p>
            </div>
          )}

          {scene === "why" && (
            <div className="relative">
              {/* The vocabulary of the thing, drifting past. Faint on purpose:
                  it is texture, not a list to be read. */}
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                {AD_TERMS.map((term, i) => (
                  <span
                    key={term}
                    className="absolute whitespace-nowrap text-xs uppercase tracking-[0.35em] text-white/[0.16] sm:text-base"
                    style={{
                      left: `${[6, 68, 18, 74, 38, 84][i]}%`,
                      top: `${[-40, -10, 116, 96, 150, 42][i]}%`,
                      animation: `intro-drift ${16 + i * 3}s ${i * 0.6}s ease-in-out infinite`,
                    }}
                  >
                    {term}
                  </span>
                ))}
              </div>
              <h2
                className="font-light leading-[0.86] tracking-[-0.045em] text-white"
                style={{ fontSize: "clamp(64px, 15vw, 230px)" }}
              >
                <span className="block" style={{ animation: "intro-rise 1.4s 0.2s both" }}>
                  WHY
                </span>
                <span className="block" style={{ animation: "intro-rise 1.4s 0.55s both" }}>
                  MAIRO?
                </span>
              </h2>
            </div>
          )}

          {scene === "old" && (
            <div>
              {/* Scattered rather than listed. The point of the scene is that
                  the traditional process does not line up into one place. */}
              {/* Scattered across a wide screen; stacked with a slight lean on
                  a narrow one. Absolute percentages that look fragmented at
                  1440px just run off the side of a phone. */}
              {mobile ? (
                <div className="mx-auto flex max-w-xs flex-col gap-2">
                  {OLD_WAY.map((step, i) => (
                    <span
                      key={step}
                      className="whitespace-nowrap rounded-full border border-white/[0.10] bg-white/[0.03] px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-neutral-400"
                      style={{
                        alignSelf: i % 2 ? "flex-end" : "flex-start",
                        animation: `intro-rise 0.9s ${0.3 + i * 0.36}s both`,
                      }}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="relative mx-auto h-[340px] max-w-[1100px]">
                  {OLD_WAY.map((step, i) => (
                    <span
                      key={step}
                      className="absolute whitespace-nowrap rounded-full border border-white/[0.10] bg-white/[0.03] px-5 py-2 text-xs uppercase tracking-[0.18em] text-neutral-400 backdrop-blur-[2px]"
                      style={{
                        left: `${[2, 38, 66, 10, 44, 70, 24, 52][i]}%`,
                        top: `${[6, 0, 16, 34, 44, 52, 70, 84][i]}%`,
                        animation: `intro-rise 0.9s ${0.3 + i * 0.36}s both`,
                      }}
                    >
                      {step}
                    </span>
                  ))}
                </div>
              )}

              {/* Where the money goes before it reaches an auction. */}
              <div
                className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] uppercase tracking-[0.2em] sm:text-xs"
                style={{ animation: "intro-rise 1s 5.4s both" }}
              >
                {BUDGET_SPLIT.map((part, i) => (
                  <span key={part} className="flex items-center gap-3">
                    <span className={i === BUDGET_SPLIT.length - 1 ? "text-white" : "text-neutral-500"}>
                      {part}
                    </span>
                    {i < BUDGET_SPLIT.length - 1 && <span className="text-neutral-700">↓</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          {scene === "intro" && (
            <div className="mx-auto max-w-2xl">
              <p
                className="font-light tracking-[0.3em] text-white"
                style={{ fontSize: "clamp(30px, 6vw, 68px)", animation: "intro-materialise 1.6s both" }}
              >
                MAIRO
              </p>
              <div
                className="mt-12 space-y-5 rounded-2xl border border-white/[0.09] bg-white/[0.025] p-6 text-left backdrop-blur-[3px] sm:p-9"
                style={{ animation: "intro-rise 1.2s 1.6s both" }}
              >
                {ONBOARDING.map((row, i) => (
                  <div key={row.q} style={{ animation: `intro-rise 0.8s ${2.6 + i * 1.9}s both` }}>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-500">{row.q}</p>
                    <p
                      className="mt-2 text-lg font-light text-white sm:text-2xl"
                      style={{ animation: `intro-rise 0.7s ${3.3 + i * 1.9}s both` }}
                    >
                      {row.a}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {scene === "build" && (
            <div className="mx-auto max-w-4xl">
              {/* Named steps, not scrolling hex. Someone should be able to
                  follow what it is doing. */}
              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-3">
                {/* The arrow belongs to the step it points AT, not the one it
                    comes from, so a line wrap can never leave one dangling at
                    the end of a row pointing into space. */}
                {PIPELINE.map((step, i) => (
                  <span key={step} className="flex items-center gap-3">
                    {i > 0 && (
                      <span
                        className="text-neutral-700"
                        style={{ animation: `intro-fade 0.5s ${i * 0.62 - 0.2}s both` }}
                      >
                        →
                      </span>
                    )}
                    <span
                      className="rounded-full border border-white/[0.12] px-4 py-2 text-[10px] uppercase tracking-[0.16em] text-neutral-300 sm:text-xs"
                      style={{ animation: `intro-rise 0.7s ${i * 0.62}s both` }}
                    >
                      {step}
                    </span>
                  </span>
                ))}
              </div>

              {/* Mock creatives rather than empty frames. Three real-looking
                  ads say "it wrote these"; three grey rectangles say "this bit
                  is not built yet". */}
              <div className="mt-12 grid grid-cols-3 gap-3 sm:gap-5">
                {CONCEPTS.map((c, i) => (
                  <div
                    key={c.headline}
                    className="flex aspect-[4/5] flex-col justify-between overflow-hidden rounded-xl border border-white/[0.09] p-3 text-left sm:p-4"
                    style={{
                      background: c.wash,
                      animation: `intro-rise 0.9s ${4.4 + i * 0.34}s both`,
                    }}
                  >
                    <span className="text-[7px] uppercase tracking-[0.18em] text-white/40 sm:text-[9px]">
                      Sponsored
                    </span>
                    <span className="text-[11px] font-light leading-tight text-white sm:text-lg">
                      {c.headline}
                    </span>
                    <span className="w-fit rounded-full bg-white/90 px-2 py-1 text-[7px] uppercase tracking-[0.12em] text-black sm:px-3 sm:text-[9px]">
                      {c.cta}
                    </span>
                  </div>
                ))}
              </div>

              <p
                className="mt-12 text-sm uppercase tracking-[0.3em] text-white sm:text-lg"
                style={{ animation: "intro-rise 1s 7.6s both" }}
              >
                You approve. <span className="text-neutral-500">MAIRO builds.</span>
              </p>
            </div>
          )}

          {scene === "whyai" && (
            <div className="relative mx-auto flex h-[440px] max-w-3xl items-center justify-center">
              {/* The signals circle the intelligence at the centre. Each label
                  counter-rotates so it stays upright as the ring turns. */}
              <div
                aria-hidden
                className="absolute inset-0"
                style={{ animation: "intro-orbit 34s linear infinite" }}
              >
                {SIGNALS.map((signal, i) => {
                  const angle = (i / SIGNALS.length) * Math.PI * 2;
                  return (
                    <span
                      key={signal}
                      className="absolute left-1/2 top-1/2 whitespace-nowrap text-[9px] uppercase tracking-[0.2em] text-neutral-400 sm:text-xs"
                      style={{
                        transform: `translate(-50%,-50%) translate(${Math.cos(angle) * (mobile ? 96 : 250)}px, ${Math.sin(angle) * (mobile ? 118 : 165)}px)`,
                        animation: `intro-fade 1s ${0.4 + i * 0.22}s both`,
                      }}
                    >
                      <span
                        className="block"
                        style={{ animation: "intro-counter-orbit 34s linear infinite" }}
                      >
                        {signal}
                      </span>
                    </span>
                  );
                })}
              </div>

              <div
                className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[10px] uppercase tracking-[0.22em] text-white sm:text-sm"
                style={{ animation: "intro-rise 1.2s 4.4s both" }}
              >
                {AI_ADVANTAGES.map((a) => (
                  <span key={a}>{a}</span>
                ))}
              </div>
            </div>
          )}

          {scene === "final" && (
            <div className="relative">
              <div aria-hidden className={SCRIM} />
              <h2
                className="font-light leading-none tracking-[-0.04em] text-white"
                style={{ fontSize: "clamp(56px, 13vw, 200px)", animation: "intro-materialise 2s both" }}
              >
                MAIRO
              </h2>
              <p
                className="mt-10 text-xs uppercase leading-[2.2] tracking-[0.4em] text-neutral-400 sm:text-base"
                style={{ animation: "intro-rise 1.4s 1.2s both" }}
              >
                Your business.
                <br />
                Your ads.
                <br />
                Your AI.
              </p>
              <button
                type="button"
                onClick={() => close("seen")}
                className="pointer-events-auto mt-14 inline-flex items-center gap-3 rounded-full bg-white px-9 py-4 text-xs uppercase tracking-[0.16em] text-black transition hover:bg-neutral-200"
                style={{ animation: "intro-rise 1s 3.4s both" }}
              >
                Enter MAIRO
                <span aria-hidden>→</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* The line being spoken, for the overwhelming majority of visitors who
          will watch this with the sound off. */}
      {line && !line.hero && (
        <p
          key={caption}
          className="pointer-events-none absolute inset-x-0 mx-auto max-w-3xl px-8 text-center text-sm leading-relaxed text-neutral-300 sm:text-base"
          style={{
            bottom: "max(96px, calc(env(safe-area-inset-bottom) + 96px))",
            animation: "intro-fade 0.5s both",
          }}
        >
          {line.text}
        </p>
      )}

      {/* The one line that is the point of its scene, rather than narration. */}
      {line?.hero && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-8">
          <div aria-hidden className={SCRIM.replace("-z-10", "")} />
          <p
            key={caption}
            className="relative max-w-4xl text-center font-light leading-[1.08] tracking-[-0.03em] text-white"
            style={{ fontSize: "clamp(30px, 5.4vw, 78px)", animation: "intro-rise 1.6s both" }}
          >
            {line.text}
          </p>
        </div>
      )}

      {/* Close. Always there, from the first black frame. */}
      <button
        type="button"
        onClick={() => close("dismissed")}
        aria-label="Close introduction and go to the site"
        className="absolute z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.06] text-white backdrop-blur-md transition hover:border-white/30 hover:bg-white/[0.16]"
        style={{
          top: "max(24px, calc(env(safe-area-inset-top) + 12px))",
          right: "max(20px, calc(env(safe-area-inset-right) + 20px))",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden>
          <path d="M1 1 L14 14 M14 1 L1 14" stroke="currentColor" strokeWidth="1.1" fill="none" />
        </svg>
      </button>

      {/* Sound is opt-in. Browsers block audio that starts by itself, and a
          half-playing soundtrack is worse than a silent one. */}
      {!sound && (
        <button
          type="button"
          onClick={enableSound}
          className="absolute z-20 flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.06] px-4 py-2.5 text-[10px] uppercase tracking-[0.18em] text-neutral-300 backdrop-blur-md transition hover:border-white/30 hover:text-white"
          style={{
            bottom: "max(24px, calc(env(safe-area-inset-bottom) + 20px))",
            right: "max(20px, calc(env(safe-area-inset-right) + 20px))",
          }}
        >
          <span aria-hidden>🔊</span> Enable sound
        </button>
      )}

      <style>{`
        @keyframes intro-scene {
          0%   { opacity: 0; }
          7%   { opacity: 1; }
          90%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes intro-rise {
          from { opacity: 0; transform: translate3d(0, 22px, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes intro-fade {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        /* Arrives out of the dark rather than fading up: it starts wide and
           slightly blurred and resolves, which is what "materialise" means. */
        @keyframes intro-materialise {
          0%   { opacity: 0; letter-spacing: 0.5em; filter: blur(14px); }
          60%  { opacity: 1; }
          100% { opacity: 1; letter-spacing: -0.04em; filter: blur(0); }
        }
        @keyframes intro-drift {
          0%, 100% { transform: translate3d(0, 0, 0); }
          50%      { transform: translate3d(0, -26px, 0); }
        }
        @keyframes intro-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes intro-counter-orbit {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}
