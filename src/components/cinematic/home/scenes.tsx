"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { WebsiteStart } from "./website-start";
import { SHOWCASE_PHOTOS } from "@/components/home/showcase-photos";

// The homepage after the hero (docs/DESIGN-SPEC-v3.md §7): how it works,
// one example, the two plans, and the closing line. The Field behind the
// page moves through its shapes as "How it works" scrolls by (data-scene,
// read by director.tsx); everything here is real text and works without it.
//
// Nothing here is a claim about results: the example is a fictional business
// with sample figures, and it says so where the figures are.

const STEPS = [
  { n: "01", title: "Analyze", text: "MAIRO reads your website and what you tell it: what you sell, who buys it, what makes you different." },
  { n: "02", title: "Create", text: "It writes the campaign and makes the ads — pictures, headlines, copy — for you to approve or change." },
  { n: "03", title: "Track", text: "It runs them on Facebook and Instagram, reads the results from Meta and tells you what's working." },
];

/** What each step looks like in MAIRO — an example readout beside the Field (fictional business). */
const READOUT: { title: string; rows: [string, string][] }[] = [
  { title: "Reading lumenskin.com", rows: [["Sells", "Skincare · 12 products"], ["Best seller", "Hydrating serum"], ["Customers", "Women 25–45, Austin"], ["Different", "Small-batch, local"]] },
  { title: "Making your ads", rows: [["Headline", "Skin that drinks it in."], ["Picture", "Serum on a pale pink set"], ["Placements", "Instagram feed · Stories"], ["Status", "Waiting for your approval"]] },
  { title: "Last 30 days", rows: [["Spent", "$600"], ["Purchases", "42"], ["Revenue (Meta)", "$2,310"], ["Tracking", "Working"]] },
];

function StepReadout({ step }: { step: number }) {
  const r = READOUT[step];
  return (
    <div className="pointer-events-none absolute bottom-[9svh] right-5 hidden w-[300px] sm:right-10 sm:block lg:right-16" aria-hidden>
      <div key={step} className="v3-tick rounded-[20px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink)]/85 p-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-[12.5px] font-medium text-white">
            <span className="v3-dot v3-breathe" />
            {r.title}
          </p>
          <span className="v3-label !text-[9.5px]">Example</span>
        </div>
        <dl className="mt-3 space-y-1.5">
          {r.rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 text-[12.5px]">
              <dt className="text-white/45">{k}</dt>
              <dd className="truncate text-white/85">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Which step is in the middle of the screen, from where the scene is. */
function useStep(ref: React.RefObject<HTMLElement | null>, count: number) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const l = (window.innerHeight / 2 - r.top) / Math.max(1, r.height);
      setStep(Math.min(count - 1, Math.max(0, Math.floor(l * count))));
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
  }, [ref, count]);
  return step;
}

export function HowItWorks() {
  const ref = useRef<HTMLElement>(null);
  const step = useStep(ref, STEPS.length);
  return (
    <section
      ref={ref}
      id="how"
      aria-labelledby="how-title"
      data-scene="2:4"
      data-scene-x="0.4"
      data-scene-y="0"
      data-scene-ym="0.46"
      data-scene-zoom="1.1"
      className="relative h-[300vh] scroll-mt-0"
    >
      <div className="sticky top-0 flex min-h-[100svh] items-end pb-[8svh] sm:items-center sm:pb-0">
        <StepReadout step={step} />
        <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-10 lg:px-16">
          <div className="max-w-[520px]">
            <p className="v3-label">How it works</p>
            <h2 id="how-title" className="v3-display mt-5 text-[clamp(40px,6vw,96px)] text-white">
              Three things
            </h2>
            <div aria-hidden className="mt-8 h-px w-full bg-[color:var(--v3-line)] sm:mt-10">
              <div className="h-px bg-[color:var(--v3-signal)] transition-[width] duration-500 [transition-timing-function:var(--ease-mairo)]" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
            <ol>
              {STEPS.map((s, i) => {
                const on = i === step;
                return (
                  <li key={s.n} className="border-b border-[color:var(--v3-line)] py-4 sm:py-5">
                    <div className="flex items-baseline gap-4">
                      <span className={`font-mono text-[11.5px] ${on ? "text-white" : "text-[color:var(--v3-text-3)]"}`}>{s.n}</span>
                      <h3 className={`text-[clamp(22px,2.4vw,30px)] font-semibold tracking-[-0.03em] transition-colors duration-300 ${on ? "text-white" : "text-white/40"}`}>{s.title}</h3>
                      {on && <span aria-hidden className="v3-dot ml-auto self-center" />}
                    </div>
                    <p className={`ml-[34px] mt-2 max-w-[460px] text-[15.5px] leading-relaxed text-[color:var(--v3-text-2)] ${on ? "" : "sr-only"}`}>{s.text}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

const SAMPLE = [
  { label: "Spent", value: "$600" },
  { label: "Purchases", value: "42" },
  { label: "Revenue", value: "$2,310" },
  { label: "Return on ad spend", value: "3.85×" },
];

export function ExampleRun() {
  return (
    <section id="example" aria-labelledby="example-title" className="relative bg-[color:var(--v3-ink)] py-[clamp(96px,14vw,200px)]">
      <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-10 lg:px-16">
        <p data-reveal className="v3-label">Example · fictional business</p>
        <h2 id="example-title" data-reveal className="v3-display mt-5 text-[clamp(40px,6vw,96px)] text-white">
          One sentence in,
          <br />a campaign out
        </h2>
        <div className="mt-14 grid gap-4 lg:grid-cols-[1fr_1.1fr_1fr]">
          <div data-reveal className="flex flex-col rounded-[24px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)] p-6">
            <p className="v3-label">You type</p>
            <p className="mt-5 text-[clamp(20px,1.9vw,26px)] font-medium leading-snug tracking-[-0.02em] text-white">
              &ldquo;Promote our new hydrating serum to women 25–45 near Austin. $20 a day.&rdquo;
            </p>
            <p className="mt-auto pt-8 text-[13px] text-[color:var(--v3-text-3)]">Lumen Skin — a fictional brand.</p>
          </div>
          <div data-reveal className="flex flex-col rounded-[24px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)] p-5">
            <div className="flex items-baseline justify-between px-1">
              <p className="v3-label">MAIRO makes</p>
              <p className="text-[12px] text-[color:var(--v3-text-3)]">Instagram feed</p>
            </div>
            <div className="v3-develop relative mt-4 aspect-square overflow-hidden rounded-[16px]">
              <Image src="/showcase/skincare.jpg" alt="Example ad picture: two serum bottles on a pale pink set" fill sizes="(max-width: 1024px) 92vw, 400px" className="object-cover" />
            </div>
            <p className="mt-4 px-1 text-[18px] font-semibold tracking-[-0.02em] text-white">Skin that drinks it in.</p>
            <p className="mt-1 px-1 text-[13.5px] leading-relaxed text-[color:var(--v3-text-2)]">Lightweight hydration that lasts all day. Made in small batches in Austin.</p>
            <p className="mt-4 inline-flex items-center gap-2 px-1 text-[12.5px] text-white/70">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-amber-300" />
              Waiting for your approval
            </p>
          </div>
          <div data-reveal className="flex flex-col rounded-[24px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)] p-6">
            <p className="v3-label">After 30 days</p>
            <dl className="mt-4">
              {SAMPLE.map((s) => (
                <div key={s.label} className="flex items-baseline justify-between border-b border-[color:var(--v3-line)] py-5">
                  <dt className="text-[14px] text-[color:var(--v3-text-2)]">{s.label}</dt>
                  <dd className="text-[clamp(26px,2.4vw,34px)] font-semibold tracking-[-0.035em] text-white">{s.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-auto pt-6 text-[12.5px] leading-relaxed text-[color:var(--v3-text-3)]">
              Sample figures for a fictional brand, to show the layout — not a result or a promise. Your own numbers come from your Meta ad account.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** What stays in the owner's hands, as big as the headline says it. */
export function ControlBand() {
  const lines = [
    { t: "You approve every dollar", s: "Nothing launches or spends more without your yes." },
    { t: "Your own Meta account", s: "Campaigns run in your ad account. You can see and stop everything." },
    { t: "Inside your limits", s: "Daily maximum, your area, your rules — checked before every change." },
    { t: "Pause any time", s: "One tap stops Autopilot. MAIRO keeps watching and recommending." },
  ];
  return (
    <section id="control" aria-labelledby="control-title" className="relative scroll-mt-20 border-y border-[color:var(--v3-line)] bg-[color:var(--v3-ink)] py-[clamp(80px,11vw,160px)]">
      <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-10 lg:px-16">
        <h2 id="control-title" data-reveal className="v3-label">MAIRO runs your ads, you stay in control</h2>
        <ul className="mt-10 divide-y divide-[color:var(--v3-line)]">
          {lines.map((l) => (
            <li key={l.t} data-reveal className="v3-row grid gap-2 py-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,380px)] sm:items-baseline sm:gap-10 sm:py-8">
              <p className="v3-display text-[clamp(32px,5vw,76px)] text-white">
                {l.t}
              </p>
              <p className="text-[15px] leading-relaxed text-[color:var(--v3-text-2)]">{l.s}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export type PricePlan = { tier: string; name: string; price: string; line: string; start: string; rows: [string, string][] };

export function PricingSimple({ plans }: { plans: PricePlan[] }) {
  return (
    <section id="pricing" aria-labelledby="pricing-title" className="relative bg-[color:var(--v3-ink)] py-[clamp(96px,14vw,200px)]">
      <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-10 lg:px-16">
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <div>
            <p data-reveal className="v3-label">Pricing</p>
            <h2 id="pricing-title" data-reveal className="v3-display mt-5 text-[clamp(40px,6vw,96px)] text-white">
              Two plans
            </h2>
          </div>
          <p data-reveal className="max-w-[420px] text-[15.5px] leading-relaxed text-[color:var(--v3-text-2)]">
            Seeing your first ad is free. The subscription is MAIRO&rsquo;s fee for making and running your campaigns. Your ad spend is separate: you set it, and Meta charges it to your own ad account.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2">
          {plans.map((p, i) => (
            <div key={p.tier} data-reveal className="flex flex-col rounded-[28px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)] p-7 sm:p-9">
              <div className="flex items-baseline justify-between gap-4">
                <h3 className="text-[19px] font-semibold tracking-[-0.02em] text-white">{p.name}</h3>
                {i === 0 && <span className="v3-label">Most businesses</span>}
              </div>
              <p className="mt-8 flex items-baseline gap-2">
                <span className="text-[clamp(48px,5vw,68px)] font-semibold tracking-[-0.05em] text-white">{p.price}</span>
                <span className="text-[14px] text-[color:var(--v3-text-3)]">/ month</span>
              </p>
              <p className="mt-1 text-[13px] text-[color:var(--v3-text-3)]">+ your Meta ad spend, paid to Meta · {p.start}</p>
              <p className="mt-4 text-[15px] text-[color:var(--v3-text-2)]">{p.line}</p>
              <dl className="mt-7 divide-y divide-[color:var(--v3-line)] border-t border-[color:var(--v3-line)]">
                {p.rows.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-4 py-3 text-[14.5px] leading-snug">
                    <dt className="text-[color:var(--v3-text-3)]">{k}</dt>
                    <dd className="text-white/90">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </div>
        <div data-reveal className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-4">
          <a href="#hero-website" className="cine-cta inline-flex min-h-[52px] items-center gap-2 rounded-full px-7 text-[15.5px] font-semibold">
            See my first ad <span aria-hidden>→</span>
          </a>
          <nav aria-label="Plan details" className="flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[color:var(--v3-text-2)]">
            <Link href="/pricing" className="underline decoration-white/25 underline-offset-4 hover:text-white">Compare everything in each plan</Link>
            <span>You approve every launch</span>
            <span>Your own Meta ad account</span>
            <span>Cancel any time</span>
          </nav>
        </div>
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <section aria-labelledby="close-title" data-scene="5:5" data-scene-y="0.36" data-scene-ym="0.5" data-scene-dim="0.8" className="relative flex min-h-[100svh] items-end pb-[10svh]">
      <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-10 lg:px-16">
        <h2 id="close-title" data-reveal className="v3-display text-[clamp(48px,9vw,160px)] text-white">
          Start with
          <br />
          your website
        </h2>
        <div data-reveal className="mt-10 max-w-[620px]">
          <WebsiteStart id="close-website" />
        </div>
      </div>
    </section>
  );
}

// --- The work ---------------------------------------------------------------
//
// What MAIRO makes, at a size where the work can be judged: four sample ads
// for fictional brands, each in a different format and built on a different
// idea, with the creative decision behind it in one line. The pictures are
// renders made for this page (showcase-photos.ts) — never a customer's
// product — and every card says "Sample".

const WORK = [
  { key: "online", brand: "Kiln & Co", format: "Feed · 1:1", aspect: "aspect-square", headline: "The gift that gets used every morning", idea: "Offer first", why: "Leads with the gift box, because a ready-to-give set is the reason to buy now." },
  { key: "local", brand: "Harbour Plumbing", format: "Feed · 4:5", aspect: "aspect-[4/5]", headline: "Leak under the sink? Fixed today.", idea: "Problem first", why: "Opens on the problem customers call about most, then answers it in four words." },
  { key: "fitness", brand: "Ironhouse", format: "Stories · 9:16", aspect: "aspect-[9/16]", headline: "Everything you need. Nothing you don't.", idea: "Show the product", why: "Shows exactly what arrives, so people who are comparing don't have to guess." },
  { key: "furniture", brand: "Sage & Oak", format: "Feed · 4:5", aspect: "aspect-[4/5]", headline: "Picture it in your living room", idea: "Picture the outcome", why: "A real room, in afternoon light, so people imagine it in theirs before they see a price." },
] as const;

export function TheWork() {
  return (
    <section id="work" aria-labelledby="work-title" className="relative scroll-mt-20 bg-[color:var(--v3-ink)] py-[clamp(80px,11vw,160px)]">
      <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-10 lg:px-16">
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-5">
          <div>
            <p data-reveal className="v3-label">The work · sample ads for fictional brands</p>
            <h2 id="work-title" data-reveal className="v3-display mt-5 text-[clamp(40px,6vw,96px)] text-white">
              Different ideas,
              <br />
              not one ad four ways
            </h2>
          </div>
          <p data-reveal className="max-w-[420px] text-[15.5px] leading-relaxed text-[color:var(--v3-text-2)]">
            MAIRO changes the idea, not just the colour: the offer, the problem, the product or the outcome — each in the format it&rsquo;ll run in, with the reason it might work.
          </p>
        </div>
        <ul className="mt-12 grid items-end gap-x-4 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {WORK.map((w) => {
            const photo = SHOWCASE_PHOTOS[w.key];
            return (
              <li key={w.key} data-reveal className="min-w-0">
                <div className={`relative ${w.aspect} overflow-hidden rounded-[18px] border border-[color:var(--v3-line)] bg-[color:var(--v3-ink-2)]`}>
                  {photo && <Image src={photo.src} alt={photo.alt} fill sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 300px" className="object-cover" style={photo.focus ? { objectPosition: photo.focus } : undefined} />}
                  <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-white/90">Sample</span>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-4 pt-12">
                    <p className="text-[11.5px] text-white/70">{w.brand} · Sponsored</p>
                    <p className="mt-1 text-[17px] font-semibold leading-snug tracking-[-0.01em] text-white">{w.headline}</p>
                  </div>
                </div>
                <p className="mt-4 flex items-baseline justify-between gap-3">
                  <span className="text-[14px] font-medium text-white">{w.idea}</span>
                  <span className="font-mono text-[11px] text-[color:var(--v3-text-3)]">{w.format}</span>
                </p>
                <p className="mt-1.5 text-[14px] leading-relaxed text-[color:var(--v3-text-2)]">{w.why}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// --- Practical questions ----------------------------------------------------
//
// The four things owners ask before they start, answered by what the product
// does: who pays Meta, what access MAIRO gets, what needs approval, and what
// they need to begin.

const FAQ = [
  { q: "Who pays for the ads?", a: "You do, directly to Meta. Ad spend is charged to your own Meta ad account at the budget you approve. MAIRO's subscription is separate and covers making and running your campaigns — MAIRO never takes a cut of your ad spend." },
  { q: "What access does MAIRO get to my Meta account?", a: "You sign in with Facebook and choose the ad account and Page MAIRO may use. Campaigns are created in your account, where you can see, pause or stop them in Ads Manager. You can disconnect MAIRO at any time." },
  { q: "Does anything go live without my approval?", a: "No launch, new ad or budget increase happens without your yes, and MAIRO shows the exact ad, budget, schedule and destination first. On Scale you can let Autopilot make smaller changes inside limits you set; it never raises your total budget." },
  { q: "What do I need to get started?", a: "Just your website to see your first ad. To run it: a free account, a MAIRO plan, and a Meta ad account with a payment method and a Facebook Page. Online stores also need purchase tracking — MAIRO checks it before a sales campaign launches." },
];

export function PracticalFaq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="relative scroll-mt-20 bg-[color:var(--v3-ink)] pb-[clamp(64px,9vw,128px)]">
      <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-5 sm:px-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-16">
        <h2 id="faq-title" data-reveal className="v3-display text-[clamp(32px,4vw,56px)] text-white">
          Before you start
        </h2>
        <div className="divide-y divide-[color:var(--v3-line)] border-y border-[color:var(--v3-line)]">
          {FAQ.map((f) => (
            <details key={f.q} data-reveal className="group py-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-6 text-[17px] font-medium text-white">
                {f.q}
                <span aria-hidden className="text-[20px] leading-none text-white/50 transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-[color:var(--v3-text-2)]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
