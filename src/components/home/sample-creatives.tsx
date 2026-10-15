"use client";

import { useId, type ReactNode } from "react";
import { BusinessArt } from "@/components/hero-story/art";

// Sample ad creatives for the kinds of business MAIRO advertises, shown on
// the homepage and in the Creative Studio clip. Every business is invented,
// every picture is drawn here (no stock photos, no people presented as
// customers), and every card says "Sample creative" — they show the shape of
// what MAIRO helps make, never a real ad or a real result.

export type SampleAd = {
  key: string;
  category: string;
  brand: string;
  headline: string;
  body: string;
  cta: string;
  art: (id: string) => ReactNode;
};

// ── The drawings: one restrained still life per kind of business ──────────

function Frame({ id, from, to, glow, children }: { id: string; from: string; to: string; glow: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.72" cy="0.18" r="0.7">
          <stop offset="0" stopColor={glow} stopOpacity="0.55" />
          <stop offset="1" stopColor={glow} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="500" fill={`url(#${id}-bg)`} />
      <rect width="400" height="500" fill={`url(#${id}-glow)`} />
      {children}
    </svg>
  );
}

const fashion = (id: string) => (
  <Frame id={id} from="#e9e1d6" to="#cfc2b0" glow="#ffffff">
    <rect x="0" y="392" width="400" height="108" fill="#bfae97" />
    <path d="M200 92 q0 -18 16 -18 q16 0 16 16 q0 12 -14 18 l-18 8" fill="none" stroke="#5b4a3a" strokeWidth="4" strokeLinecap="round" />
    <path d="M200 116 L120 168 L140 182 L200 150 L260 182 L280 168 Z" fill="#8a6f55" />
    <path d="M140 170 L132 380 Q200 396 268 380 L260 170 Q230 196 200 196 Q170 196 140 170 Z" fill="#2f3b2f" />
    <path d="M200 196 L200 380" stroke="#24301f" strokeWidth="2" />
    <circle cx="200" cy="232" r="4" fill="#c9b48f" />
    <circle cx="200" cy="268" r="4" fill="#c9b48f" />
    <circle cx="200" cy="304" r="4" fill="#c9b48f" />
  </Frame>
);

const skincare = (id: string) => (
  <Frame id={id} from="#f4e8e2" to="#e6cfc6" glow="#ffffff">
    <ellipse cx="200" cy="410" rx="170" ry="26" fill="#d9bcb0" />
    <rect x="150" y="150" width="70" height="250" rx="16" fill="#f8f3ef" stroke="#c8a597" strokeWidth="2" />
    <rect x="166" y="112" width="38" height="42" rx="6" fill="#b88a78" />
    <rect x="160" y="230" width="50" height="70" rx="4" fill="#ead8cf" />
    <rect x="236" y="250" width="86" height="150" rx="40" fill="#fbf7f4" stroke="#c8a597" strokeWidth="2" />
    <rect x="252" y="226" width="54" height="30" rx="8" fill="#b88a78" />
    <circle cx="112" cy="380" r="26" fill="#efe2db" stroke="#c8a597" strokeWidth="2" />
    <path d="M100 372 q12 -10 24 0" stroke="#c8a597" strokeWidth="2" fill="none" />
  </Frame>
);

const fitness = (id: string) => (
  <Frame id={id} from="#13202c" to="#0a1018" glow="#38bdf8">
    <rect x="0" y="380" width="400" height="120" fill="#0d151e" />
    <rect x="96" y="300" width="208" height="16" rx="8" fill="#9fb3c4" />
    <rect x="70" y="262" width="34" height="92" rx="8" fill="#e8eef3" />
    <rect x="42" y="276" width="30" height="64" rx="8" fill="#c7d2dc" />
    <rect x="296" y="262" width="34" height="92" rx="8" fill="#e8eef3" />
    <rect x="328" y="276" width="30" height="64" rx="8" fill="#c7d2dc" />
    <path d="M110 170 h180" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    <path d="M140 196 h120" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" opacity="0.4" />
  </Frame>
);

const furniture = (id: string) => (
  <Frame id={id} from="#e7e4dc" to="#d3cec2" glow="#fff6e0">
    <rect x="0" y="380" width="400" height="120" fill="#b8a991" />
    <rect x="96" y="210" width="208" height="120" rx="26" fill="#6f7f6a" />
    <rect x="80" y="282" width="240" height="70" rx="22" fill="#7f9079" />
    <rect x="106" y="350" width="10" height="40" rx="4" fill="#5c4632" />
    <rect x="284" y="350" width="10" height="40" rx="4" fill="#5c4632" />
    <rect x="300" y="120" width="6" height="160" fill="#5c4632" />
    <path d="M266 120 h74 l-14 -44 h-46 Z" fill="#efe3c6" />
    <circle cx="303" cy="298" r="0" />
  </Frame>
);

const realEstate = (id: string) => (
  <Frame id={id} from="#cfe0ef" to="#9fb9d1" glow="#ffffff">
    <rect x="0" y="380" width="400" height="120" fill="#7f9a6f" />
    <path d="M90 230 L200 150 L310 230 L310 390 L90 390 Z" fill="#f6f2ea" />
    <path d="M76 238 L200 146 L324 238" fill="none" stroke="#3d4b5c" strokeWidth="12" strokeLinejoin="round" />
    <rect x="178" y="306" width="44" height="84" rx="4" fill="#3d4b5c" />
    <rect x="118" y="258" width="44" height="40" rx="3" fill="#a8c4dd" stroke="#3d4b5c" strokeWidth="3" />
    <rect x="238" y="258" width="44" height="40" rx="3" fill="#a8c4dd" stroke="#3d4b5c" strokeWidth="3" />
    <circle cx="330" cy="352" r="34" fill="#5f7d52" />
    <circle cx="70" cy="360" r="26" fill="#5f7d52" />
  </Frame>
);

const professional = (id: string) => (
  <Frame id={id} from="#18233a" to="#0b1120" glow="#2f6bff">
    <rect x="96" y="120" width="208" height="270" rx="12" fill="#f3f5f9" />
    <rect x="124" y="156" width="110" height="12" rx="6" fill="#2f3b52" />
    <rect x="124" y="190" width="152" height="8" rx="4" fill="#b7c0cf" />
    <rect x="124" y="210" width="140" height="8" rx="4" fill="#b7c0cf" />
    <rect x="124" y="230" width="150" height="8" rx="4" fill="#b7c0cf" />
    <rect x="124" y="290" width="152" height="60" rx="8" fill="#e3e9f5" />
    <path d="M140 334 l22 -16 l18 10 l28 -24 l20 12" stroke="#2f6bff" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="250" y="360" width="90" height="16" rx="8" fill="#c79a4b" transform="rotate(-24 295 368)" />
  </Frame>
);

const luxury = (id: string) => (
  <Frame id={id} from="#17130c" to="#0b0907" glow="#d6b266">
    <rect x="110" y="300" width="180" height="90" rx="10" fill="#1f1a12" stroke="#6b5631" strokeWidth="2" />
    <ellipse cx="200" cy="250" rx="58" ry="58" fill="none" stroke="#d6b266" strokeWidth="12" />
    <ellipse cx="200" cy="250" rx="58" ry="58" fill="none" stroke="#f3dfa8" strokeWidth="2" opacity="0.6" />
    <path d="M182 186 L200 160 L218 186 L200 200 Z" fill="#e9f2ff" stroke="#bcd0ea" strokeWidth="2" />
    <path d="M60 120 l6 -14 l6 14 l14 6 l-14 6 l-6 14 l-6 -14 l-14 -6 Z" fill="#d6b266" opacity="0.5" />
  </Frame>
);

const onlineStore = (id: string) => (
  <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" data-art={id}>
    <BusinessArt type="shop" variant="offer" />
  </div>
);

const localService = (id: string) => (
  <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" data-art={id}>
    <BusinessArt type="service" variant="demo" />
  </div>
);

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
    <figure className={`overflow-hidden rounded-[18px] border bg-[#0b1020] text-left shadow-[0_30px_70px_-34px_rgba(0,0,0,0.95)] ${className}`} style={{ borderColor: "rgba(150,170,210,0.16)" }}>
      <div className={`flex items-center gap-2 ${compact ? "px-2.5 py-2" : "px-3 py-2.5"}`}>
        <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-[image:var(--mairo-ramp)] font-semibold text-white ${compact ? "h-5 w-5 text-[9px]" : "h-7 w-7 text-[11px]"}`}>{ad.brand.charAt(0)}</span>
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
