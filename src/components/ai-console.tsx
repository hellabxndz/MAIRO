"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

// The hero's centrepiece: MAIRO thinking, in public.
//
// The page said "run by AI" in every headline and then showed nothing but
// beautiful typography, which is what every agency site does. A claim about
// intelligence is worth roughly nothing next to a demonstration of it, so this
// runs the actual decision chain the product runs — read the business, pick the
// objective, size the audience, split the budget, write the ad, hand it over
// paused — and streams it the way the model produces it, a token at a time.
//
// Every value here is what MAIRO would really emit. OUTCOME_LEADS with an
// on-ad destination is what a phone-calls goal compiles to in
// src/lib/campaigns/, the radius and age range are the three questions in
// audience.ts, and the campaign arriving paused is the rule the whole product
// is built on. Inventing a better-looking answer would have been easy and
// would have made the page a liar.
//
// Nothing here is a particle, a sprite or a canvas. It is text in a box.

type Step = {
  /** The machine-side name, shown in mono. */
  id: string;
  /** What it is doing, in words a customer would use. */
  label: string;
  /** What it produced. Typed out. */
  value: string;
  /** Rendered in the accent colour, because it is the decision rather than data. */
  accent?: boolean;
};

const SCRIPT: Step[] = [
  {
    id: "intake",
    label: "Reading the business",
    value: "Sunrise Dental · Austin, TX · cosmetic dentistry · $600 a month",
  },
  {
    id: "objective",
    label: "Choosing the objective",
    value: "Goal is phone calls → OUTCOME_LEADS, call button on the ad itself",
    accent: true,
  },
  {
    id: "audience",
    label: "Sizing the audience",
    value: "Austin + 10 miles · ages 25–65 · everyone",
  },
  {
    id: "budget",
    label: "Splitting the budget",
    value: "Meta $14/day · TikTok $6/day · reviewed every morning",
  },
  {
    id: "creative",
    label: "Writing the ad",
    value: "“A whiter smile before the holidays. Same-week appointments.”",
    accent: true,
  },
  {
    id: "handoff",
    label: "Handing it over",
    value: "Built in your own ad account — paused, waiting for you",
  },
];

/** Milliseconds per character. Fast enough to read, slow enough to watch. */
const CHAR_MS = 16;
/** Held at the end of a line before the next one starts. */
const LINE_PAUSE_MS = 520;
/** Held on the finished plan before it runs again. */
const LOOP_PAUSE_MS = 4200;

/**
 * Whether this visitor has asked for less motion.
 *
 * Read through useSyncExternalStore rather than set from inside an effect.
 * Deriving it is not a style preference here: setting state synchronously in an
 * effect body to cover the reduced-motion case renders the panel empty, then
 * immediately renders it full, and the server would have to guess which. The
 * server answers "no", the client corrects it during hydration, and the panel
 * is only ever painted in one of its two correct states.
 */
const motionQuery = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const m = window.matchMedia(motionQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

export function AiConsole({ className = "" }: { className?: string }) {
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(motionQuery).matches,
    () => false
  );
  // Which line is being typed, and how far into it. SCRIPT.length means the
  // plan is finished and holding before it runs again.
  const [step, setStep] = useState(0);
  const [chars, setChars] = useState(0);
  const [done, setDone] = useState(false);
  const frame = useRef(0);

  useEffect(() => {
    // Someone who has asked for less motion gets the finished plan, which is
    // rendered from `reduced` below rather than typed out here.
    if (reduced) return;

    let last = performance.now();
    let waitUntil = 0;
    let s = 0;
    let c = 0;

    const tick = (now: number) => {
      frame.current = requestAnimationFrame(tick);

      if (now < waitUntil) return;

      // Elapsed rather than one-character-per-frame: a 120Hz phone should not
      // type twice as fast as a 60Hz laptop, and a frame the browser skipped
      // should not lose a character.
      const due = Math.floor((now - last) / CHAR_MS);
      if (due <= 0) return;
      last = now;

      if (s >= SCRIPT.length) {
        // Finished: hold the completed plan, then run the whole thing again.
        waitUntil = now + LOOP_PAUSE_MS;
        s = 0;
        c = 0;
        setStep(0);
        setChars(0);
        setDone(false);
        return;
      }

      const target = SCRIPT[s].value.length;
      c = Math.min(target, c + due);
      setChars(c);

      if (c >= target) {
        s += 1;
        c = 0;
        waitUntil = now + LINE_PAUSE_MS;
        setStep(s);
        setChars(0);
        if (s >= SCRIPT.length) setDone(true);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [reduced]);

  // Everything below reads these, so the reduced-motion panel is the finished
  // plan without the animation ever having run.
  const activeStep = reduced ? SCRIPT.length : step;
  const settled = reduced ? true : done;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/[0.10] bg-black/70 ${className}`}
      style={{ boxShadow: "0 40px 120px -40px rgba(0,0,0,0.9)" }}
    >
      {/* Header: what this is, and that it is running. */}
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-5 py-3.5">
        <span className="relative flex h-1.5 w-1.5">
          {!settled && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-neutral-400">
          mairo
        </span>
        <span className="font-mono text-[10px] tracking-[0.12em] text-neutral-600">
          {settled ? "plan ready" : "building the plan"}
        </span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-700">
          example
        </span>
      </div>

      <div className="space-y-px px-5 py-5 sm:px-6">
        {SCRIPT.map((s, i) => {
          const state = i < activeStep ? "done" : i === activeStep ? "running" : "waiting";
          const shown =
            state === "done" ? s.value : state === "running" ? s.value.slice(0, chars) : "";

          return (
            <div
              key={s.id}
              className="grid grid-cols-[auto_1fr] items-start gap-x-3 py-2 transition-opacity duration-500"
              style={{ opacity: state === "waiting" ? 0.3 : 1 }}
            >
              {/* The state marker. A ring while it thinks, a tick when it is
                  sure — the two states the whole panel is about. */}
              <span className="mt-[3px] flex h-3.5 w-3.5 items-center justify-center">
                {state === "done" ? (
                  <svg viewBox="0 0 12 12" className="h-3 w-3 text-emerald-400/80" aria-hidden>
                    <path
                      d="M2 6.4l2.6 2.6L10 3.6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : state === "running" ? (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-white/70" />
                ) : (
                  <span className="h-2 w-2 rounded-full border border-white/25" />
                )}
              </span>

              <div className="min-w-0">
                <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">
                  {s.id}
                  <span className="ml-2 tracking-[0.04em] text-neutral-600 normal-case">
                    {s.label}
                  </span>
                </p>
                <p
                  className={`relative mt-1.5 text-[13px] leading-relaxed sm:text-sm ${
                    s.accent ? "text-white" : "text-neutral-300"
                  }`}
                >
                  {/* Holds the row at its finished height from the first
                      frame, so a value that wraps does not shove the rest of
                      the panel down a line as it is typed. */}
                  <span className="invisible" aria-hidden>
                    {s.value}
                  </span>
                  <span className="absolute inset-0">
                    {shown}
                    {state === "running" && (
                      <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-white/80" />
                    )}
                  </span>
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
