"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./stage";

// A figure that counts up into place the first time it's seen. The figure
// itself is the real one, already formatted ("$1,240.50", "61", "2.40×"),
// and it is what the server renders and what a screen reader reads; only the
// digits on screen move, briefly, from zero to it.

const PARTS = /^([^0-9-]*)(-?[\d,]+(?:\.\d+)?)(.*)$/;

export function CountUp({ value, ms = 900 }: { value: string; ms?: number }) {
  const [shown, setShown] = useState(value);
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const m = value.match(PARTS);
    const node = el.current;
    if (!m || !node || prefersReducedMotion()) return;
    const [, pre, num, post] = m;
    const target = Number(num.replace(/,/g, ""));
    if (!Number.isFinite(target) || target === 0) return;
    const decimals = num.includes(".") ? num.split(".")[1].length : 0;
    const grouped = num.includes(",") || Math.abs(target) >= 1000;
    const fmt = (n: number) => `${pre}${n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: grouped })}${post}`;
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(t >= 1 ? value : fmt(target * eased));
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(node);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, ms]);

  return (
    <span ref={el} aria-label={value}>
      <span aria-hidden>{shown}</span>
    </span>
  );
}
