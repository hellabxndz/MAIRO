"use client";

import { useEffect, useRef } from "react";

// A figure that counts up to its value once, when it first appears. The real
// value is what's rendered — before script runs, for screen readers, and with
// reduced motion — and the count only rewrites the visible digits on the way
// there. A null shows as the caller's "unavailable" text, never as a zero
// counting up.

export function AnimatedNumber({ value, format, empty = "—", durationMs = 900 }: { value: number | null; format: (n: number) => string; empty?: string; durationMs?: number }) {
  const digits = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = digits.current;
    if (!el || value === null) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / durationMs);
      el.textContent = format(value * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.textContent = format(value);
    };
  }, [value, durationMs, format]);
  if (value === null) return <span>{empty}</span>;
  return (
    <span aria-label={format(value)}>
      <span aria-hidden ref={digits}>{format(value)}</span>
    </span>
  );
}
