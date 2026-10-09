"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { AgentRole } from "@/generated/prisma/enums";
import { AGENT } from "@/lib/team/agents";
import { AgentIcon } from "@/components/team/agent-ui";

// A walk through the MAIRO dashboard for visitors: the AI Team screen,
// campaign results (read three ways), a recommendation waiting for approval,
// the Performance Coach and the Daily Brief — the real screens' layout and
// wording, filled with an invented example business. Every view says so: no
// figure here is a customer's result.

type Tab = "team" | "results" | "recs" | "coach" | "brief";

const TABS: { id: Tab; label: string; about: string }[] = [
  { id: "team", label: "Your AI Team", about: "What each specialty is doing, and what's waiting for you. In your own account every line is something that really ran — and when there's nothing to do, it says so." },
  { id: "results", label: "Campaign Results", about: "Your results, read three ways: Simple for a quick answer, Advanced for every metric Meta reports, Profit First for what your ads earn after costs, using the values you record." },
  { id: "recs", label: "AI Recommendations", about: "Every recommendation shows what was noticed, the numbers behind it and how sure MAIRO is. Nothing changes until you approve it." },
  { id: "coach", label: "Performance Coach", about: "Follows results past the click — leads, follow-up, bookings, customers — and says where things slow down, keeping what it saw apart from what might explain it." },
  { id: "brief", label: "Daily Brief", about: "What your team did at its daily review, in plain words. Written once a day — not a live feed." },
];

const Sample = () => (
  <span className="rounded-full border border-white/15 bg-paper px-2.5 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">Illustrative example</span>
);

function Pane({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[17px] font-semibold tracking-[-0.01em] text-white">{title}</p>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
        </div>
        <Sample />
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

// --- 1. Your AI Team -------------------------------------------------------------

const STATE = {
  Completed: "bg-blue/10 text-blue-bright",
  Monitoring: "bg-live/10 text-live",
  "Waiting for you": "bg-warn/15 text-warn",
  Idle: "bg-white/[0.07] text-muted",
} as const;

const TEAM: { role: AgentRole; state: keyof typeof STATE; line: string }[] = [
  { role: "STRATEGIST", state: "Completed", line: "Wrote your plan around more estimate requests." },
  { role: "AUDIENCE", state: "Idle", line: "Works out who to reach when a plan or campaign is being made." },
  { role: "CREATIVE", state: "Waiting for you", line: "A second version of “Spring Roof Check” is ready to review." },
  { role: "ARCHITECT", state: "Monitoring", line: "2 campaigns running on Meta. Nothing needs fixing." },
  { role: "OPTIMIZER", state: "Completed", line: "Looked for rising costs and tired ads — found none today." },
  { role: "GUARDIAN", state: "Monitoring", line: "Spend is inside your $1,500 monthly limit." },
  { role: "ANALYST", state: "Completed", line: "Wrote this morning's Daily Brief." },
  { role: "GROWTH", state: "Idle", line: "Waiting for another week of results before suggesting more." },
];

function TeamView() {
  return (
    <Pane title="Your AI Team" sub="Last reviewed today at 7:42 AM · 1 recommendation waiting for your approval">
      <ul className="grid gap-2 md:grid-cols-2">
        {TEAM.map((t) => (
          <li key={t.role} className="flex items-start gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
            <AgentIcon role={t.role} size={32} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-white">
                {AGENT[t.role].name}
                <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATE[t.state]}`}>{t.state}</span>
              </p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{t.line}</p>
            </div>
          </li>
        ))}
      </ul>
    </Pane>
  );
}

// --- 2. Campaign Results ---------------------------------------------------------

const MODES = {
  Simple: [
    ["Money spent", "$1,240"],
    ["Leads", "64"],
    ["Cost per lead", "$19.38"],
    ["Good leads", "31"],
    ["Booked", "12"],
    ["Customers", "5"],
  ],
  Advanced: [
    ["Spend", "$1,240"],
    ["Impressions", "71,300"],
    ["Reach", "28,950"],
    ["Clicks", "1,180"],
    ["CTR", "1.65%"],
    ["CPC", "$1.05"],
    ["CPM", "$17.39"],
    ["Leads", "64"],
    ["Cost per lead", "$19.38"],
    ["Frequency", "2.46"],
  ],
  "Profit First": [
    ["Jobs you recorded", "$8,400"],
    ["Estimated profit", "$2,120"],
    ["Ad spend", "$1,240"],
    ["Customers", "5"],
    ["Cost per customer", "$248"],
    ["Break-even per customer", "$560"],
  ],
} as const;
type Mode = keyof typeof MODES;

const CHART = [22, 30, 26, 38, 34, 44, 40, 52, 47, 60, 56, 70, 66, 82];
function chartPath(values: number[], w: number, h: number) {
  const max = Math.max(...values);
  const step = w / (values.length - 1);
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (v / max) * h * 0.9).toFixed(1)}`).join(" ");
}

function ResultsView() {
  const [mode, setMode] = useState<Mode>("Simple");
  const line = chartPath(CHART, 300, 80);
  return (
    <Pane title="Campaign Results" sub="Last 14 days · from Meta">
      <div role="group" aria-label="How to read the results" className="inline-flex rounded-full border border-white/10 bg-white/[0.02] p-1">
        {(Object.keys(MODES) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={m === mode}
            onClick={() => setMode(m)}
            className={`rounded-full px-3.5 py-1.5 text-[12.5px] transition ${m === mode ? "bg-[image:var(--mairo-ramp)] font-medium text-white" : "text-muted hover:text-white"}`}
          >
            {m}
          </button>
        ))}
      </div>
      <dl className={`mt-4 grid grid-cols-2 gap-2 ${MODES[mode].length > 6 ? "sm:grid-cols-3 lg:grid-cols-5" : "sm:grid-cols-3"}`}>
        {MODES[mode].map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
            <dt className="text-[11.5px] text-muted">{k}</dt>
            <dd className="mt-0.5 text-[19px] font-semibold tabular-nums text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
        <p className="text-[11.5px] text-muted">Leads by day</p>
        <svg viewBox="0 0 300 80" className="mt-1 h-[72px] w-full" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="pp-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#7c5cff" stopOpacity="0.28" />
              <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${line} L300,80 L0,80 Z`} fill="url(#pp-fill)" />
          <path d={line} fill="none" stroke="#6544f0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
    </Pane>
  );
}

// --- 3. AI Recommendations -------------------------------------------------------

function RecsView() {
  return (
    <Pane title="AI Recommendations" sub="1 waiting for your approval">
      <div className="rounded-2xl border border-[color:var(--mairo-line-lit)] bg-paper p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <AgentIcon role="OPTIMIZER" size={26} />
          <span className="text-[12px] text-muted">From your Optimization Agent</span>
          <span className="ml-auto rounded-full bg-live/10 px-2.5 py-0.5 text-[11px] font-medium text-live">High confidence</span>
        </div>
        <p className="mt-3 text-[17px] font-semibold leading-snug text-white">Move $10/day from Creative #2 to Creative #4.</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">Creative #4 has brought good leads at a lower cost over the last 7 days. Your total daily budget stays the same.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {[
            ["Creative #2", "$61.40", "9", "text-alert"],
            ["Creative #4", "$28.75", "16", "text-live"],
          ].map(([n, cpa, good, tone]) => (
            <div key={n} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="text-[12.5px] font-medium text-white">{n}</p>
              <p className="mt-1 text-[11.5px] text-muted">
                Cost per good lead <span className={`ml-1 text-[14px] font-semibold ${tone}`}>{cpa}</span>
              </p>
              <p className="text-[11.5px] text-muted">
                Good leads <span className={`ml-1 text-[14px] font-semibold ${tone}`}>{good}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[11.5px] text-faint">Based on 7 days of data · 640 clicks · the leads you marked</p>
        <p className="mt-2 flex items-center gap-2 rounded-xl bg-live/[0.06] px-3 py-2 text-[12px] text-white/85">
          <AgentIcon role="GUARDIAN" size={20} />
          Budget Guardian checked it: within your limits.
        </p>
        <div className="mt-3 flex flex-wrap gap-2" aria-hidden>
          <span className="rounded-full bg-[image:var(--mairo-ramp)] px-4 py-1.5 text-[12.5px] font-medium text-white">Approve</span>
          <span className="rounded-full border border-white/15 px-4 py-1.5 text-[12.5px] text-white/85">Ask why</span>
          <span className="rounded-full border border-white/15 px-4 py-1.5 text-[12.5px] text-white/85">Decline</span>
        </div>
      </div>
    </Pane>
  );
}

// --- 4. Performance Coach --------------------------------------------------------

const JOURNEY = [
  ["Clicks", 1180],
  ["Leads", 64],
  ["Good leads", 31],
  ["Booked", 12],
  ["Customers", 5],
] as const;

function CoachView() {
  const max = JOURNEY[0][1];
  return (
    <Pane title="Performance Coach" sub="Last two weeks, from ad to customer">
      <ol className="grid gap-1.5">
        {JOURNEY.map(([k, v], i) => (
          <li key={k} className="grid grid-cols-[88px_minmax(0,1fr)_64px] items-center gap-3 text-[12.5px]">
            <span className="text-muted">{k}</span>
            <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.05]">
              <span className="block h-full rounded-full bg-[image:var(--mairo-ramp)]" style={{ width: `${Math.max(3, Math.round(Math.sqrt(v / max) * 100))}%` }} />
            </span>
            <span className="text-right tabular-nums text-white">
              {v.toLocaleString("en-US")}
              {i > 0 && <span className="ml-1 text-[10.5px] text-faint">{Math.round((v / JOURNEY[i - 1][1]) * 100)}%</span>}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-warn/15 px-2.5 py-0.5 text-[11px] font-medium text-warn">Needs attention</span>
          <span className="text-[11.5px] text-muted">Some evidence</span>
        </div>
        <p className="mt-2 text-[15px] font-semibold text-white">Fewer good leads are booking an appointment</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">39% of good leads booked in the last two weeks, against 58% the two weeks before. That happens after the ad, so the team suggests looking at follow-up before the budget.</p>
        <ul className="mt-2.5 space-y-1.5 text-[12.5px]">
          <li className="flex items-start gap-2">
            <span className="shrink-0 rounded-full bg-violet/10 px-2 py-0.5 text-[10.5px] text-violet-bright">In your records</span>
            <span className="text-white/85">New leads were contacted more slowly in the same period.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="shrink-0 rounded-full bg-white/[0.06] px-2 py-0.5 text-[10.5px] text-muted">Possibility</span>
            <span className="text-white/85">Booking may be harder than it needs to be.</span>
          </li>
        </ul>
        <p className="mt-3 text-[13px] font-medium text-white">Recommended: reply to new leads the same day, and offer two specific times.</p>
      </div>
    </Pane>
  );
}

// --- 5. Daily Brief ----------------------------------------------------------------

const BRIEF: { role: AgentRole; text: string }[] = [
  { role: "ANALYST", text: "Read the latest results for 2 campaigns. In the last 7 days: $412 spent, 23 leads." },
  { role: "ANALYST", text: "Followed those 23 leads from the ad onwards: 11 good, 4 booked so far." },
  { role: "OPTIMIZER", text: "Looked for problems to fix — rising costs, tired ads, money better spent elsewhere — and found none right now." },
  { role: "CREATIVE", text: "Recommended testing a second version of “Spring Roof Check”." },
  { role: "GUARDIAN", text: "Checked 1 proposed change against your limits: within them." },
  { role: "GROWTH", text: "Recommends holding off on more budget while bookings recover." },
];

function BriefView() {
  return (
    <Pane title="Your Daily MAIRO Brief" sub="Tuesday, 7:42 AM · written after your team's daily review">
      <ul className="space-y-2.5">
        {BRIEF.map((b, i) => (
          <li key={i} className="flex items-start gap-3">
            <AgentIcon role={b.role} size={26} />
            <p className="text-[13px] leading-relaxed text-white/85">
              <span className="font-semibold text-white">{AGENT[b.role].name}:</span> {b.text}
            </p>
          </li>
        ))}
        <li className="pl-[38px] text-[13px] text-warn">1 recommendation is ready for your approval.</li>
      </ul>
    </Pane>
  );
}

const VIEWS: Record<Tab, () => ReactNode> = { team: TeamView, results: ResultsView, recs: RecsView, coach: CoachView, brief: BriefView };

export function ProductPreview() {
  const [tab, setTab] = useState<Tab>("team");
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const View = VIEWS[tab];
  const about = TABS.find((t) => t.id === tab)!.about;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : null;
    if (next === null) return;
    e.preventDefault();
    const t = TABS[(next + TABS.length) % TABS.length];
    setTab(t.id);
    refs.current[t.id]?.focus();
  };

  return (
    <div>
      <div className="overflow-hidden rounded-[26px] border border-white/10 bg-paper shadow-[0_40px_120px_-50px_rgba(91,63,224,0.55)]">
        <div className="grid grid-cols-1 md:grid-cols-[210px_minmax(0,1fr)]">
          <div className="min-w-0 border-b border-white/[0.07] bg-white/[0.02] p-3 md:border-b-0 md:border-r md:p-4">
            <p className="hidden px-2 pb-3 text-[13px] font-light tracking-[0.3em] text-white md:block">MAIRO</p>
            <div role="tablist" aria-label="MAIRO screens" aria-orientation="vertical" onKeyDown={onKey} className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] md:mx-0 md:flex-col md:overflow-visible md:px-0">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  ref={(el) => {
                    refs.current[t.id] = el;
                  }}
                  role="tab"
                  id={`pp-tab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="pp-panel"
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-left text-[13px] transition ${tab === t.id ? "bg-[image:var(--mairo-ramp)] font-medium text-white" : "text-muted hover:bg-white/[0.04] hover:text-white"}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div id="pp-panel" role="tabpanel" aria-labelledby={`pp-tab-${tab}`} className="min-h-[430px] min-w-0 p-4 sm:p-6">
            <View />
          </div>
        </div>
      </div>
      <p className="mx-auto mt-4 max-w-[760px] text-center text-[14px] leading-relaxed text-white/70">{about}</p>
      <p className="mx-auto mt-1.5 max-w-[760px] text-center text-[12px] text-faint">An invented example business. None of these figures is a real customer&rsquo;s result.</p>
    </div>
  );
}
