"use client";

import { useId, type ReactNode } from "react";
import { SHOWCASE_PHOTOS } from "./showcase-photos";

// Sample ad creatives for the kinds of business MAIRO advertises, shown on
// the homepage and in the Creative Studio clip. Every business is invented,
// every picture is a 3D product render made for the website (listed in
// showcase-photos.ts; no stock photos, no people presented as customers), and
// every card says "Sample creative" — they show the shape of what MAIRO helps
// make, never a real ad or a real result.

export type SampleAd = {
  key: string;
  category: string;
  brand: string;
  headline: string;
  body: string;
  cta: string;
  art: (id: string) => ReactNode;
};

// ── The pictures: the showcase's product renders, one per kind of business ─

function rendered(key: string): () => ReactNode {
  return function picture() {
    const p = SHOWCASE_PHOTOS[key];
    if (!p) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={p.src} alt={p.alt} className="block h-full w-full object-cover" style={{ objectPosition: p.focus ?? "center" }} decoding="async" draggable={false} />;
  };
}

const fashion = rendered("fashion");
const skincare = rendered("skincare");
const fitness = rendered("fitness");
const furniture = rendered("furniture");
const realEstate = rendered("realestate");
const professional = rendered("services");
const luxury = rendered("luxury");
const onlineStore = rendered("online");
const localService = rendered("local");

export const SAMPLE_ADS: SampleAd[] = [
  { key: "fashion", category: "Fashion", brand: "Harlow & Pine", headline: "The overshirt you'll wear all autumn.", body: "Heavy cotton twill, cut to layer. Made in small runs.", cta: "Shop now", art: fashion },
  { key: "skincare", category: "Beauty & skincare", brand: "Lumen Botanics", headline: "Three steps. Two minutes. Every morning.", body: "A gentle routine for skin that's easily irritated.", cta: "Shop now", art: skincare },
  { key: "fitness", category: "Fitness", brand: "Northside Strength", headline: "Your first class is on us.", body: "Small-group strength sessions, coached from day one.", cta: "Book now", art: fitness },
  { key: "furniture", category: "Home & furniture", brand: "Alder House", headline: "A sofa built for staying in.", body: "Solid oak frame, washable covers, delivered and assembled.", cta: "Shop now", art: furniture },
  { key: "realestate", category: "Real estate", brand: "Crestline Homes", headline: "Thinking of selling this spring?", body: "Get a free valuation from an agent who knows your street.", cta: "Get a quote", art: realEstate },
  { key: "services", category: "Professional services", brand: "Ledger & Lane", headline: "Your books, done before the deadline.", body: "Bookkeeping and tax returns for small businesses, fixed monthly fee.", cta: "Learn more", art: professional },
  { key: "luxury", category: "Luxury", brand: "Maison Ardent", headline: "Hand-finished. Made to order.", body: "Each piece set by hand in our atelier, in eight to ten weeks.", cta: "Learn more", art: luxury },
  { key: "online", category: "Online stores", brand: "Fernleaf Ceramics", headline: "Free shipping over $60.", body: "Handmade stoneware mugs — two and you're there.", cta: "Shop now", art: onlineStore },
  { key: "local", category: "Local services", brand: "Brightwater Plumbing", headline: "Leak under the sink? We'll find it.", body: "A licensed plumber at your door this week, price agreed first.", cta: "Get a quote", art: localService },
];

/** One sample ad as it would sit in a feed, labelled as a sample. */
export function SampleAdCard({ ad, className = "", compact = false }: { ad: SampleAd; className?: string; compact?: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <figure className={`overflow-hidden rounded-[18px] border bg-[#161616] text-left shadow-[0_30px_70px_-34px_rgba(0,0,0,0.95)] ${className}`} style={{ borderColor: "rgba(236,236,236,0.16)" }}>
      <div className={`flex items-center gap-2 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
        <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] font-semibold text-black ${compact ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]"}`}>{ad.brand.charAt(0)}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-semibold text-white ${compact ? "text-[10.5px]" : "text-[12.5px]"}`}>{ad.brand}</span>
          <span className={`block text-white/45 ${compact ? "text-[8.5px]" : "text-[10.5px]"}`}>Sponsored</span>
        </span>
      </div>
      {!compact && <p className="px-3 pb-2.5 text-[12px] leading-snug text-white/80">{ad.body}</p>}
      <div className="relative aspect-[4/5] overflow-hidden">
        {ad.art(id)}
        <span className={`absolute left-2 top-2 rounded-full bg-black/55 font-semibold uppercase tracking-[0.12em] text-white/90 ${compact ? "px-1.5 py-0.5 text-[7.5px]" : "px-2 py-0.5 text-[9px]"}`}>Sample creative</span>
      </div>
      <div className={`flex items-center gap-2 bg-white/[0.04] ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
        <p className={`min-w-0 flex-1 font-semibold leading-snug text-white [text-wrap:balance] ${compact ? "text-[10px]" : "text-[13px]"}`}>{ad.headline}</p>
        <span className={`shrink-0 rounded-md bg-white/[0.1] font-semibold text-white/90 ${compact ? "px-1.5 py-1 text-[8.5px]" : "px-2.5 py-1.5 text-[11.5px]"}`}>{ad.cta}</span>
      </div>
      <figcaption className={`border-t border-white/[0.06] text-white/50 ${compact ? "px-2.5 py-1.5 text-[8.5px]" : "px-3 py-2 text-[11px]"}`}>{ad.category} · fictional brand</figcaption>
    </figure>
  );
}
