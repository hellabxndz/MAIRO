"use client";

import type { PlanConcept } from "@/lib/preview/plan-writing";

// One ad concept as it would sit in a Facebook or Instagram feed: the words
// MAIRO wrote, the button, and — where the picture goes — the visual
// direction, labelled as a concept. No picture is made in the free plan, so
// none is shown; finished creatives come with a subscription.

export type Placement = "facebook" | "instagram";

function Avatar({ name }: { name: string }) {
  return (
    <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] text-[13px] font-semibold text-white">
      {name.trim().charAt(0).toUpperCase() || "M"}
    </span>
  );
}

function VisualConcept({ c, tall }: { c: PlanConcept; tall: boolean }) {
  return (
    <div className={`relative flex flex-col justify-between overflow-hidden p-4 text-white ${tall ? "aspect-[4/5]" : "aspect-[1.91/1] sm:aspect-[4/3]"}`} style={{ background: "radial-gradient(120% 90% at 85% 0%, rgba(47,107,255,0.55), transparent 60%), radial-gradient(90% 80% at 0% 100%, rgba(53,108,255,0.35), transparent 60%), linear-gradient(160deg,#151a36,#0b0d1a)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full border border-white/25 bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/85">Visual concept</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] text-white/80">{c.format}</span>
      </div>
      <p className="text-[12.5px] leading-snug text-white/90 [text-wrap:pretty]">{c.visual}</p>
    </div>
  );
}

export function AdMock({ c, business, placement, domain }: { c: PlanConcept; business: string; placement: Placement; domain: string | null }) {
  if (placement === "instagram") {
    const handle = business.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "yourbusiness";
    return (
      <figure className="overflow-hidden rounded-2xl border border-black/5 bg-white text-[#111]" aria-label={`Instagram feed concept: ${c.headline}`}>
        <div className="flex items-center gap-2.5 px-3 py-2.5">
          <Avatar name={business} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{handle}</p>
            <p className="text-[11px] text-[#737373]">Sponsored</p>
          </div>
          <span aria-hidden className="text-[18px] leading-none text-[#737373]">···</span>
        </div>
        <VisualConcept c={c} tall />
        <div className="flex items-center justify-between border-b border-[#efefef] bg-[#f5f6ff] px-3 py-2.5">
          <span className="text-[13px] font-semibold text-[#3b31c9]">{c.cta}</span>
          <span aria-hidden className="text-[14px] text-[#3b31c9]">›</span>
        </div>
        <figcaption className="px-3 py-2.5 text-[13px] leading-snug">
          <span className="font-semibold">{handle}</span> {c.primaryText}
        </figcaption>
      </figure>
    );
  }
  return (
    <figure className="overflow-hidden rounded-2xl border border-black/5 bg-white text-[#050505]" aria-label={`Facebook feed concept: ${c.headline}`}>
      <div className="flex items-center gap-2.5 px-3 pt-3">
        <Avatar name={business} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-semibold">{business}</p>
          <p className="text-[11.5px] text-[#65676b]">Sponsored</p>
        </div>
        <span aria-hidden className="text-[18px] leading-none text-[#65676b]">···</span>
      </div>
      <p className="px-3 pb-3 pt-2 text-[13.5px] leading-snug [text-wrap:pretty]">{c.primaryText}</p>
      <VisualConcept c={c} tall={false} />
      <div className="flex items-center gap-3 bg-[#f0f2f5] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {domain && <p className="truncate text-[11px] uppercase tracking-wide text-[#65676b]">{domain}</p>}
          <p className="truncate text-[14px] font-semibold leading-snug">{c.headline}</p>
        </div>
        <span className="shrink-0 rounded-md bg-[#e2e5e9] px-3 py-1.5 text-[13px] font-semibold">{c.cta}</span>
      </div>
    </figure>
  );
}
