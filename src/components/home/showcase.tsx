"use client";

import Image from "next/image";
import Link from "next/link";
import { useId, type CSSProperties } from "react";
import { SAMPLE_ADS, type SampleAd } from "./sample-creatives";
import { SHOWCASE_PHOTOS } from "./showcase-photos";

// "See the possibilities for your next campaign." — the sample creatives,
// art-directed: each set as a finished ad in the format it would run in
// (a 9:16 story, a 4:5 feed post, a square), with its headline typeset on
// the picture the way a brand would, on a warm paper band so the work reads
// like a printed portfolio between the product's dark screens. Every brand
// is invented and each card says it's a sample — the shape of what MAIRO
// helps make, never a real ad or a real result. A card shows the picture
// showcase-photos.ts lists for it (today a 3D product render made for the
// page), and its drawing when there is none.

type Format = "story" | "feed" | "square";
type Direction = { format: Format; ink: "dark" | "light"; face: "serif" | "sans" | "display"; place: "top" | "bottom"; accent?: string };

const DIRECTION: Record<string, Direction> = {
  fashion: { format: "story", ink: "dark", face: "serif", place: "top" },
  fitness: { format: "square", ink: "light", face: "display", place: "top", accent: "#00f0ff" },
  skincare: { format: "feed", ink: "dark", face: "serif", place: "top" },
  local: { format: "story", ink: "light", face: "sans", place: "bottom" },
  luxury: { format: "feed", ink: "light", face: "serif", place: "top", accent: "#e3c98b" },
  realestate: { format: "square", ink: "dark", face: "sans", place: "top" },
  online: { format: "feed", ink: "light", face: "sans", place: "bottom" },
  furniture: { format: "story", ink: "dark", face: "serif", place: "top" },
  services: { format: "feed", ink: "light", face: "sans", place: "top", accent: "#f7f7f7" },
};

const ORDER = ["fashion", "fitness", "skincare", "local", "luxury", "realestate", "online", "furniture", "services"];
const ADS = ORDER.map((k) => SAMPLE_ADS.find((a) => a.key === k)).filter(Boolean) as SampleAd[];
const ALL_PICTURED = ADS.every((a) => SHOWCASE_PHOTOS[a.key]);
const ALL_RENDERS = ADS.every((a) => SHOWCASE_PHOTOS[a.key]?.source === "Render");

const RATIO: Record<Format, string> = { story: "9 / 16", feed: "4 / 5", square: "1 / 1" };
const FORMAT_LABEL: Record<Format, string> = { story: "Story · 9:16", feed: "Feed · 4:5", square: "Feed · 1:1" };

const FACE: Record<Direction["face"], CSSProperties> = {
  serif: { fontFamily: "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif", fontWeight: 500, letterSpacing: "-0.015em" },
  sans: { fontWeight: 700, letterSpacing: "-0.03em" },
  display: { fontWeight: 800, letterSpacing: "-0.01em", textTransform: "uppercase" },
};

function Poster({ ad }: { ad: SampleAd }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const d = DIRECTION[ad.key];
  const photo = SHOWCASE_PHOTOS[ad.key];
  // Type on a picture is white over a scrim unless the picture says it's light
  // behind the headline.
  const dark = photo ? photo.ink === "dark" : d.ink === "dark";
  const ink = dark ? "#1b1a17" : "#ffffff";
  const sub = dark ? "rgba(27,26,23,0.68)" : "rgba(255,255,255,0.78)";
  return (
    <figure className="group">
      <div className="relative overflow-hidden rounded-[18px] shadow-[0_1px_0_rgba(0,0,0,0.04),0_24px_50px_-28px_rgba(30,25,15,0.45)] ring-1 ring-black/[0.06] transition duration-500 group-hover:-translate-y-0.5 group-hover:shadow-[0_1px_0_rgba(0,0,0,0.04),0_34px_60px_-30px_rgba(30,25,15,0.55)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0" style={{ aspectRatio: RATIO[d.format] }}>
        <div className="absolute inset-0">
          {photo ? (
            <Image src={photo.src} alt={photo.alt} fill sizes="(min-width: 1024px) 400px, (min-width: 768px) 50vw, 300px" className="object-cover" style={{ objectPosition: photo.focus ?? "center" }} />
          ) : (
            ad.art(id)
          )}
        </div>
        {/* A scrim only where the type sits. */}
        {!dark && <div aria-hidden className="absolute inset-0" style={{ background: d.place === "top" ? "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 46%)" : "linear-gradient(0deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0) 52%)" }} />}
        <div className={`absolute inset-x-0 flex flex-col p-[7%] ${d.place === "top" ? "top-0" : "bottom-0"}`}>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.02em]" style={{ color: sub, order: d.place === "top" ? 0 : 2, marginTop: d.place === "top" ? 0 : 10 }}>
            <span aria-hidden className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold" style={{ background: dark ? "#1b1a17" : "rgba(255,255,255,0.92)", color: dark ? "#fff" : "#1b1a17" }}>
              {ad.brand.charAt(0)}
            </span>
            {ad.brand}
          </p>
          <p className="mt-2.5 text-[clamp(19px,1.9vw,26px)] leading-[1.06] [text-wrap:balance]" style={{ ...FACE[d.face], color: d.accent && d.face === "display" ? "#fff" : ink, order: 1 }}>
            {ad.headline}
          </p>
          {d.accent && <span aria-hidden className="mt-3 block h-[3px] w-10 rounded-full" style={{ background: d.accent, order: 1 }} />}
          {d.place === "bottom" && (
            <span className="mt-3 inline-flex w-fit items-center rounded-full bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#1b1a17]" style={{ order: 3 }}>
              {ad.cta}
            </span>
          )}
        </div>
        <span className={`absolute right-2.5 rounded-full px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.12em] ${d.place === "top" ? "bottom-2.5" : "top-2.5"}`} style={{ background: dark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.5)", color: dark ? "#1b1a17" : "#fff" }}>
          Sample
        </span>
        {d.place === "top" && (
          <span className="absolute bottom-[6%] left-[7%] inline-flex items-center rounded-full px-3 py-1.5 text-[11.5px] font-semibold" style={{ background: dark ? "#1b1a17" : "#ffffff", color: dark ? "#fff" : "#1b1a17" }}>
            {ad.cta}
          </span>
        )}
      </div>
      <figcaption className="mt-2.5 px-0.5 text-[12.5px]">
        <span className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-[#2a2925]">{ad.category}</span>
          <span className="text-[#77736a]">{FORMAT_LABEL[d.format]}</span>
        </span>
        {photo && photo.source !== "Owner" && photo.source !== "Render" && (
          <span className="mt-0.5 block text-[11px] text-[#8a867c]">
            Photo:{" "}
            {photo.href ? (
              <a href={photo.href} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-[#2a2925] hover:underline">
                {photo.credit} / {photo.source}
              </a>
            ) : (
              <>{photo.credit} / {photo.source}</>
            )}
          </span>
        )}
      </figcaption>
    </figure>
  );
}

export function CreativeShowcase() {
  return (
    <section id="showcase" aria-labelledby="showcase-title" className="relative scroll-mt-16 bg-[#f4f1ea] py-20 text-[#171717] sm:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12">
        <div className="grid items-end gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div data-reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#ffffff]">Creative showcase</p>
            <h2 id="showcase-title" className="mt-3 text-[clamp(32px,4.6vw,60px)] font-semibold leading-[1.0] tracking-[-0.045em] [text-wrap:balance]">
              See the possibilities for your next campaign.
            </h2>
          </div>
          <p data-reveal className="max-w-[460px] text-[16.5px] leading-relaxed text-[#55524b] lg:justify-self-end">
            {ALL_RENDERS
              ? "Ads written from what a business says about itself, set in the format they\u2019d run in. Every brand here is fictional and every picture a 3D product render made for this page — the shape of what MAIRO helps you make, not a result."
              : ALL_PICTURED
                ? "Ads written from what a business says about itself, set in the format they\u2019d run in. Every brand here is fictional and the photos are licensed stock photography — the shape of what MAIRO helps you make, not a result."
                : "Ads written from what a business says about itself, set in the format they\u2019d run in. Every brand here is fictional and every picture a drawn sample — the shape of what MAIRO helps you make, not a result."}
          </p>
        </div>

        {/* A portfolio on wider screens… */}
        <ul aria-label="Sample ads for fictional businesses" className="mt-14 hidden gap-6 md:block md:columns-2 lg:columns-3 [&>li]:mb-7 [&>li]:break-inside-avoid">
          {ADS.map((ad) => (
            <li key={ad.key}>
              <Poster ad={ad} />
            </li>
          ))}
        </ul>
        {/* …and a row to swipe on a phone. */}
      </div>
      <ul tabIndex={0} aria-label="Sample ads for fictional businesses — swipe for more" className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffffff]/50 md:hidden">
        {ADS.map((ad) => (
          <li key={ad.key} className="w-[72vw] max-w-[300px] shrink-0 snap-center">
            <Poster ad={ad} />
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-8 flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <p className="max-w-[560px] text-[13px] leading-relaxed text-[#6b675e]">Your concepts are free in your plan. Finished pictures, made from your own photos or MAIRO&rsquo;s image credits, come with a subscription — always for you to approve.</p>
        <Link href="/preview" className="inline-flex min-h-[50px] items-center gap-2 rounded-full bg-[#171717] px-6 text-[14.5px] font-semibold text-black transition hover:bg-[#ffffff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ffffff]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f4f1ea]">
          See what MAIRO would make for you <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
