"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { DemoVideo } from "@/components/clips/demo-video";
import type { ClipId } from "@/lib/demo/clip";

// How MAIRO works, in five steps, as the visitor scrolls. On a computer the
// steps scroll by on the left while one large player on the right stays in
// place and shows the step being read — ordinary scrolling, nothing pinned
// beyond the player, nothing that waits for an animation. On a phone each
// step sits above its own video. Every clip is MAIRO's own components with a
// labelled fictional business (components/clips/).

type Step = { n: string; title: string; body: string; points: string[]; clip: ClipId; clipTitle: string };

const STEPS: Step[] = [
  {
    n: "01",
    title: "Understand your business",
    body: "Point MAIRO at your website, or describe your business in a few sentences. It reads your public pages and turns them into a brief — every fact with where it came from, its own ideas labelled as suggestions.",
    points: ["Public pages only", "Nothing guessed about you"],
    clip: "understand",
    clipTitle: "MAIRO reading a fictional shop's website and saying what it understood",
  },
  {
    n: "02",
    title: "Build your advertising plan",
    body: "From that brief MAIRO plans your first Meta campaign: the objective, who to reach, what the ads should say, how the campaign is structured and how your monthly budget divides — each with its reason.",
    points: ["Free, before any account", "A plan, not a forecast"],
    clip: "plan",
    clipTitle: "MAIRO's free plan for a fictional shop: strategy, structure and budget",
  },
  {
    n: "03",
    title: "Review suggested creatives",
    body: "MAIRO suggests angles from what your business actually says, explains why each might work, and writes the words. With a subscription it makes the finished picture — preview it in the feed and change anything.",
    points: ["Why each idea, in plain words", "Concepts free · pictures use credits"],
    clip: "creative",
    clipTitle: "MAIRO's Creative Studio making ads for a fictional shop",
  },
  {
    n: "04",
    title: "Review and approve",
    body: "Connect your own Meta ad account and MAIRO builds the campaign from your plan. You see the goal, the audience, the budget and the creative in one place, and nothing launches until you agree to the spend.",
    points: ["Your ad account, your money", "Live only when Meta confirms"],
    clip: "campaign",
    clipTitle: "Building and approving a Meta campaign for a fictional shop in MAIRO",
  },
  {
    n: "05",
    title: "Track and improve",
    body: "Results from Meta and the sales or leads you confirm, a weekly summary in plain words, and what MAIRO suggests next — every figure saying where it came from.",
    points: ["Revenue only when it's tracked", "Next steps wait for you"],
    clip: "results",
    clipTitle: "The MAIRO Results page for a fictional shop and a fictional service business",
  },
];

export function Walkthrough() {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);

  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLElement[];
    // The step crossing the middle of the screen is the one being read.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-48% 0px -48% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = (i: number) => refs.current[i]?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
  const step = STEPS[active];

  return (
    <section id="how-it-works" aria-labelledby="hiw-title" className="relative scroll-mt-16 border-y py-20 sm:py-28" style={{ borderColor: "rgba(236,236,236,0.08)", background: "linear-gradient(180deg, rgba(19,19,19,0) 0%, #0f0f0f 12%, #0f0f0f 88%, rgba(19,19,19,0) 100%)" }}>
      <div className="mx-auto max-w-[1360px] px-4 sm:px-8 lg:px-12">
        <div data-reveal className="max-w-[720px]">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-cyan-300/90">How it works</p>
          <h2 id="hiw-title" className="mt-3 text-[clamp(32px,4.6vw,60px)] font-semibold leading-[1.0] tracking-[-0.045em] text-white [text-wrap:balance]">
            From a few sentences to a campaign you approved.
          </h2>
          <p className="mt-4 max-w-[600px] text-[17px] leading-relaxed text-white/66">Five steps, each shown in MAIRO itself — with a fictional business and sample data.</p>
        </div>

        <div className="mt-14 grid gap-10 lg:mt-16 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.5fr)] lg:gap-14">
          <ol className="min-w-0">
            {STEPS.map((s, i) => (
              <li
                key={s.n}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                data-step={i}
                id={`step-${s.clip}`}
                className="scroll-mt-28 lg:flex lg:min-h-[72vh] lg:items-center"
              >
                <div className={`w-full border-l-2 py-2 pl-5 transition-colors duration-500 sm:pl-7 ${i === active ? "lg:border-[#dddddd]" : "lg:border-white/[0.08]"} border-[#dddddd]/60`}>
                  <p className={`font-mono text-[13px] tracking-[0.1em] transition-colors duration-500 ${i === active ? "text-cyan-300" : "text-white/40"}`}>
                    {s.n} <span className="text-white/25">/ 05</span>
                  </p>
                  <h3 className={`mt-2 text-[clamp(24px,2.4vw,34px)] font-semibold leading-[1.08] tracking-[-0.03em] transition-colors duration-500 ${i === active ? "text-white" : "text-white lg:text-white/45"}`}>{s.title}</h3>
                  <p className={`mt-3 max-w-[460px] text-[15.5px] leading-relaxed transition-colors duration-500 ${i === active ? "text-white/72" : "text-white/72 lg:text-white/40"}`}>{s.body}</p>
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {s.points.map((p) => (
                      <li key={p} className="rounded-full border border-white/[0.1] px-3 py-1 text-[12.5px] text-white/70">
                        {p}
                      </li>
                    ))}
                  </ul>
                  {/* On a phone, each step's own video under it. */}
                  <div className="mt-6 lg:hidden">
                    <DemoVideo id={s.clip} title={s.clipTitle} />
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {/* On a computer, one player that follows the step being read. */}
          <div className="hidden min-w-0 lg:block">
            <div className="sticky top-[max(96px,calc(50vh-300px))]">
              <div className="mb-4 flex items-center gap-1.5" role="tablist" aria-label="Steps">
                {STEPS.map((s, i) => (
                  <button
                    key={s.n}
                    type="button"
                    role="tab"
                    aria-selected={i === active}
                    aria-controls="hiw-player"
                    onClick={() => go(i)}
                    className={`group flex min-h-[36px] flex-1 flex-col justify-end gap-1.5 rounded-md px-1 text-left text-[11.5px] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${i === active ? "text-white" : "text-white/40 hover:text-white/70"}`}
                  >
                    <span className="truncate">{s.title}</span>
                    <span aria-hidden className={`h-[3px] rounded-full transition-colors duration-500 ${i === active ? "bg-[image:var(--mairo-ramp)]" : i < active ? "bg-white/30" : "bg-white/10"}`} />
                  </button>
                ))}
              </div>
              <div id="hiw-player" role="tabpanel" aria-label={step.title} key={step.clip} className="mairo-step-in">
                <DemoVideo id={step.clip} title={step.clipTitle} transcript={false} />
              </div>
              <p className="mt-4 flex items-center justify-between gap-4 text-[13px] text-white/50">
                <span>Product demo · fictional business · sample data</span>
                <Link href="/preview" className="font-medium text-cyan-200 hover:text-white">
                  See your free plan →
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
