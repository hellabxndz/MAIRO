"use client";

import { useEffect, useRef, useState } from "react";

// Shows what the product actually does, by doing a small version of it.
//
// A visitor who has never used MAIRO has no idea what "the AI writes your ad"
// means. Rather than assert it, this types out a real concept — the same
// shape the Creative agent produces — so they can read the output and judge it.
//
// The typing only starts when the section is on screen, and it stops as soon
// as it is done. Nothing animates while the visitor is reading another part
// of the page.

const LINES = [
  { label: "The idea", text: "Your jacket shot like it's the only one left in the shop. One light, one product, nothing else competing for attention." },
  { label: "Headline", text: "Warm now. Cheaper now." },
  { label: "Primary text", text: "The jacket people keep asking about is 25% off until Sunday. Once this batch is gone it's gone." },
  { label: "Call to action", text: "Shop Now — it's a straight sale, so send people to buy, not to fill in a form." },
];

const FULL = LINES.reduce((n, l) => n + l.text.length, 0);

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function ConceptDemo() {
  const ref = useRef<HTMLDivElement>(null);
  // Resolved once as the initial value rather than set from an effect, so a
  // visitor who prefers reduced motion never sees a render with it animating.
  const [typed, setTyped] = useState(() => (prefersReducedMotion() ? FULL : 0));
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!started || typed >= FULL) return;
    // A timeout per chunk rather than a rAF loop: this advances a few times a
    // second, and there is nothing to draw between the changes.
    const id = setTimeout(() => setTyped((n) => Math.min(FULL, n + 3)), 16);
    return () => clearTimeout(id);
  }, [started, typed]);

  // Walk the lines, handing each its share of the typed budget. Written as a
  // fold over the offsets so nothing is mutated while rendering.
  const rendered = LINES.map((line, i) => {
    const before = LINES.slice(0, i).reduce((n, l) => n + l.text.length, 0);
    const take = Math.max(0, Math.min(line.text.length, typed - before));
    return { ...line, shown: line.text.slice(0, take) };
  });

  return (
    <div ref={ref} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-sm sm:p-8">
      <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-xs uppercase tracking-[0.15em] text-neutral-500">
          Creative agent · writing
        </span>
      </div>

      <div className="space-y-5">
        {rendered.map((line) => (
          <div key={line.label} className={line.shown ? "" : "opacity-30"}>
            <p className="mb-1.5 text-xs uppercase tracking-[0.14em] text-neutral-600">
              {line.label}
            </p>
            <p className="min-h-[1.5rem] text-sm leading-relaxed text-neutral-200">
              {line.shown}
              {line.shown.length > 0 && line.shown.length < line.text.length && (
                <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-violet-400" />
              )}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
