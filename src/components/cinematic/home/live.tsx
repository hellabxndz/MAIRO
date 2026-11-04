"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FIELD_EVENT, type FieldDetail } from "@/lib/cinematic/field-event";

// The homepage's small live touches — each answers something the visitor
// does, and each is still under reduced motion (docs/DESIGN-SPEC-v3.md §6):
//
//   HeroReadout     what MAIRO does, one verb at a time, and the visitor's
//                   own website the moment they type it
//   ScrollProgress  a lime hairline along the top: how far through the story
//   MobileCta       on phones, the one action stays in reach once the hero's
//                   box has scrolled away, and steps aside for the closing one

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const VERBS = ["Reading your business", "Making your ads", "Running them on Meta", "Reporting what worked"];

/** "https://www.Example.com/shop" → "example.com"; anything that isn't a domain yet is shown as typed. */
export function domainOf(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
  return t.split(/[/?#\s]/)[0].slice(0, 40);
}

export function HeroReadout() {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState("");
  const clear = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (reducedMotion()) return;
    const t = setInterval(() => setI((n) => (n + 1) % VERBS.length), 2600);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    const on = (e: Event) => {
      const text = domainOf((e as CustomEvent<FieldDetail>).detail?.text ?? "");
      setTyped(text);
      if (clear.current) clearTimeout(clear.current);
      clear.current = setTimeout(() => setTyped(""), 4000);
    };
    window.addEventListener(FIELD_EVENT, on);
    return () => {
      window.removeEventListener(FIELD_EVENT, on);
      if (clear.current) clearTimeout(clear.current);
    };
  }, []);

  return (
    <p className="v3-label flex min-h-[1.4em] items-center gap-2.5" aria-live="off">
      <span aria-hidden className="v3-dot v3-breathe" />
      <span className="text-white/70">MAIRO</span>
      <span aria-hidden className="text-white/25">/</span>
      <span key={typed ? `t:${typed}` : i} className="v3-tick text-white/55">
        {typed ? `Reading ${typed}…` : VERBS[i]}
      </span>
      <span className="sr-only">MAIRO reads your business, makes your ads, runs them on Meta and reports what worked.</span>
    </p>
  );
}

export function ScrollProgress() {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (bar.current) bar.current.style.transform = `scaleX(${p})`;
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, []);
  return <div ref={bar} aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-[color:var(--v3-signal)]" style={{ transform: "scaleX(0)" }} />;
}

/** Phones only: the action stays in reach between the hero's box and the closing one. */
export function MobileCta() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById("hero-website");
    const close = document.getElementById("close-website");
    if (!hero || !close) return;
    const seen = { hero: true, close: false };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === hero) seen.hero = e.isIntersecting || e.boundingClientRect.top > 0;
        if (e.target === close) seen.close = e.isIntersecting;
      }
      setShow(!seen.hero && !seen.close);
    });
    io.observe(hero);
    io.observe(close);
    return () => io.disconnect();
  }, []);
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--v3-line)] bg-[color:var(--v3-ink)]/95 px-5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 [transition-timing-function:var(--ease-mairo)] sm:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
      aria-hidden={!show}
    >
      <Link href="/preview" tabIndex={show ? 0 : -1} className="cine-cta flex min-h-[50px] w-full items-center justify-center gap-2 rounded-full text-[15.5px] font-semibold">
        Build my free plan <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
