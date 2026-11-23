"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { SHOWCASE_PHOTOS } from "@/components/home/showcase-photos";

// The hero's proof: the work MAIRO delivers, at a readable size — one sample
// ad for a fictional brand, and the three moments of working with MAIRO on
// it: MAIRO makes the ad, the owner approves it, MAIRO reads the result and
// proposes the next test. Labelled as a sample wherever a figure appears.
//
// The ad itself never moves or hides: only the status strip under it changes.
// Without JavaScript, and under reduced motion, it rests on "approve" — the
// moment the owner controls — with every step listed and selectable.

const STATES = [
  { key: "make", step: "MAIRO makes the ad", title: "Made from lumenskin.com", detail: "Picture, headline and copy for the Instagram feed, at 4:5." },
  { key: "approve", step: "You approve it", title: "Waiting for your approval", detail: "$20 a day · your Meta ad account · nothing runs until you say yes." },
  { key: "learn", step: "MAIRO reads the result", title: "First 7 days: 11 purchases at $12.73 each", detail: "Next test: the same serum in a 6-second video, against this ad." },
] as const;

export function HeroAd() {
  const [i, setI] = useState(1);
  const [auto, setAuto] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start the loop only once the browser says motion is welcome
    setAuto(true);
    setI(0);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => setI((n) => (n + 1) % STATES.length), i === 1 ? 3400 : 2800);
    return () => window.clearTimeout(t);
  }, [auto, i]);

  const s = STATES[i];
  return (
    <figure className="mx-auto w-full max-w-[420px] lg:max-w-[340px]" aria-label="A sample ad MAIRO made for a fictional brand, and the three steps of working with MAIRO on it">
      <div className="overflow-hidden rounded-[22px] border border-[color:var(--v3-line-strong)] bg-white text-[#111] shadow-[0_40px_120px_-40px_rgba(255,255,255,0.18)]">
        <div className="flex items-center gap-2.5 px-3.5 py-3">
          <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-[#111] text-[12px] font-semibold text-white">L</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-semibold">lumenskin</p>
            <p className="text-[11.5px] text-[#737373]">Sponsored</p>
          </div>
          <span className="rounded-full bg-[#f2f2f2] px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#555]">Sample</span>
        </div>
        <div className="relative aspect-[4/5] w-full">
          <Image src="/showcase/skincare.jpg" alt={SHOWCASE_PHOTOS.skincare?.alt ?? "Sample ad picture: skincare bottles on a blush backdrop"} fill priority sizes="(max-width: 1024px) 92vw, 420px" className="object-cover" />
        </div>
        <div className="flex items-center justify-between border-b border-[#efefef] px-3.5 py-2.5">
          <span className="text-[13px] font-semibold">Shop now</span>
          <span aria-hidden className="text-[14px] text-[#737373]">›</span>
        </div>
        <figcaption className="px-3.5 py-3 text-[13.5px] leading-snug">
          <span className="font-semibold">lumenskin</span> Skin that drinks it in. Lightweight hydration that lasts all day — made in small batches in Austin.
        </figcaption>
      </div>

      {/* The three moments. The list is the control; the card below says what's happening now. */}
      <ol className="mt-4 grid grid-cols-3 gap-1.5" aria-label="Working with MAIRO on this ad">
        {STATES.map((x, n) => (
          <li key={x.key}>
            <button
              type="button"
              onClick={() => {
                setAuto(false);
                setI(n);
              }}
              aria-current={n === i ? "step" : undefined}
              className={`flex min-h-11 w-full flex-col items-start rounded-xl border px-2.5 py-2 text-left text-[11.5px] leading-tight transition ${n === i ? "border-white/60 bg-white/[0.07] text-white" : "border-[color:var(--v3-line)] text-white/55 hover:text-white/85"}`}
            >
              <span className="font-mono text-[10px] text-white/45">0{n + 1}</span>
              {x.step}
            </button>
          </li>
        ))}
      </ol>
      <div className="mt-2 min-h-[84px] rounded-2xl border border-[color:var(--v3-line)] bg-[color:var(--v3-ink)]/80 px-4 py-3" aria-live="polite">
        <p className="flex items-center gap-2 text-[14px] font-medium text-white">
          <span aria-hidden className={s.key === "approve" ? "h-[7px] w-[7px] rounded-full bg-amber-300" : "v3-dot"} />
          {s.title}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-white/60">{s.detail}</p>
      </div>
      <p className="mt-2 px-1 text-[11.5px] leading-relaxed text-white/45">Sample campaign for Lumen Skin, a fictional brand. The figures show the layout — not a result or a promise.</p>
    </figure>
  );
}
