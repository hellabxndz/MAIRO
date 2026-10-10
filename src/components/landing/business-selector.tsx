"use client";

import Link from "next/link";
import { useState } from "react";

// "See how MAIRO would advertise your business." Each tab is an example of
// the kind of plan the free plan writes — not anyone's results.

const TYPES = [
  {
    key: "Ecommerce",
    goal: "Increase purchases",
    platforms: "Facebook + Instagram",
    budget: "$50/day",
    creative: "Product video + customer-style clips",
    audience: "18–34 interested in streetwear",
    note: "Purchases counted by the Meta Pixel on your store.",
  },
  {
    key: "Local Business",
    goal: "More calls and bookings",
    platforms: "Facebook + Instagram",
    budget: "$25/day",
    creative: "Before-and-after photos + your offer",
    audience: "Adults 25–60 within 10 miles of you",
    note: "Taps on Call and bookings counted by Meta.",
  },
  {
    key: "Service Business",
    goal: "More qualified leads",
    platforms: "Facebook + Instagram",
    budget: "$35/day",
    creative: "Short explainer + real customer quotes",
    audience: "Homeowners 30–65 in your service area",
    note: "Leads collected with a quick form inside the ad.",
  },
  {
    key: "Creator",
    goal: "Sell your course or merch",
    platforms: "Instagram focused",
    budget: "$20/day",
    creative: "Talking-to-camera Reels",
    audience: "18–35 interested in your niche",
    note: "Sales tracked on your checkout page.",
  },
  {
    key: "Agency",
    goal: "Run every client from one place",
    platforms: "Facebook + Instagram, per client",
    budget: "Set per client",
    creative: "Per-client brand and offers",
    audience: "Each client's own audience",
    note: "Freelancer and agency plans include client workspaces.",
  },
] as const;

export function BusinessSelector() {
  const [active, setActive] = useState(0);
  const t = TYPES[active];
  const rows: [string, string][] = [
    ["Goal", t.goal],
    ["Recommended", t.platforms],
    ["Budget", t.budget],
    ["Creative", t.creative],
    ["Audience", t.audience],
  ];
  return (
    <div>
      <div role="tablist" aria-label="Business type" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:justify-center sm:px-0">
        {TYPES.map((b, i) => (
          <button
            key={b.key}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={`shrink-0 rounded-full border px-4 py-2 text-[13.5px] transition ${
              i === active ? "border-violet-400/60 bg-violet-500/20 text-white shadow-[0_0_24px_-6px_rgba(139,92,246,0.8)]" : "border-white/10 text-white/65 hover:border-white/25 hover:text-white"
            }`}
          >
            {b.key}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mx-auto mt-6 max-w-[860px] rounded-3xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[16px] font-semibold text-white">{t.key} — example plan</p>
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Example</span>
        </div>
        <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="min-w-0 border-l-2 border-violet-400/40 pl-3">
              <dt className="text-[11.5px] uppercase tracking-[0.14em] text-white/45">{k}</dt>
              <dd className="mt-0.5 text-[15px] text-white">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-5 text-[12.5px] text-white/50">{t.note}</p>
        <Link
          href={t.key === "Agency" ? "/for-freelancers" : "/sign-up"}
          className="mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#4f7dff] to-[#8b4dfb] px-6 py-3 text-[14px] font-medium text-white shadow-[0_12px_40px_-12px_rgba(99,102,241,0.9)] transition hover:brightness-110"
        >
          {t.key === "Agency" ? "See agency plans" : "See Example Plan"} <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
