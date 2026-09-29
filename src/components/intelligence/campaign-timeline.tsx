"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { CampaignJourney, TimelineEvent as Event, TimelineFilter, TimelineKind } from "@/lib/intelligence/timeline";

// Campaign Journey: everything that has happened to a campaign since launch,
// and what Mairo did about it. Simple mode tells it in words; Advanced mode
// adds the figures under each event.

const ICON: Record<TimelineKind, { tone: string; d: React.ReactNode }> = {
  launch: { tone: "#a78bfa", d: <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m-2-3 3 3m-3-3c1-4 4-9 11-10-1 7-6 10-10 11" /> },
  data: { tone: "#94a6cc", d: <path d="M4 19h16M7 16v-4M11 16V8M15 16v-6M19 16V5" /> },
  winner: { tone: "#34d399", d: <path d="M8 4h8v5a4 4 0 0 1-8 0zM6 5H4v1.5A3 3 0 0 0 7 9.5M18 5h2v1.5A3 3 0 0 1 17 9.5M12 13v4M8.5 20h7" /> },
  budget: { tone: "#818cf8", d: <path d="M5 19v-6M10 19V9M15 19v-9M20 19V5" /> },
  creative: { tone: "#c084fc", d: <path d="M4 5h16v14H4zM4 15l4.5-4.5 4 4 2.5-2.5L20 17" /> },
  audience: { tone: "#38bdf8", d: <path d="M9 8.5a3.2 3.2 0 1 0 0-.01M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5M16 5.8a3 3 0 0 1 0 5.6M18 14.4c1.6.6 2.6 2.2 2.6 4.6" /> },
  retargeting: { tone: "#f472b6", d: <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" /> },
  website: { tone: "#fbbf24", d: <path d="M3.5 5h17v14h-17zM3.5 9h17M6.5 7h.01M9 7h.01" /> },
  warning: { tone: "#f59e0b", d: <path d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.3" /> },
  optimization: { tone: "#6aa6ff", d: <path d="M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" /> },
  review: { tone: "#34d399", d: <path d="M5 4h10l4 4v12H5zM9 13l2 2 4-4" /> },
};

const FILTERS: { key: TimelineFilter; label: string }[] = [
  { key: "all", label: "All activity" },
  { key: "budget", label: "Budget" },
  { key: "creative", label: "Creative" },
  { key: "audience", label: "Audience" },
  { key: "website", label: "Website" },
  { key: "platform", label: "Platforms" },
  { key: "ai", label: "AI actions" },
];

export function TimelineEvent({ event, advanced, last = false }: { event: Event; advanced: boolean; last?: boolean }) {
  const icon = ICON[event.kind];
  return (
    <li className={`relative flex gap-4 ${last ? "" : "pb-6"}`}>
      {!last && <span className="absolute left-[19px] top-10 h-[calc(100%-2.5rem)] w-px bg-white/[0.08]" aria-hidden />}
      <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${icon.tone}1f`, color: icon.tone }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          {icon.d}
        </svg>
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-faint">
          Day {event.day}
          {event.ai && <span className="ml-2 rounded bg-violet/15 px-1.5 py-0.5 text-[10px] normal-case tracking-normal text-violet-bright">Mairo</span>}
        </p>
        <p className="mt-0.5 text-[14.5px] font-semibold text-white">{event.title}</p>
        <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{event.body}</p>
        {advanced && event.details.length > 0 && (
          <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {event.details.map((d) =>
              d.value.length > 36 ? (
                <div key={d.label} className="rounded-lg bg-white/[0.03] px-3 py-1.5 text-[12.5px] sm:col-span-2">
                  <dt className="text-faint">{d.label}</dt>
                  <dd className="mt-0.5 tabular-nums text-white/85">{d.value}</dd>
                </div>
              ) : (
                <div key={d.label} className="flex justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-1.5 text-[12.5px]">
                  <dt className="text-faint">{d.label}</dt>
                  <dd className="truncate text-right tabular-nums text-white/85">{d.value}</dd>
                </div>
              ),
            )}
          </dl>
        )}
      </div>
    </li>
  );
}

export function CampaignTimeline({
  journey,
  campaigns,
  advanced,
}: {
  journey: CampaignJourney | null;
  campaigns: { id: string; name: string }[];
  advanced: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [filter, setFilter] = useState<TimelineFilter>("all");
  const events = (journey?.events ?? []).filter((e) => filter === "all" || e.filters.includes(filter));

  const pick = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("journey", id);
    router.push(`?${next.toString()}#journey`, { scroll: false });
  };

  return (
    <section id="journey" className="scroll-mt-6 rounded-2xl border border-white/[0.07] bg-[#0b1122]/80 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.16em] text-violet-bright">Campaign journey</h2>
          <p className="mt-1 text-[14px] text-muted">See what Mairo has done since this campaign launched.</p>
        </div>
        {campaigns.length > 1 && journey && (
          <select
            value={journey.campaign.id}
            onChange={(e) => pick(e.target.value)}
            aria-label="Campaign"
            className="h-10 max-w-[260px] rounded-lg border border-white/10 bg-[#0c1326] px-3 text-[13px] text-white outline-none focus:border-violet/60"
          >
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!journey ? (
        <p className="mt-4 text-[13.5px] text-muted">Your first campaign&rsquo;s journey starts here the day it launches.</p>
      ) : (
        <>
          <div className="-mx-5 mt-4 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`min-h-[34px] shrink-0 rounded-full border px-3 text-[12.5px] transition ${filter === f.key ? "border-violet/50 bg-violet/15 text-white" : "border-white/10 text-muted hover:text-white"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <ol className="mt-5">
            {events.map((e, i) => (
              <TimelineEvent key={e.id} event={e} advanced={advanced} last={i === events.length - 1} />
            ))}
            {events.length === 0 && <li className="py-6 text-center text-[13.5px] text-muted">Nothing in this category yet.</li>}
          </ol>
        </>
      )}
    </section>
  );
}
