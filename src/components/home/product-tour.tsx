"use client";

import { DemoFrame, DemoScreen, ScaledFrame } from "@/components/console/demo";
import Link from "next/link";
import { useState } from "react";
import { DemoVideo } from "@/components/clips/demo-video";
import { AgentIcon } from "@/components/team/agent-ui";
import { AGENTS } from "@/lib/team/agents";
import { ALWAYS_NEEDS_APPROVAL, actionInfo } from "@/lib/automation/levels";
import type { ClipId } from "@/lib/demo/clip";

// Two homepage sections that show MAIRO after the campaign is running:
//
//   DashboardTour — one wide player with two views (the dashboard, a
//     recommendation with its evidence), and what the Simple view puts first.
//   TeamSection — the eight AI specialties as one workflow, each tied to
//     what it actually produces, beside the AI Team page; then what always
//     waits for the owner, straight from lib/automation/levels.ts.

const VIEWS: { key: string; label: string; clip: ClipId; title: string; body: string }[] = [
  {
    key: "dashboard",
    label: "Your dashboard",
    clip: "dashboard",
    title: "Moving through the MAIRO dashboard of a fictional shop",
    body: "Overview, campaigns, creatives, performance, your AI team, recommendations, approvals and results — one sidebar, plain words.",
  },
  {
    key: "decisions",
    label: "A recommendation",
    clip: "optimize",
    title: "A recommendation from MAIRO, with its evidence, for a fictional shop",
    body: "What MAIRO noticed, the change it proposes, the evidence, the effect on your budget and the risk — then it waits for you.",
  },
];

const SIMPLE = [
  { k: "Money spent", v: "As Meta reports it, for the dates you choose." },
  { k: "Purchases or leads", v: "Whichever your goal counts — leads you can mark as booked." },
  { k: "Cost per result", v: "Spend divided by the result your goal counts." },
  { k: "Revenue", v: "Only when your store or your own records provide it." },
  { k: "Needs your approval", v: "Every launch, and every change to what you spend in total." },
];

export function DashboardTour() {
  const [view, setView] = useState(0);
  const v = VIEWS[view];
  return (
    <section id="dashboard" aria-labelledby="dash-title" className="relative scroll-mt-16 py-20 sm:py-28">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] bg-[radial-gradient(ellipse_55%_60%_at_50%_0%,rgba(255,255,255,0.16),transparent_70%)]" />
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12">
        <div data-reveal className="mx-auto max-w-[780px] text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">Dashboard &amp; results</p>
          <h2 id="dash-title" className="mt-3 text-[clamp(32px,4.6vw,60px)] font-semibold leading-[1.0] tracking-[-0.045em] text-white [text-wrap:balance]">
            Every result. One clear dashboard.
          </h2>
          <p className="mx-auto mt-4 max-w-[600px] text-[17px] leading-relaxed text-white/66">Every figure says where it comes from. Missing data is shown as missing — never as zero.</p>
        </div>

        <div data-reveal className="mx-auto mt-10 flex w-fit rounded-full border border-white/[0.1] bg-white/[0.03] p-1" role="tablist" aria-label="What to show">
          {VIEWS.map((x, i) => (
            <button
              key={x.key}
              type="button"
              role="tab"
              id={`dash-tab-${x.key}`}
              aria-selected={i === view}
              aria-controls="dash-panel"
              onClick={() => setView(i)}
              className={`min-h-[42px] rounded-full px-5 text-[14px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${i === view ? "bg-white text-[#141414]" : "text-white/70 hover:text-white"}`}
            >
              {x.label}
            </button>
          ))}
        </div>

        <div id="dash-panel" role="tabpanel" aria-labelledby={`dash-tab-${v.key}`} className="mx-auto mt-6 max-w-[1120px]">
          <div key={v.key} className="mairo-step-in">
            <DemoVideo id={v.clip} title={v.title} />
          </div>
          <p className="mt-3 text-center text-[14px] text-white/60">{v.body}</p>
        </div>

        <div data-reveal className="mx-auto mt-16 max-w-[1120px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">Campaigns, start to finish</p>
          <p className="mt-2 max-w-[640px] text-[15px] leading-relaxed text-white/66">Every campaign on one board, and where each one is in its life — built, approved by you, reviewed by Meta, delivering. Shown here with the real components and a fictional business.</p>
          <div className="mt-5">
            <ScaledFrame width={1280} minScale={0.8} maxHeight={1100}>
              <DemoFrame view="campaigns">
                <DemoScreen view="campaigns" />
              </DemoFrame>
            </ScaledFrame>
          </div>
        </div>

        <div data-reveal className="mx-auto mt-14 max-w-[1120px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">What the Simple view puts first</p>
          <dl className="mt-4 grid gap-px overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.08] sm:grid-cols-2 lg:grid-cols-5">
            {SIMPLE.map((s) => (
              <div key={s.k} className="bg-[#111111] px-5 py-4">
                <dt className="text-[14.5px] font-semibold text-white">{s.k}</dt>
                <dd className="mt-1 text-[13px] leading-relaxed text-white/58">{s.v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[12.5px] text-white/45">An Advanced view adds Meta&rsquo;s detailed figures for whoever wants them.</p>
        </div>
      </div>
    </section>
  );
}

export function TeamSection() {
  return (
    <section id="ai-team" aria-labelledby="team-title" className="relative scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:gap-16">
          <div className="min-w-0">
            <div data-reveal>
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">Your AI team</p>
              <h2 id="team-title" className="mt-3 text-[clamp(32px,4.2vw,54px)] font-semibold leading-[1.02] tracking-[-0.045em] text-white [text-wrap:balance]">
                Eight specialties. One workflow. Your approval.
              </h2>
              <p className="mt-4 max-w-[520px] text-[16.5px] leading-relaxed text-white/66">Each part of MAIRO has one job and a record of what it actually did. When there&rsquo;s nothing to do, it says so.</p>
            </div>
            <ol data-reveal className="mt-8 divide-y divide-white/[0.07] border-y border-white/[0.07]">
              {AGENTS.map((a) => (
                <li key={a.role} className="flex items-start gap-3.5 py-3">
                  <span className="mt-0.5 shrink-0">
                    <AgentIcon role={a.role} size={30} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold text-white">
                      {a.specialty} <span className="font-normal text-white/40">· {a.name}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-white/58">{a.does[0]}.</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="min-w-0 lg:pt-4">
            <div data-reveal className="lg:sticky lg:top-24">
              <DemoVideo id="team" title="One morning's review by MAIRO's AI team for a fictional shop" />
              <div className="mt-6 rounded-2xl border p-5" style={{ borderColor: "rgba(255,255,255,0.32)", background: "linear-gradient(160deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02))" }}>
                <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-cyan-200">Always waits for you — at every setting</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ALWAYS_NEEDS_APPROVAL.map((x) => (
                    <li key={x} className="flex items-start gap-2 text-[14px] text-white/85">
                      <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />
                      {actionInfo(x).label}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[13px] leading-relaxed text-white/58">
                  You choose how much else MAIRO may do: only recommend, or make small reversible changes inside your limits.{" "}
                  <Link href="/help/approvals" className="text-cyan-200 underline-offset-4 hover:text-white hover:underline">
                    How approvals work
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
