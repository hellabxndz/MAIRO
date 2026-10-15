"use client";

import Link from "next/link";
import { useRef } from "react";
import { SAMPLE_ADS, SampleAdCard } from "./sample-creatives";

// "Ads that look like they belong to your brand." — sample creatives for
// fictional businesses across the kinds of business MAIRO advertises: a row
// the visitor moves with the arrows (or the keyboard) on a computer and
// swipes on a phone. Nothing moves by itself.

export function CreativeShowcase() {
  const row = useRef<HTMLUListElement>(null);
  const move = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(el.clientWidth * 0.8, 600), behavior: "smooth" });
  };
  return (
    <section id="showcase" aria-labelledby="showcase-title" className="relative scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div data-reveal className="max-w-[640px]">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">Creative showcase</p>
            <h2 id="showcase-title" className="mt-3 text-[clamp(28px,3.6vw,46px)] font-semibold leading-[1.04] tracking-[-0.035em] text-white [text-wrap:balance]">
              Ads that look like they belong to your brand.
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed text-white/68">From fashion to plumbing, MAIRO writes for what you actually sell. Every ad here is a sample for a fictional brand — the shape of what MAIRO helps you make, not a real result.</p>
          </div>
          <div className="hidden gap-2 lg:flex">
            <button type="button" onClick={() => move(-1)} aria-label="Previous sample ads" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
              <span aria-hidden>←</span>
            </button>
            <button type="button" onClick={() => move(1)} aria-label="More sample ads" className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 text-white transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
              <span aria-hidden>→</span>
            </button>
          </div>
        </div>
      </div>
      <ul
        ref={row}
        tabIndex={0}
        aria-label="Sample ads for fictional businesses — scroll sideways for more"
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-4 [scrollbar-width:thin] focus-visible:outline-none sm:px-8 lg:px-[max(3rem,calc((100vw-1280px)/2+3rem))]"
      >
        {SAMPLE_ADS.map((ad) => (
          <li key={ad.key} className="w-[248px] shrink-0 snap-start sm:w-[272px]">
            <SampleAdCard ad={ad} />
          </li>
        ))}
      </ul>
      <div className="mx-auto mt-6 flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <p className="text-[12.5px] text-white/45">Sample creatives, drawn for fictional brands. Your ads are written from your own business; finished pictures use your plan&rsquo;s monthly credits.</p>
        <Link href="/preview" className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[image:var(--mairo-ramp)] px-6 text-[14.5px] font-semibold text-white shadow-[0_14px_40px_-14px_rgba(47,107,255,0.9)] transition hover:brightness-110">
          See What MAIRO Can Create <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
