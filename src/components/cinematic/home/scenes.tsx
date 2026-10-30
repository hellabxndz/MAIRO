"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SEQ } from "./director";

// The homepage's story, scene by scene. Each scene is a tall section whose
// words stay on screen (sticky) while the particles behind them move through
// the scene's shapes (data-scene, read by director.tsx). The words are real
// text — headings in order, readable by search engines and screen readers —
// and every scene works without the particles.
//
// Nothing here is a claim about results: the campaign and the figures shown
// are labelled as an example for a fictional business, as everywhere else on
// the site.

/** A headline that arrives word by word (globals.css .cine-title). */
export function CineTitle({ text, as: Tag = "h2", className = "", id }: { text: string; as?: "h1" | "h2" | "p"; className?: string; id?: string }) {
  let i = 0;
  return (
    <Tag id={id} data-reveal className={`cine-title ${className}`}>
      {text.split("\n").map((line, l) => (
        <span key={l} className="block">
          {line.split(" ").map((w, k) => (
            <span key={k}>
              <span className="cine-w" style={{ "--i": i++ } as React.CSSProperties}>
                {w}
              </span>{" "}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  );
}

function Scene({ scene, className = "", height = "h-[210vh] sm:h-[230vh]", children, label, ...data }: { scene: string; className?: string; height?: string; children: ReactNode; label: string } & Record<`data-${string}`, string>) {
  return (
    <section aria-label={label} data-scene={scene} {...data} className={`relative ${height}`}>
      <div className={`sticky top-0 flex min-h-[100svh] items-center ${className}`}>{children}</div>
    </section>
  );
}

const FRAGMENTS = [
  { t: "Ad set 3 of 14", x: "8%", y: "18%" },
  { t: "CPM ▲ 38%", x: "74%", y: "14%" },
  { t: "Pixel: no events received", x: "70%", y: "82%" },
  { t: "creative_v7_FINAL_final.png", x: "12%", y: "74%" },
  { t: "Lookalike 1% · broad · interests?", x: "40%", y: "8%" },
  { t: "Attribution: 7-day click, 1-day view", x: "70%", y: "44%" },
  { t: "Learning limited", x: "5%", y: "46%" },
  { t: "Which budget? CBO or ABO", x: "38%", y: "86%" },
];

const STEPS = [
  { title: "Your business", text: "What you sell, who buys it and what makes you different — from your website and your words." },
  { title: "MAIRO analyzes", text: "Your offer, your customers and what works on Facebook and Instagram right now." },
  { title: "Ad creatives", text: "Headlines, pictures and copy written for your customers, ready for you to approve." },
  { title: "Meta campaign", text: "Audience, budget and placements, built in your own ad account — and waiting for your yes." },
];

/** Which of the four steps the particles are on, from where the scene is on screen. */
function useStep(ref: React.RefObject<HTMLElement | null>, from: number) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const l = (window.innerHeight / 2 - r.top) / Math.max(1, r.height);
      const n = Math.min(STEPS.length - 1, Math.max(0, Math.floor(l * STEPS.length)));
      setStep(n);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(read);
    };
    window.addEventListener("scroll", on, { passive: true });
    read();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
    };
  }, [ref, from]);
  return step;
}

const eyebrow = "text-[12px] font-semibold uppercase tracking-[0.28em] text-[#8fb4ff]";
const shell = "mx-auto w-full max-w-[1320px] px-5 sm:px-10";

export function StoryScenes() {
  const creates = useRef<HTMLElement>(null);
  const step = useStep(creates, SEQ.indexOf("brief"));

  return (
    <div id="how" className="relative scroll-mt-0">
      {/* 1 — the old way: fragments of interfaces, then dark. */}
      <Scene scene="3:4" label="Advertising got complicated" data-scene-x="0" data-scene-y="0" data-scene-ym="0">
        <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
          {FRAGMENTS.map((f, i) => (
            <span
              key={f.t}
              className="mairo-float absolute whitespace-nowrap rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[11.5px] text-white/45 backdrop-blur-sm"
              style={{ left: f.x, top: f.y, animationDelay: `${-i * 1.7}s` }}
            >
              {f.t}
            </span>
          ))}
        </div>
        <div className={`${shell} relative text-center`}>
          <p className={eyebrow}>The old way</p>
          <CineTitle text={"Advertising got\ncomplicated."} className="cine-glow mx-auto mt-5 max-w-[1100px] text-[clamp(36px,9.5vw,150px)] text-white" />
          <p className="mx-auto mt-7 max-w-[520px] text-[16.5px] leading-relaxed text-white/65 sm:text-[18px]">
            Ad sets, audiences, pixels, attribution windows, a dozen dashboards. Most businesses never needed any of it — they just wanted customers.
          </p>
        </div>
      </Scene>

      {/* 2 — MAIRO arrives: the particles gather into the core. */}
      <Scene scene="4:5" label="We made it simple" data-scene-x="0.42" data-scene-y="0" data-scene-ym="0.38" className="items-end pb-[12svh] sm:items-center sm:pb-0">
        <div className={shell}>
          <div className="max-w-[640px]">
            <p className={eyebrow}>MAIRO</p>
            <CineTitle text={"We made it\nsimple."} className="cine-glow mt-5 text-[clamp(38px,9vw,140px)] text-white" />
            <p className="mt-7 max-w-[480px] text-[16.5px] leading-relaxed text-white/70 sm:text-[18px]">
              One AI that does the advertising work for you — the strategy, the ads and the campaign — and asks you before it spends a cent.
            </p>
          </div>
        </div>
      </Scene>

      {/* 3 — AI creates your advertising: business → analysis → creatives → campaign. */}
      <section ref={creates} aria-label="How MAIRO creates your advertising" data-scene="6:9" data-scene-x="0.4" data-scene-y="0" data-scene-ym="0.42" data-scene-zoom="1.08" className="relative h-[300vh] sm:h-[340vh]">
        <div className="sticky top-0 flex min-h-[100svh] items-end pb-[8svh] sm:items-center sm:pb-0">
          <div className={shell}>
            <div className="max-w-[560px]">
              <p className={eyebrow}>From idea to ad</p>
              <h2 className="cine-title mt-4 text-[clamp(34px,5.4vw,76px)] text-white">AI creates your advertising.</h2>
              <ol className="mt-8 space-y-1">
                {STEPS.map((s, i) => {
                  const on = i === step;
                  const done = i < step;
                  return (
                    <li key={s.title} aria-current={on ? "step" : undefined} className={`rounded-2xl px-4 py-3 transition-all duration-500 ${on ? "mairo-glass" : ""}`}>
                      <p className={`flex items-center gap-3 text-[16px] font-semibold transition-colors duration-500 ${on ? "text-white" : done ? "text-white/55" : "text-white/35"}`}>
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] transition-colors duration-500 ${on ? "border-[#8fb4ff] bg-[#2f6bff] text-white" : "border-white/20"}`}>{done ? "✓" : i + 1}</span>
                        {s.title}
                      </p>
                      <p className={`overflow-hidden pl-9 text-[14.5px] leading-relaxed text-white/65 transition-all duration-500 ${on ? "mt-1 max-h-24 opacity-100" : "max-h-0 opacity-0"}`}>{s.text}</p>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* 4 — your advertising runs: campaigns, connected. */}
      <Scene scene="9:9" label="From idea to live campaign" data-scene-x="-0.35" data-scene-y="0" data-scene-ym="0.4" className="items-end pb-[8svh] sm:items-center sm:pb-0">
        <div className={`${shell} flex justify-end`}>
          <div className="max-w-[560px]">
            <p className={eyebrow}>Campaigns</p>
            <CineTitle text={"From idea to\nlive campaign."} className="cine-glow mt-5 text-[clamp(40px,7vw,108px)] text-white" />
            <div className="mairo-glass mt-8 rounded-[24px] p-5" role="img" aria-label="An example campaign waiting for approval, for a fictional business">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Example · fictional business</p>
              <p className="mt-2 text-[17px] font-semibold text-white">Weekend boiler service — Portland</p>
              <dl className="mt-3 grid grid-cols-3 gap-3 text-[13px]">
                <div><dt className="text-white/45">Goal</dt><dd className="text-white">Leads</dd></div>
                <div><dt className="text-white/45">Budget</dt><dd className="text-white">$25 a day</dd></div>
                <div><dt className="text-white/45">Where</dt><dd className="text-white">FB + IG</dd></div>
              </dl>
              <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                <span className="inline-flex items-center gap-2 text-[13px] text-amber-200"><span className="h-1.5 w-1.5 rounded-full bg-amber-300" />Waiting for your approval</span>
                <span className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black">Approve</span>
              </div>
            </div>
          </div>
        </div>
      </Scene>

      {/* 5 — results without complexity. */}
      <Scene scene="10:10" label="Powerful AI, simple decisions" data-scene-zoom="1.12" data-scene-zoom-m="1.4" data-scene-x="0.32" data-scene-y="-0.1" data-scene-ym="0.45" data-scene-dim="0.7" className="items-end pb-[8svh] sm:items-center sm:pb-0">
        <div className={shell}>
          <div className="max-w-[600px]">
            <p className={eyebrow}>Results</p>
            <CineTitle text={"Powerful AI.\nSimple decisions."} className="cine-glow mt-5 text-[clamp(40px,7vw,108px)] text-white" />
            <div className="mairo-glass mt-8 rounded-[24px] p-5" role="img" aria-label="Example results for a fictional business: spend, leads, cost per lead and one recommendation">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Sample data · fictional business · last 30 days</p>
              <dl className="mt-3 grid grid-cols-3 gap-3">
                {[
                  ["Spent", "$742"],
                  ["Leads", "61"],
                  ["Per lead", "$12.16"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dd className="text-[clamp(22px,3vw,30px)] font-semibold tabular-nums text-white">{v}</dd>
                    <dt className="text-[12.5px] text-white/50">{k}</dt>
                  </div>
                ))}
              </dl>
              <div className="mt-4 border-t border-white/10 pt-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#8fb4ff]">MAIRO recommends</p>
                <p className="mt-1.5 text-[14.5px] leading-relaxed text-white/85">The video ad brings leads at half the cost. Move $5 a day to it?</p>
                <div className="mt-3 flex gap-2">
                  <span className="rounded-full bg-white px-4 py-2 text-[13px] font-semibold text-black">Approve</span>
                  <span className="rounded-full border border-white/15 px-4 py-2 text-[13px] text-white/80">Not now</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Scene>
    </div>
  );
}

/** The last scene: the core, lit, and one call to action. */
export function FinalScene({ ctaHref }: { ctaHref: string }) {
  return (
    <section aria-labelledby="final-title" data-scene="11:11" data-scene-y="0" data-scene-ym="0" data-scene-zoom="1.25" data-scene-dim="0.85" className="relative flex min-h-[110svh] items-center justify-center overflow-hidden px-5 py-24 text-center">
      <div className="relative">
        <CineTitle id="final-title" text={"Stop managing ads.\nStart growing."} className="cine-glow mx-auto max-w-[1200px] text-[clamp(36px,8.6vw,136px)] text-white" />
        <p className="mx-auto mt-7 max-w-[520px] text-[17px] leading-relaxed text-white/70">Start with a free AI plan for your business. No credit card, and nothing launches without your yes.</p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href={ctaHref} className="cine-cta inline-flex min-h-[58px] items-center gap-2 rounded-full px-9 text-[16.5px] font-semibold">
            Get My Free AI Plan <span aria-hidden>→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
