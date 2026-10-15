"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BusinessArt } from "@/components/hero-story/art";
import { EXAMPLES } from "@/lib/demo/examples";
import { budgetPlan } from "@/lib/preview/strategy";

// Beside the hero's form: the free plan being made, on a loop, for a
// fictional business (Fernleaf Ceramics, a reserved .example address) — the
// website read, what MAIRO understood (facts kept apart from its
// suggestions), the strategy and audience, the budget split and three ad
// concepts. The budget split is the generator's own (lib/preview/strategy.ts
// budgetPlan) for this business, so the demo can't drift from what the tool
// really gives; the stage names are the generator's own too.
//
// It's a drawing of the product, labelled as a demo, not a recording: it
// stops when scrolled away or when the tab is hidden, has a pause button,
// and with reduced motion shows the finished plan and lets the visitor step
// through it instead.

const SHOP = EXAMPLES.shop;
const BUDGET = budgetPlan({ monthly: 1000, goal: "sales", kind: "shop", hasWebsite: true, pixelSeen: true, usesLeadForm: false });
const COLORS: Record<string, string> = { prospecting: "#2f6bff", retargeting: "#38bdf8", testing: "#a9c8ff", reach: "#5fd4c4", audiences: "#5fd4c4" };

const STAGES = [
  { label: "Understanding your business", at: 0 },
  { label: "Identifying advertising opportunities", at: 3.6 },
  { label: "Building your Meta advertising strategy", at: 7.2 },
  { label: "Allocating your monthly budget", at: 10.6 },
  { label: "Developing your first ad concepts", at: 13.8 },
  { label: "Preparing your personalized plan", at: 17.4 },
] as const;
const LOOP = 21;
/** Where each stage has shown everything — for stepping to it, and for reduced motion. */
const SHOWN = 3.15;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function stageAt(t: number) {
  let i = 0;
  STAGES.forEach((s, j) => {
    if (t >= s.at) i = j;
  });
  return i;
}

/** The clock: runs only while playing, on screen and in a visible tab. */
function useClock(running: boolean) {
  const [t, setT] = useState(0);
  const base = useRef(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const began = performance.now() - base.current * 1000;
    const tick = (now: number) => {
      const s = ((now - began) / 1000) % LOOP;
      base.current = s;
      setT(Math.floor(s * 20) / 20);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
  const jump = (s: number) => {
    base.current = s;
    setT(s);
  };
  return { t, jump };
}

/** Shown once the clock passes `at` — with a short rise, unless the visitor prefers less motion. */
function In({ show, children, className = "", delay = 0 }: { show: boolean; children: ReactNode; className?: string; delay?: number }) {
  return (
    <div className={`transition duration-500 ease-out motion-reduce:transition-none ${show ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"} ${className}`} style={{ transitionDelay: show ? `${delay}ms` : "0ms" }}>
      {children}
    </div>
  );
}

function Tag({ kind }: { kind: "website" | "ai" }) {
  return kind === "website" ? (
    <span className="shrink-0 rounded-full bg-emerald-400/12 px-2 py-0.5 text-[10px] font-medium text-emerald-300">From website</span>
  ) : (
    <span className="shrink-0 rounded-full bg-cyan-300/12 px-2 py-0.5 text-[10px] font-medium text-cyan-200">AI suggestion</span>
  );
}

function Panel({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <div aria-hidden={!on} className={`absolute inset-0 transition duration-500 motion-reduce:transition-none ${on ? "opacity-100" : "pointer-events-none opacity-0"}`}>
      {children}
    </div>
  );
}

export function HeroPlanDemo({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const root = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    const vis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    const el = root.current;
    const io = el ? new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 }) : null;
    if (el && io) io.observe(el);
    return () => {
      mq.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", vis);
      io?.disconnect();
    };
  }, []);

  const running = visible && !paused && !tabHidden && !reduced;
  const { t: clock, jump } = useClock(running);
  // With reduced motion the finished plan shows first; the visitor steps through it.
  const [step, setStep] = useState<number | null>(null);
  const t = reduced ? STAGES[step ?? STAGES.length - 1].at + SHOWN : clock;
  const stage = stageAt(t);
  const local = t - STAGES[stage].at;
  const done = stage === STAGES.length - 1 && local > 0.8;

  const typed = SHOP.url.slice(0, Math.max(0, Math.min(SHOP.url.length, Math.floor((t - 0.3) * 22))));
  const pages = ["Home", "Shop — mugs", "About the studio"];

  const sz = compact
    ? { body: "h-[262px]", pad: "p-3.5", h: "text-[13px]", s: "text-[11.5px]", xs: "text-[10.5px]" }
    : { body: "h-[318px]", pad: "p-5", h: "text-[15px]", s: "text-[13px]", xs: "text-[11.5px]" };

  const goTo = (i: number) => {
    if (reduced) setStep(i);
    else {
      jump(STAGES[i].at + SHOWN);
      setPaused(true);
    }
  };

  const shine: CSSProperties = { borderColor: "rgba(150,170,210,0.18)", backgroundImage: "var(--mairo-glass)", boxShadow: "0 40px 90px -40px rgba(0,0,0,0.95), var(--mairo-glow-soft)" };

  return (
    <figure ref={root} aria-label="Product demo: MAIRO making a free ad plan for a fictional business" className={`relative overflow-hidden rounded-[24px] border text-left ${className}`} style={shine}>
      {/* The window: where the plan is made. */}
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <i className="h-2 w-2 rounded-full bg-white/15" />
          <i className="h-2 w-2 rounded-full bg-white/15" />
          <i className="h-2 w-2 rounded-full bg-white/15" />
        </span>
        <span className={`ml-1 truncate font-medium text-white/70 ${sz.xs}`}>{compact ? "Free AI ad plan" : "MAIRO · Free AI ad plan"}</span>
        <span className={`ml-auto shrink-0 rounded-full border border-amber-200/25 bg-amber-200/[0.06] px-2 py-0.5 font-semibold uppercase tracking-[0.12em] text-amber-100/85 ${compact ? "text-[8.5px]" : "text-[9.5px]"}`}>{compact ? "Demo · fictional business" : "Product demo · fictional business"}</span>
      </div>

      {/* Which stage — the generator's own six. */}
      <div className={`flex items-center gap-2.5 border-b border-white/[0.06] ${compact ? "px-3.5 py-2" : "px-5 py-3"}`}>
        <span aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
          {done ? <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/15 text-[10px] text-emerald-300">✓</span> : <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-200/25 border-t-cyan-200 motion-reduce:animate-none" />}
        </span>
        <p className={`min-w-0 flex-1 truncate font-medium text-white ${sz.s}`} aria-hidden>
          {done ? "Your plan is ready" : `${STAGES[stage].label}…`}
        </p>
        <span className={`shrink-0 tabular-nums text-white/45 ${sz.xs}`} aria-hidden>
          {Math.min(stage + 1, 6)} / 6
        </span>
      </div>

      <div aria-hidden className={`relative ${sz.body} ${sz.pad}`}>
        {/* 1 — the website, read. */}
        <Panel on={stage === 0}>
          <div className={sz.pad}>
            <p className={`text-white/55 ${sz.xs}`}>Website</p>
            <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-white/[0.12] bg-[#060912]/80 px-3 py-2.5">
              <span className={`font-mono text-white ${sz.s}`}>{typed || " "}</span>
              <span className={`-ml-1.5 h-4 w-px bg-cyan-200 ${t < 1.6 ? "animate-pulse" : "opacity-0"}`} />
            </div>
            <ul className="mt-3 space-y-1.5">
              {pages.map((p, i) => (
                <In key={p} show={t > 1.8 + i * 0.45}>
                  <li className={`flex items-center gap-2 text-white/75 ${sz.s}`}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[9px] text-emerald-300">✓</span>
                    {compact ? <>Read {p}</> : <>Read {SHOP.url}/{["", "shop", "about"][i]} <span className="text-white/40">· {p}</span></>}
                  </li>
                </In>
              ))}
            </ul>
            <In show={t > 3.1}>
              <p className={`mt-3 text-emerald-300/90 ${sz.xs}`}>3 public pages read — {SHOP.name}</p>
            </In>
          </div>
        </Panel>

        {/* 2 — what MAIRO understood: facts, then its suggestions, each labelled. */}
        <Panel on={stage === 1}>
          <div className={sz.pad}>
            <p className={`font-semibold text-white ${sz.h}`}>What MAIRO understood</p>
            <div className="mt-2.5 space-y-2">
              {[
                { k: "Sells", v: SHOP.profile.offer, tag: "website" as const },
                { k: "Where", v: SHOP.profile.location, tag: "website" as const },
                { k: "Likely buyers", v: SHOP.story.cards.serve, tag: "ai" as const },
              ].map((f, i) => (
                <In key={f.k} show={local > 0.2 + i * 0.5}>
                  <div className="flex items-center gap-2 rounded-xl bg-white/[0.035] px-3 py-2">
                    <span className={`shrink-0 text-white/50 ${compact ? "w-[58px]" : "w-[78px]"} ${sz.xs}`}>{f.k}</span>
                    <span className={`min-w-0 flex-1 text-white ${compact ? "leading-snug" : "truncate"} ${sz.s}`}>{f.v}</span>
                    <Tag kind={f.tag} />
                  </div>
                </In>
              ))}
            </div>
            <In show={local > 1.9}>
              <p className={`mt-3.5 text-white/55 ${sz.xs}`}>Opportunity</p>
              <p className={`mt-1 text-white/85 ${sz.s}`}>Show the mug in use — a few seconds filmed on a phone gives Reels and Stories something to show.</p>
            </In>
          </div>
        </Panel>

        {/* 3 — strategy and audience. */}
        <Panel on={stage === 2}>
          <div className={sz.pad}>
            <p className={`font-semibold text-white ${sz.h}`}>Your Meta strategy</p>
            <In show={local > 0.2}>
              <div className="mt-2.5 rounded-xl bg-white/[0.035] px-3 py-2.5">
                <p className={`text-white/50 ${sz.xs}`}>Objective</p>
                <p className={`mt-0.5 font-medium text-white ${sz.s}`}>Sales — purchases on your website</p>
              </div>
            </In>
            <In show={local > 0.8}>
              <div className="mt-2 rounded-xl bg-white/[0.035] px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-white/50 ${sz.xs}`}>Audience</p>
                  <Tag kind="ai" />
                </div>
                <p className={`mt-0.5 text-white ${sz.s}`}>Coffee lovers and gift buyers across the US — start broad and let Meta find buyers.</p>
              </div>
            </In>
            <In show={local > 1.5}>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["Facebook Feed", "Instagram Feed", "Reels", "Stories"].map((p) => (
                  <span key={p} className={`rounded-full border border-white/[0.1] px-2.5 py-1 text-white/80 ${sz.xs}`}>{p}</span>
                ))}
              </div>
            </In>
          </div>
        </Panel>

        {/* 4 — the budget, divided by the generator's own rules. */}
        <Panel on={stage === 3}>
          <div className={sz.pad}>
            <div className="flex items-baseline justify-between gap-2">
              <p className={`font-semibold text-white ${sz.h}`}>Your {money(BUDGET.monthly)} a month</p>
              <p className={`tabular-nums text-white/50 ${sz.xs}`}>about {money(BUDGET.daily)} a day</p>
            </div>
            <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-white/[0.06]">
              {BUDGET.lines.map((l, i) => (
                <span key={l.key} className="h-full transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: local > 0.3 + i * 0.35 ? `${l.share}%` : "0%", background: COLORS[l.key] }} />
              ))}
            </div>
            <ul className="mt-3 space-y-1.5">
              {BUDGET.lines.map((l, i) => (
                <In key={l.key} show={local > 0.4 + i * 0.35}>
                  <li className={`flex items-center gap-2 ${sz.s}`}>
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[l.key] }} />
                    <span className="flex-1 text-white/85">{l.label}</span>
                    <span className="tabular-nums font-medium text-white">{money(l.monthly)}</span>
                    <span className="w-9 text-right tabular-nums text-white/45">{l.share}%</span>
                  </li>
                </In>
              ))}
            </ul>
            <In show={local > 1.9}>
              <p className={`mt-3 text-white/50 ${sz.xs}`}>Your own budget, divided — not a forecast. Paid to Meta from your ad account.</p>
            </In>
          </div>
        </Panel>

        {/* 5 — three concepts: ideas, not finished ads. */}
        <Panel on={stage === 4}>
          <div className={sz.pad}>
            <div className="flex items-baseline justify-between gap-2">
              <p className={`font-semibold text-white ${sz.h}`}>Three ad concepts</p>
              <p className={`text-white/45 ${sz.xs}`}>Concepts · free</p>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              {SHOP.concepts.map((c, i) => (
                <In key={c.id} show={local > 0.2 + i * 0.4}>
                  <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b1020]">
                    <BusinessArt type="shop" variant={c.art} className={`w-full ${compact ? "h-[62px]" : "h-[96px]"}`} />
                    <div className={compact ? "p-1.5" : "p-2"}>
                      <p className={`font-semibold leading-snug text-white ${compact ? "text-[10px]" : "text-[11.5px]"}`}>{c.hook}</p>
                      <p className={`mt-1 text-white/45 ${compact ? "text-[8.5px]" : "text-[9.5px]"}`}>{c.angle}</p>
                    </div>
                  </div>
                </In>
              ))}
            </div>
            <In show={local > 1.6}>
              <p className={`mt-3 text-white/50 ${sz.xs}`}>Concepts are written free. Finished AI images use subscription credits; videos are your own.</p>
            </In>
          </div>
        </Panel>

        {/* 6 — the plan, ready. */}
        <Panel on={stage === 5}>
          <div className={sz.pad}>
            <In show={local > 0.1}>
              <p className={`font-semibold text-white ${sz.h}`}>{SHOP.name}&rsquo;s free ad plan</p>
              <p className={`mt-0.5 text-white/50 ${sz.xs}`}>More online sales · {money(BUDGET.monthly)} a month</p>
            </In>
            <ul className={`mt-3 grid gap-1.5 ${compact ? "" : "grid-cols-2"}`}>
              {["Your business, understood", "Sales strategy on Facebook + Instagram", "Who to reach first", `Budget split: ${BUDGET.lines.length} parts`, "Three ad concepts", "Your first 30 days"].map((x, i) => (
                <In key={x} show={local > 0.3 + i * 0.18} className={compact && i > 3 ? "hidden" : ""}>
                  <li className={`flex items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2 text-white/85 ${sz.s}`}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-[9px] text-emerald-300">✓</span>
                    {x}
                  </li>
                </In>
              ))}
            </ul>
            <In show={local > 1.6}>
              <p className={`mt-3 text-white/50 ${sz.xs}`}>Nothing launched. Nothing charged.</p>
            </In>
          </div>
        </Panel>
      </div>

      <p className="sr-only">
        A looping demo for a fictional online shop, {SHOP.name}: MAIRO reads three public pages of its website, lists what it understood — what it sells and where it ships, from the website, and likely buyers as an AI suggestion — then a Sales strategy on Facebook and Instagram, a broad audience, the {money(BUDGET.monthly)} monthly budget split into {BUDGET.lines.map((l) => `${l.label.toLowerCase()} ${money(l.monthly)}`).join(", ")}, and three ad concepts.
      </p>

      {/* Controls: pause, and the six stages to step through. */}
      <div className={`flex items-center gap-2 border-t border-white/[0.06] ${compact ? "px-3 py-2" : "px-4 py-2.5"}`}>
        {!reduced && (
          <button type="button" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play the demo" : "Pause the demo"} className="flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60">
            {paused ? (
              <svg aria-hidden viewBox="0 0 12 12" className="ml-0.5 h-3 w-3 fill-current"><path d="M2 1.2v9.6L10.5 6z" /></svg>
            ) : (
              <svg aria-hidden viewBox="0 0 12 12" className="h-3 w-3 fill-current"><path d="M2.5 1.5h2.4v9H2.5zM7.1 1.5h2.4v9H7.1z" /></svg>
            )}
          </button>
        )}
        <div role="group" aria-label="Demo steps" className="flex flex-1 items-center gap-1.5">
          {STAGES.map((s, i) => (
            <button key={s.label} type="button" onClick={() => goTo(i)} aria-label={`Show step ${i + 1}: ${s.label}`} aria-current={i === stage ? "step" : undefined} className="group flex h-8 flex-1 items-center focus-visible:outline-none">
              <span className={`h-1 w-full rounded-full transition group-focus-visible:ring-2 group-focus-visible:ring-cyan-300/60 ${i < stage ? "bg-violet-400/70" : i === stage ? "bg-cyan-300" : "bg-white/12"}`} />
            </button>
          ))}
        </div>
        <span className={`hidden shrink-0 text-white/40 sm:inline ${sz.xs}`}>Sample plan</span>
      </div>
    </figure>
  );
}
