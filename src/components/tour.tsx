"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A walk through a part of the app, one element at a time.
//
// A page of instructions gets skimmed; being shown the actual button while
// somebody tells you what it does gets remembered. So this dims the screen,
// cuts a hole around one real element, and puts a card next to it. Next, next,
// next, done.
//
// Two implementation notes.
//
// The hole is one element with an enormous spread box-shadow, rather than four
// panels or an SVG mask. One node, one paint, and it follows the target
// exactly.
//
// Nothing here measures into React state. Positions are written straight onto
// the two nodes through refs, from a handler that also runs on scroll and
// resize. Measuring into state would re-render the whole tour on every scroll
// frame to move two boxes, which is both slower and the thing the
// set-state-in-effect rule exists to prevent.

export type Step = {
  /** Matches a data-tour attribute. Absent means a centred card with no hole. */
  target?: string;
  title: string;
  body: string;
};

const PAD = 10;


export function Tour({
  steps,
  storageKey,
  autoStart,
}: {
  steps: Step[];
  /** Where "they have seen this" is remembered. One per tour. */
  storageKey: string;
  autoStart: boolean;
}) {
  const [step, setStep] = useState<number | null>(null);
  const holeRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const start = useCallback(() => setStep(0), []);

  const finish = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "done");
    } catch {
      /* it will offer itself again; harmless */
    }
    setStep(null);
  }, [storageKey]);

  // Offered automatically only right after subscribing, and only once.
  useEffect(() => {
    if (!autoStart) return;
    let seen = false;
    try {
      seen = localStorage.getItem(storageKey) !== null;
    } catch {
      /* treat as unseen */
    }
    if (!seen) {
      // A beat, so it doesn't collide with the page settling.
      const t = window.setTimeout(start, 450);
      return () => window.clearTimeout(t);
    }
  }, [autoStart, start, storageKey]);

  // Anyone can ask for it again.
  useEffect(() => {
    const replay = () => setStep(0);
    window.addEventListener("mairo:start-tour", replay);
    return () => window.removeEventListener("mairo:start-tour", replay);
  }, []);

  const current = step === null ? null : steps[step];

  // Position the hole and the card. Imperative on purpose — see the note above.
  useEffect(() => {
    if (current === null) return;

    const place = () => {
      const hole = holeRef.current;
      const card = cardRef.current;
      if (!hole || !card) return;

      const el = current.target
        ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
        : null;

      if (!el) {
        // No target, or it isn't on the page for this account: centre the card
        // and show no hole rather than pointing at nothing.
        hole.style.opacity = "0";
        card.style.top = "50%";
        card.style.left = "50%";
        card.style.transform = "translate(-50%, -50%)";
        return;
      }

      const r = el.getBoundingClientRect();
      hole.style.opacity = "1";
      hole.style.top = `${r.top - PAD}px`;
      hole.style.left = `${r.left - PAD}px`;
      hole.style.width = `${r.width + PAD * 2}px`;
      hole.style.height = `${r.height + PAD * 2}px`;

      // Below the target when there is room, otherwise above it.
      const cardH = card.offsetHeight || 200;
      const below = r.bottom + 16;
      const fitsBelow = below + cardH < window.innerHeight - 12;
      const top = fitsBelow ? below : Math.max(12, r.top - cardH - 16);
      const left = Math.min(
        Math.max(12, r.left),
        Math.max(12, window.innerWidth - card.offsetWidth - 12)
      );
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
      card.style.transform = "none";
    };

    const el = current.target
      ? document.querySelector<HTMLElement>(`[data-tour="${current.target}"]`)
      : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });

    place();
    // Twice more as the smooth scroll settles, so the hole lands on the target
    // rather than where it used to be.
    const a = window.setTimeout(place, 220);
    const b = window.setTimeout(place, 520);

    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [current]);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        setStep((s) => (s === null ? s : s + 1 >= steps.length ? (finish(), null) : s + 1));
      }
      if (e.key === "ArrowLeft") setStep((s) => (s === null ? s : Math.max(0, s - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, finish, steps.length]);

  if (step === null || !current) return null;

  const last = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Product tour">
      {/* The hole. One node, one enormous shadow — everything outside it dims. */}
      <div
        ref={holeRef}
        aria-hidden
        className="pointer-events-none absolute rounded-xl transition-all duration-300"
        style={{
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.78)",
          outline: "1px solid rgba(255,255,255,0.22)",
        }}
      />

      {/* Clicking the dimmed area does nothing, so a stray click cannot lose
          your place mid-tour. Escape and Skip both exit. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={cardRef}
        className="absolute w-[min(360px,calc(100vw-24px))] rounded-2xl border border-white/[0.12] bg-neutral-950 p-6 shadow-2xl"
      >
        <p className="text-[10px] uppercase tracking-[0.24em] text-neutral-500">
          {step + 1} of {steps.length}
        </p>
        <h3 className="mt-3 text-lg font-light leading-snug tracking-[-0.01em] text-white">
          {current.title}
        </h3>
        <p className="mt-3 text-sm leading-relaxed text-neutral-400">{current.body}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finish}
            className="text-xs text-neutral-500 transition hover:text-neutral-300"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                className="rounded-full border border-white/15 px-4 py-2 text-xs text-neutral-300 transition hover:border-white/40 hover:text-white"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setStep(step + 1))}
              className="rounded-full bg-white px-5 py-2 text-xs font-medium text-black transition hover:bg-neutral-200"
            >
              {last ? "Got it" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** A link anywhere that restarts the tour. */
export function StartTourLink({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("mairo:start-tour"))}
      className={className}
    >
      Take the tour
    </button>
  );
}
