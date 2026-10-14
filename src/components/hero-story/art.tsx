"use client";

import { useId } from "react";
import type { ExampleType } from "@/lib/demo/examples";

// Original illustrations for the three fictional businesses — drawn here, no
// stock photos, no people presented as customers. Each business has three
// framings: the product or service itself, the problem it solves (or how it
// works), and the offer.

type Variant = "demo" | "problem" | "offer" | "site";

export function BusinessArt({ type, variant, className = "" }: { type: ExampleType; variant: Variant; className?: string }) {
  const Art = type === "shop" ? ShopArt : type === "service" ? ServiceArt : SalonArt;
  // Each drawing's gradients get their own ids, so the same picture can appear more than once on a page.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} role="img" aria-label={LABEL[type][variant]}>
      <Art variant={variant} uid={uid} />
    </svg>
  );
}

const LABEL: Record<ExampleType, Record<Variant, string>> = {
  shop: { demo: "A handmade stoneware mug of coffee on a wooden table", problem: "Two sturdy stoneware mugs on a shelf", offer: "A gift box with two mugs", site: "A handmade stoneware mug on a table" },
  service: { demo: "Pipes under a kitchen sink with a wrench", problem: "A pipe joint being tightened with a wrench", offer: "A plumber's van and a written estimate", site: "A plumber's tools under a sink" },
  appointments: { demo: "A salon chair in front of a round mirror", problem: "A phone showing an online booking calendar", offer: "Scissors and a comb with a gift tag", site: "A bright hair salon" },
  brands: { demo: "A salon chair in front of a round mirror", problem: "A phone showing an online booking calendar", offer: "Scissors and a comb with a gift tag", site: "A bright hair salon" },
};

function ShopArt({ variant, uid }: { variant: Variant; uid: string }) {
  const mug = (x: number, y: number, s = 1, glaze = "#3f6b4f") => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="96" rx="64" ry="10" fill="#000" opacity="0.18" />
      <path d="M-56 0 h112 v70 a34 34 0 0 1 -34 28 h-44 a34 34 0 0 1 -34 -28 z" fill="#efe4cf" />
      <path d="M-56 0 h112 v26 c-12 8 -24 2 -36 9 c-14 8 -26 0 -40 6 c-14 6 -26 -2 -36 3 z" fill={glaze} />
      <path d="M56 18 c34 0 34 48 0 48" fill="none" stroke="#e2d4ba" strokeWidth="14" strokeLinecap="round" />
      <ellipse cx="0" cy="0" rx="56" ry="11" fill="#2f2219" />
      <ellipse cx="0" cy="-1" rx="50" ry="8" fill="#6b4630" />
      <path d="M-44 30 v34" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`shop-wall-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6efe2" />
          <stop offset="1" stopColor="#e7d8bd" />
        </linearGradient>
        <linearGradient id={`shop-wood-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#b9875c" />
          <stop offset="1" stopColor="#8a5a37" />
        </linearGradient>
        <radialGradient id={`shop-sun-${uid}`} cx="0.85" cy="0.1" r="0.8">
          <stop offset="0" stopColor="#fff6dd" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fff6dd" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#shop-wall-${uid})`} />
      <rect width="400" height="300" fill={`url(#shop-sun-${uid})`} />
      <rect y="214" width="400" height="86" fill={`url(#shop-wood-${uid})`} />
      <path d="M0 226 H400 M0 250 H400 M0 276 H400" stroke="#7a4d2e" strokeWidth="1.5" opacity="0.35" />
      {variant === "demo" || variant === "site" ? (
        <>
          {mug(190, 132, 1.05)}
          <g fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" opacity="0.75">
            <path d="M170 104 c-10 -16 10 -24 0 -40" />
            <path d="M196 98 c-10 -18 12 -26 0 -46" />
            <path d="M222 104 c-10 -16 10 -24 0 -40" />
          </g>
          <g transform="translate(320 150)">
            <path d="M0 64 c-6 -30 4 -54 26 -70 c-4 26 -10 46 -26 70z" fill="#5f8a63" />
            <path d="M0 64 c-14 -26 -32 -38 -52 -40 c10 20 28 34 52 40z" fill="#4c7651" />
            <rect x="-16" y="60" width="32" height="28" rx="4" fill="#c2683f" />
          </g>
        </>
      ) : variant === "problem" ? (
        <>
          <rect x="40" y="96" width="320" height="10" rx="3" fill="#8a5a37" />
          {mug(120, 2, 0.8, "#3f6b4f")}
          {mug(280, 2, 0.8, "#c2683f")}
          {mug(200, 134, 0.95, "#3f6b4f")}
          <g transform="translate(330 186)">
            <circle r="26" fill="#fff" opacity="0.9" />
            <path d="M-12 0 l8 9 l16 -18" fill="none" stroke="#3f6b4f" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </>
      ) : (
        <>
          <g transform="translate(140 120)">
            <rect x="-78" y="20" width="156" height="94" rx="8" fill="#c2683f" />
            <rect x="-84" y="6" width="168" height="26" rx="6" fill="#d77b50" />
            <rect x="-10" y="6" width="20" height="108" fill="#e9dcc4" />
            <path d="M0 6 c-20 -30 -46 -20 -30 -4 M0 6 c20 -30 46 -20 30 -4" fill="none" stroke="#e9dcc4" strokeWidth="8" strokeLinecap="round" />
          </g>
          {mug(290, 132, 0.85)}
        </>
      )}
    </>
  );
}

function ServiceArt({ variant, uid }: { variant: Variant; uid: string }) {
  const wrench = (x: number, y: number, rot: number, s = 1) => (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <rect x="-8" y="0" width="16" height="120" rx="8" fill="#9aa8bd" />
      <path d="M-26 -24 a26 26 0 1 0 52 0 l-12 0 l0 14 l-28 0 l0 -14 z" fill="#b8c4d6" />
      <rect x="-5" y="40" width="10" height="70" rx="5" fill="#7f8da3" />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`svc-bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e9f1fb" />
          <stop offset="1" stopColor="#cfdcee" />
        </linearGradient>
        <linearGradient id={`svc-pipe-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#9aa7ba" />
          <stop offset="0.5" stopColor="#e6ecf4" />
          <stop offset="1" stopColor="#8c99ad" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#svc-bg-${uid})`} />
      {variant === "offer" ? (
        <>
          <rect y="236" width="400" height="64" fill="#9fb2cc" />
          <g transform="translate(40 120)">
            <path d="M0 110 V30 a14 14 0 0 1 14 -14 h150 l46 40 h40 a10 10 0 0 1 10 10 v44 z" fill="#123a6b" />
            <path d="M168 22 l38 34 h-38 z" fill="#9cc3f5" />
            <rect x="18" y="34" width="132" height="34" rx="5" fill="#1d4f8f" />
            <text x="26" y="58" fontSize="17" fontWeight="700" fill="#f5b83d" fontFamily="system-ui, sans-serif">Brightwater</text>
            <circle cx="56" cy="112" r="20" fill="#1f2937" />
            <circle cx="56" cy="112" r="8" fill="#9aa8bd" />
            <circle cx="210" cy="112" r="20" fill="#1f2937" />
            <circle cx="210" cy="112" r="8" fill="#9aa8bd" />
            <rect x="10" y="4" width="150" height="8" rx="4" fill="#9aa8bd" />
          </g>
          <g transform="translate(300 40) rotate(6)">
            <rect width="84" height="112" rx="6" fill="#fff" />
            <rect x="12" y="14" width="44" height="7" rx="3" fill="#123a6b" />
            {[34, 50, 66, 82].map((y) => (
              <g key={y}>
                <path d={`M14 ${y} l5 5 l9 -10`} fill="none" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
                <rect x="34" y={y - 2} width="36" height="5" rx="2" fill="#cbd5e1" />
              </g>
            ))}
          </g>
        </>
      ) : (
        <>
          <rect x="0" y="0" width="400" height="62" fill="#f7fafd" />
          <rect x="0" y="54" width="400" height="14" fill="#dbe4ef" />
          <rect x="120" y="40" width="160" height="22" rx="4" fill="#c4d0df" />
          <rect x="30" y="68" width="340" height="232" fill="#f3f6fa" />
          <rect x="42" y="78" width="316" height="222" rx="6" fill="#e3e9f1" />
          <path d="M200 62 V140 a28 28 0 0 0 28 28 h18 a20 20 0 0 1 20 20 v14 a20 20 0 0 1 -20 20 h-120" fill="none" stroke={`url(#svc-pipe-${uid})`} strokeWidth="22" strokeLinecap="round" />
          <rect x="186" y="98" width="28" height="18" rx="4" fill="#b8c4d6" />
          <rect x="236" y="160" width="18" height="26" rx="4" fill="#b8c4d6" />
          {variant === "problem" ? (
            <>
              {wrench(272, 120, 52, 0.9)}
              <path d="M246 196 c0 6 -9 14 -9 20 a9 9 0 0 0 18 0 c0 -6 -9 -14 -9 -20 z" fill="#3b82f6" opacity="0.85" />
              <g transform="translate(330 250)">
                <circle r="22" fill="#fff" />
                <path d="M-10 0 l7 8 l14 -16" fill="none" stroke="#16a34a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </>
          ) : (
            <>
              <path d="M126 236 c0 8 -12 18 -12 26 a12 12 0 0 0 24 0 c0 -8 -12 -18 -12 -26 z" fill="#3b82f6" opacity="0.9" />
              {wrench(96, 166, -28, 0.85)}
              <g transform="translate(280 228)">
                <rect x="-52" y="0" width="104" height="58" rx="8" fill="#f5b83d" />
                <rect x="-52" y="0" width="104" height="18" rx="8" fill="#e3a52a" />
                <rect x="-18" y="-14" width="36" height="18" rx="6" fill="none" stroke="#c98a12" strokeWidth="6" />
              </g>
            </>
          )}
        </>
      )}
    </>
  );
}

function SalonArt({ variant, uid }: { variant: Variant; uid: string }) {
  const scissors = (x: number, y: number, rot: number, s = 1) => (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M0 0 L70 -10 L72 -4 L4 6 z" fill="#d6d3de" />
      <path d="M0 0 L70 10 L72 4 L4 -6 z" fill="#bdb8c9" />
      <circle cx="-14" cy="-12" r="12" fill="none" stroke="#c9a227" strokeWidth="6" />
      <circle cx="-14" cy="12" r="12" fill="none" stroke="#c9a227" strokeWidth="6" />
      <circle cx="2" cy="0" r="3" fill="#7a6f8f" />
    </g>
  );
  return (
    <>
      <defs>
        <linearGradient id={`sal-bg-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbf1f0" />
          <stop offset="1" stopColor="#f0d9dc" />
        </linearGradient>
        <radialGradient id={`sal-mirror-${uid}`} cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9c6cf" />
        </radialGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#sal-bg-${uid})`} />
      <rect y="232" width="400" height="68" fill="#e3c6c9" />
      {variant === "problem" ? (
        <>
          <g transform="translate(150 40)">
            <rect width="120" height="220" rx="20" fill="#2b1326" />
            <rect x="8" y="16" width="104" height="188" rx="12" fill="#fff" />
            <rect x="18" y="28" width="60" height="8" rx="4" fill="#4b2142" />
            {[0, 1, 2, 3, 4].map((r) =>
              [0, 1, 2, 3].map((c) => (
                <rect key={`${r}-${c}`} x={18 + c * 22} y={48 + r * 22} width="16" height="16" rx="4" fill={r === 2 && c === 1 ? "#4b2142" : "#f3e3e6"} />
              )),
            )}
            <rect x="18" y="168" width="84" height="22" rx="11" fill="#4b2142" />
            <text x="60" y="183" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">Book Sat 10:00</text>
          </g>
          {scissors(300, 220, -30, 0.9)}
        </>
      ) : variant === "offer" ? (
        <>
          {scissors(140, 170, -18, 1.3)}
          <g transform="translate(150 196) rotate(-8)">
            <rect width="150" height="16" rx="5" fill="#4b2142" />
            {Array.from({ length: 14 }).map((_, i) => <rect key={i} x={8 + i * 10} y="12" width="4" height="16" rx="2" fill="#4b2142" />)}
          </g>
          <g transform="translate(290 70) rotate(12)">
            <path d="M0 0 h80 l20 30 l-20 30 h-80 z" fill="#c9a227" />
            <circle cx="12" cy="30" r="6" fill="#fbf1f0" />
            <text x="48" y="27" textAnchor="middle" fontSize="11" fontWeight="700" fill="#2b1326" fontFamily="system-ui, sans-serif">Free</text>
            <text x="48" y="41" textAnchor="middle" fontSize="10" fill="#2b1326" fontFamily="system-ui, sans-serif">fringe trim</text>
          </g>
        </>
      ) : (
        <>
          <circle cx="200" cy="96" r="70" fill="#c9a227" />
          <circle cx="200" cy="96" r="62" fill={`url(#sal-mirror-${uid})`} />
          <path d="M170 70 q30 -22 60 0" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" opacity="0.8" />
          <g transform="translate(200 172)">
            <rect x="-56" y="0" width="112" height="70" rx="22" fill="#4b2142" />
            <rect x="-66" y="44" width="132" height="22" rx="11" fill="#5b2a51" />
            <rect x="-8" y="66" width="16" height="30" fill="#7a6f8f" />
            <ellipse cx="0" cy="98" rx="44" ry="8" fill="#7a6f8f" />
          </g>
          <g transform="translate(320 120)">
            <rect x="-6" y="-60" width="12" height="60" fill="#c9a227" />
            <path d="M-26 0 h52 a10 10 0 0 1 10 10 v8 h-72 v-8 a10 10 0 0 1 10 -10 z" fill="#e8b4bc" />
            <rect x="-30" y="18" width="60" height="14" rx="4" fill="#d79aa4" />
          </g>
          {scissors(70, 230, -12, 0.75)}
        </>
      )}
    </>
  );
}
