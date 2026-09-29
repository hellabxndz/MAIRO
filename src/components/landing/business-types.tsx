"use client";

import Link from "next/link";
import { useState } from "react";

// "Built for the way you do business": pick a kind of business and see how
// Mairo would run its advertising. Every figure here is a sample campaign and
// is labelled so — nothing on this section is a customer's result.

type Stat = { k: string; v: string };

type BusinessType = {
  key: string;
  label: string;
  icon: React.ReactNode;
  headline: string;
  goal: string;
  platforms: string;
  examples?: string;
  steps: string[];
  stats?: Stat[];
  clients?: { name: string; status: string; tone: string; spend: string; note: string }[];
  cta: { label: string; href: string };
};

const TYPES: BusinessType[] = [
  {
    key: "ecommerce",
    label: "Ecommerce",
    icon: <path d="M3 4h2.5l2.2 10.5h10.2L20 7.5H7M9 19.5a1 1 0 1 0 0-.01M17 19.5a1 1 0 1 0 0-.01" />,
    headline: "Sell more products with Mairo.",
    goal: "Increase purchases",
    platforms: "Facebook + Instagram",
    steps: [
      "Analyze your products",
      "Find the products most likely to sell",
      "Generate product ads",
      "Create retargeting audiences",
      "Test multiple creatives",
      "Move budget toward winning products",
      "Track purchases and ROAS",
    ],
    stats: [
      { k: "Ad spend", v: "$1,240" },
      { k: "Revenue", v: "$4,830" },
      { k: "Purchases", v: "38" },
      { k: "ROAS", v: "3.9x" },
    ],
    cta: { label: "Start advertising your store", href: "/sign-up" },
  },
  {
    key: "local",
    label: "Local Business",
    icon: <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
    headline: "Turn nearby customers into appointments.",
    goal: "Get more local customers",
    platforms: "Facebook + Instagram",
    examples: "Barbershop · Restaurant · Gym",
    steps: [
      "Find customers near your business",
      "Create local ads",
      "Promote your offers",
      "Optimize for calls and bookings",
      "Retarget previous visitors",
      "Track leads and appointments",
    ],
    stats: [
      { k: "Ad spend", v: "$620" },
      { k: "Leads", v: "84" },
      { k: "Cost per lead", v: "$7.38" },
      { k: "Bookings", v: "31" },
    ],
    cta: { label: "Start advertising locally", href: "/sign-up" },
  },
  {
    key: "service",
    label: "Service Business",
    icon: <path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17l3 3 5.2-5.2a4 4 0 0 0 5.3-5.3l-2.6 2.6-2.3-.7-.7-2.3z" />,
    headline: "Turn ad clicks into qualified leads.",
    goal: "Get more qualified leads",
    platforms: "Facebook + Instagram",
    examples: "Roofing · Real estate · Cleaning · Landscaping · Consulting · Legal services",
    steps: [
      "Identify likely customers",
      "Generate lead-focused ads",
      "Build retargeting audiences",
      "Optimize your cost per lead",
      "Track lead quality",
      "Recommend budget changes",
    ],
    stats: [
      { k: "Ad spend", v: "$900" },
      { k: "Leads", v: "57" },
      { k: "Cost per lead", v: "$15.79" },
      { k: "Qualified", v: "22" },
    ],
    cta: { label: "Start getting leads", href: "/sign-up" },
  },
  {
    key: "creator",
    label: "Creator",
    icon: <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5zM10 9.5v5l4.5-2.5z" />,
    headline: "Grow your audience and monetize your content.",
    goal: "Grow followers and sales",
    platforms: "Facebook + Instagram",
    steps: [
      "Promote your best-performing content",
      "Find new audiences",
      "Grow followers",
      "Promote your products or offers",
      "Test creative hooks",
      "Track customer acquisition",
    ],
    stats: [
      { k: "Ad spend", v: "$300" },
      { k: "Profile visits", v: "3,480" },
      { k: "New followers", v: "1,240" },
      { k: "Per follower", v: "$0.24" },
    ],
    cta: { label: "Start growing", href: "/sign-up" },
  },
  {
    key: "agency",
    label: "Agency",
    icon: <path d="M4 20V8l8-4 8 4v12M9 20v-5h6v5M8 11h.01M12 11h.01M16 11h.01" />,
    headline: "Manage every client from one AI-powered dashboard.",
    goal: "Run many ad accounts well",
    platforms: "Every client's own Meta account",
    steps: [
      "Manage multiple ad accounts",
      "Monitor every client",
      "Generate creatives",
      "Detect performance problems",
      "Recommend optimizations",
      "Generate client reports",
      "Team approval workflows",
    ],
    clients: [
      { name: "Northside Dental", status: "Healthy", tone: "text-emerald-300 bg-emerald-400/10", spend: "$1,860 / mo", note: "Cost per lead down this week" },
      { name: "Luma Skincare", status: "2 decisions", tone: "text-violet-200 bg-violet-400/15", spend: "$4,200 / mo", note: "Creative #3 is tiring" },
      { name: "Peak Roofing", status: "Needs attention", tone: "text-amber-300 bg-amber-400/10", spend: "$2,450 / mo", note: "Clicks but fewer calls" },
      { name: "Oak & Iron Gym", status: "Healthy", tone: "text-emerald-300 bg-emerald-400/10", spend: "$980 / mo", note: "Report ready for Friday" },
    ],
    cta: { label: "See Mairo for agencies", href: "/for-freelancers" },
  },
];

function Glyph({ d, className = "h-5 w-5" }: { d: React.ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {d}
    </svg>
  );
}

export function BusinessTypes() {
  const [active, setActive] = useState(TYPES[0].key);
  const t = TYPES.find((x) => x.key === active) ?? TYPES[0];

  return (
    <div>
      <div role="tablist" aria-label="Business type" className="-mx-5 flex snap-x gap-2.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {TYPES.map((x) => {
          const on = x.key === active;
          return (
            <button
              key={x.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setActive(x.key)}
              className={`flex min-h-[56px] shrink-0 snap-start items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[14.5px] font-semibold transition ${
                on
                  ? "border-violet-400/50 bg-gradient-to-br from-[#8b4dfb]/25 to-[#5f2dfd]/15 text-white shadow-[0_10px_40px_-18px_rgba(124,77,255,0.9)]"
                  : "border-white/[0.08] bg-white/[0.025] text-white/70 hover:border-white/20 hover:text-white"
              }`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${on ? "bg-[#7c4dff] text-white" : "bg-white/[0.06] text-violet-300"}`}>
                <Glyph d={x.icon} />
              </span>
              {x.label}
            </button>
          );
        })}
      </div>

      <div key={t.key} role="tabpanel" className="bt-in mt-6 grid grid-cols-1 gap-6 rounded-3xl border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.012] p-6 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
        <div>
          <h3 className="text-[clamp(24px,3vw,32px)] font-bold leading-tight tracking-[-0.02em]">{t.headline}</h3>
          <dl className="mt-5 grid grid-cols-2 gap-3 text-[13px]">
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-2.5">
              <dt className="text-white/50">Goal</dt>
              <dd className="mt-0.5 font-medium text-white">{t.goal}</dd>
            </div>
            <div className="rounded-xl border border-white/[0.07] bg-black/20 px-3.5 py-2.5">
              <dt className="text-white/50">Platforms</dt>
              <dd className="mt-0.5 font-medium text-white">{t.platforms}</dd>
            </div>
          </dl>
          {t.examples && <p className="mt-3 text-[13px] text-white/55">For example: {t.examples}</p>}
          <p className="mt-6 text-[13px] font-semibold uppercase tracking-[0.12em] text-violet-300">Mairo would</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {t.steps.map((s) => (
              <li key={s} className="flex items-start gap-2.5 text-[14px] text-white/80">
                <span aria-hidden className="mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#5b4ff5]">
                  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2.5 6.2 5 8.5l4.5-5" />
                  </svg>
                </span>
                {s}
              </li>
            ))}
          </ul>
          <Link
            href={t.cta.href}
            className="mt-7 inline-flex min-h-[48px] items-center gap-2 rounded-full bg-gradient-to-r from-[#8b4dfb] to-[#5f2dfd] px-6 text-[14.5px] font-semibold shadow-[0_12px_36px_-12px_rgba(124,77,255,0.9)] transition hover:brightness-110"
          >
            {t.cta.label} <span aria-hidden>→</span>
          </Link>
        </div>

        {/* The sample campaign, or for an agency, a sample client list. */}
        <div className="relative rounded-2xl border border-white/10 bg-[#070712] p-5">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-white">{t.clients ? "Agency dashboard" : "Sample campaign"}</p>
            <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Example</span>
          </div>
          {t.stats && (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {t.stats.map((s) => (
                  <div key={s.k} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
                    <p className="text-[12px] text-white/50">{s.k}</p>
                    <p className="mt-1 text-[24px] font-bold tabular-nums tracking-tight">{s.v}</p>
                  </div>
                ))}
              </div>
              <svg viewBox="0 0 300 70" className="mt-4 h-[70px] w-full" preserveAspectRatio="none" aria-hidden>
                <defs>
                  <linearGradient id={`bt-${t.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 58 L30 52 L60 55 L90 44 L120 47 L150 36 L180 38 L210 27 L240 30 L270 18 L300 12 L300 70 L0 70 Z" fill={`url(#bt-${t.key})`} />
                <path d="M0 58 L30 52 L60 55 L90 44 L120 47 L150 36 L180 38 L210 27 L240 30 L270 18 L300 12" fill="none" stroke="#a78bfa" strokeWidth="2" />
              </svg>
              <p className="mt-2 text-[11.5px] text-white/40">Illustrative figures for a sample campaign — not a customer&rsquo;s results.</p>
            </>
          )}
          {t.clients && (
            <ul className="mt-4 space-y-2.5">
              {t.clients.map((c) => (
                <li key={c.name} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.03] p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#312e81] to-[#6d28d9] text-[13px] font-bold">{c.name[0]}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold">{c.name}</span>
                    <span className="block truncate text-[12px] text-white/50">{c.note}</span>
                  </span>
                  <span className="hidden text-[12px] tabular-nums text-white/60 sm:block">{c.spend}</span>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium ${c.tone}`}>{c.status}</span>
                </li>
              ))}
              <li className="pt-1 text-[11.5px] text-white/40">Sample clients — illustrative only.</li>
            </ul>
          )}
        </div>
      </div>

      <style>{`
        .bt-in { animation: bt-in .45s cubic-bezier(.22,1,.36,1) both; }
        @keyframes bt-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .bt-in { animation: none; } }
      `}</style>
    </div>
  );
}
