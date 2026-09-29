import Image from "next/image";
import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { LandingNav } from "@/components/landing/landing-nav";
import { WatchDemo } from "@/components/landing/watch-demo";
import { BusinessTypes } from "@/components/landing/business-types";
import { DecisionExplainer } from "@/components/landing/decision-explainer";
import { LiveFeed } from "@/components/landing/live-feed";
import { Faq } from "@/components/faq";
import { DashboardMock } from "@/components/landing/dashboard-mock";
import { InstagramMark, MetaMark } from "@/components/mairo/marks";
import { ResultsNote } from "@/components/results-disclaimer";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

// The marketing page.
//
// Dark, violet-lit, product-first: the dashboard on a laptop in a room at dusk
// behind the headline, and every section showing the product rather than
// describing it.
//
// One rule above the design: nothing here claims what isn't true. No invented
// customer counts, no borrowed results, no "no card required" when the trial
// takes a card. Product pictures carry figures, and each one is marked as an
// example. The places a page like this usually puts testimonials say instead
// what a business can count on — until there are real customers to quote.

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

const ACCENT = "bg-gradient-to-r from-[#8b4dfb] to-[#5f2dfd]";
const GRADIENT_TEXT = "bg-gradient-to-r from-[#e27bf5] via-[#9a6bff] to-[#6a5cff] bg-clip-text text-transparent";

/** The feature strip's solid icons. */
const FILLED = {
  bolt: <path fill="currentColor" d="M13.5 2 4.5 13.5h6.2L9.5 22 19.5 9.8h-6.4z" />,
  target: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2">
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </g>
  ),
  bars: (
    <g fill="currentColor">
      <rect x="4" y="13" width="4" height="8" rx="1.2" />
      <rect x="10" y="8" width="4" height="13" rx="1.2" />
      <rect x="16" y="3" width="4" height="18" rx="1.2" />
    </g>
  ),
  user: (
    <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </g>
  ),
};

/** The kinds of businesses Mairo is built for. Each tag says who, never a result. */
const WHO = [
  { src: "/landing/card-1.webp", alt: "A boxing coach training in a gym", v: "Gyms", k: "& fitness coaches", pos: "30% 40%" },
  { src: "/landing/card-2.webp", alt: "A black running shoe on concrete", v: "Stores", k: "& online shops", pos: "45% 50%" },
  { src: "/landing/card-3.webp", alt: "A woman in sunglasses", v: "Brands", k: "& boutiques", pos: "35% 40%" },
  { src: "/landing/card-4.webp", alt: "A skincare serum bottle", v: "Beauty", k: "& skincare", pos: "70% 50%" },
];

function Icon({ d }: { d: ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
        {d}
      </svg>
    </span>
  );
}

const I = {
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" />
    </>
  ),
  bars: <path d="M5 20V10M12 20V4M19 20v-7" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
    </>
  ),
  spark: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  rocket: <path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m-2-3 3 3m-3-3c1-4 4-9 11-10-1 7-6 10-10 11m4-7a1 1 0 1 0 2 0 1 1 0 0 0-2 0" />,
  auto: <path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4" />,
  brain: <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zm6 0a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" />,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  chart: <path d="M4 19h16M6 15l4-5 3 3 5-7" />,
  shield: <path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z" />,
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

function SectionHead({ title, sub, action }: { title: ReactNode; sub: string; action?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-[clamp(26px,3.6vw,38px)] font-semibold leading-[1.1] tracking-[-0.03em] text-white">{title}</h2>
        <p className="mt-2 text-[15px] text-white/60">{sub}</p>
      </div>
      {action}
    </div>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.045] to-white/[0.015] ${className}`}>{children}</div>
  );
}

const STEPS = [
  { n: 1, title: "Connect your account", body: "Link your Facebook and Instagram ad account in a couple of clicks. Your account, your data.", icon: I.user },
  { n: 2, title: "Tell Mairo your goal", body: "More sales, more leads, more bookings — and what you want to spend. Or paste your website and Mairo works it out.", icon: I.target },
  { n: 3, title: "AI builds your ads", body: "Mairo writes the ads, sets up the audience and budget, and scores the campaign before any money is spent.", icon: I.spark },
  { n: 4, title: "Mairo keeps improving it", body: "Every day Mairo checks your campaigns and tells you what to change — or makes small fixes itself, inside your limits.", icon: I.auto },
];

const FEATURES = [
  { title: "AI ad creation", body: "Ad words in three angles, images from your own photos, and a new version whenever one wears out.", icon: I.spark },
  { title: "Launch in minutes", body: "Seven plain questions and Mairo builds the campaign in your own Meta ad account.", icon: I.rocket },
  { title: "Automatic optimization", body: "Pauses what's wasting money and moves budget to what works — only within the limits you set.", icon: I.auto },
  { title: "Business Brain", body: "Paste your website once. Mairo remembers your products, prices and voice for every campaign.", icon: I.brain },
  { title: "AI assistant", body: "Ask why sales dipped or what to do with $500, and get an answer from your own numbers.", icon: I.chat },
  { title: "Real-time reporting", body: "Spend, customers, cost per customer and return — read live from Meta, in plain English.", icon: I.chart },
];

const FAQ = [
  {
    q: "Do I need any advertising experience?",
    a: "No. Mairo asks plain questions about your business, builds the campaign, and explains every change in normal language. Advanced mode shows the full numbers when you want them.",
  },
  {
    q: "Who pays for the ads themselves?",
    a: "You pay Meta directly, from your own ad account, at whatever budget you set. Your Mairo plan is separate and never includes ad spend.",
  },
  {
    q: "Does Mairo change my campaigns without asking?",
    a: "Only if you let it. In Manual mode nothing changes without your approval. In AI Assist and Full Autopilot, Mairo can make changes inside the limits you set — and new campaigns and any increase to your total budget always wait for your yes. Every change is logged with the reason.",
  },
  {
    q: "Which platforms does Mairo work with?",
    a: "Facebook and Instagram, through your own Meta ad account.",
  },
  {
    q: "How does the free trial work?",
    a: `Every plan starts with a ${TRIAL_DAYS}-day free trial. It asks for a card and charges nothing during the trial; cancel before it ends and you pay nothing.`,
  },
  {
    q: "Can Mairo guarantee results?",
    a: "No one honestly can. Mairo works from what you tell it and what your ad account reports, shows the data behind every recommendation, and tells you when it doesn't have enough data yet.",
  },
];

const PROMISES = [
  { big: "You approve", title: "Nothing launches without you", body: "Mairo builds campaigns paused. New campaigns, and any rise in your total budget, always wait for your yes.", icon: I.shield },
  { big: "Your numbers", title: "No borrowed results", body: "Every figure comes from your own ad account. Mairo compares your campaigns with themselves, never with made-up benchmarks.", icon: I.eye },
  { big: "Your limits", title: "A ceiling it can't cross", body: "Set a daily maximum and the most Mairo may change in a day. Every change it makes is logged, with the reason.", icon: I.lock },
];

export default function Home() {
  return (
    <div className={`${jakarta.className} relative min-h-screen overflow-x-hidden bg-[#02060b] tracking-[0.005em] text-white`}>
      <LandingNav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden pt-[72px] lg:min-h-[min(45vw,694px)]">
        <div className="relative z-10 mx-auto max-w-[1360px] px-5 sm:px-8 lg:px-12">
          <div className="pt-8 lg:max-w-[640px] lg:pt-12">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#1a1830]/80 px-3.5 py-2 text-[13px] text-white/90">
              <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-[#a78bfa]">
                <path d="M8 0c.4 3.8 2.2 5.6 6 6-3.8.4-5.6 2.2-6 6-.4-3.8-2.2-5.6-6-6 3.8-.4 5.6-2.2 6-6z" transform="translate(0 2)" />
              </svg>
              AI Advertising for Real Businesses
            </span>
            <h1 className="mt-5 text-[clamp(42px,5.1vw,70px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
              <span className="whitespace-nowrap">More customers,</span>
              <br />
              <span className={GRADIENT_TEXT}>less work.</span>
            </h1>
            <p className="mt-5 max-w-[610px] text-[16px] leading-[1.55] text-white/85 sm:text-[17px]">
              Mairo creates, launches, and optimizes your Facebook and Instagram ads with AI — so you can get more
              customers while you run your business.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className={`${ACCENT} inline-flex h-[54px] items-center justify-center gap-2.5 rounded-full px-8 text-[15.5px] font-semibold shadow-[0_14px_40px_-10px_rgba(124,77,255,0.9)] transition hover:brightness-110`}
              >
                Get started free <span aria-hidden>→</span>
              </Link>
              <WatchDemo className="inline-flex h-[54px] items-center justify-center gap-3 rounded-full border border-white/25 bg-black/60 px-7 text-[15.5px] font-medium text-white transition hover:border-white/45" />
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[12.5px] text-white/75">
              {[`${TRIAL_DAYS}-day free trial`, "Setup in minutes", "Works with your own Meta ad account"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-[#5b4ff5]">
                    <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 fill-none stroke-white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2.5 6.2 5 8.5l4.5-5" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* The room, the laptop, the city — faded into the page on the left. */}
        <div className="relative -z-10 mt-10 aspect-[1224/988] w-full lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:w-[min(56%,860px)]">
          <Image src="/landing/hero.webp" alt="" fill priority sizes="(min-width: 1024px) 60vw, 100vw" className="object-cover" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#02060b_0%,rgba(2,6,11,0.55)_14%,transparent_32%)] max-lg:hidden" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,#02060b_0%,transparent_22%,transparent_70%,#02060b_100%)] lg:bg-[linear-gradient(180deg,rgba(2,6,11,0.55)_0%,transparent_14%,transparent_78%,#02060b_100%)]" />
          <span className="absolute left-[19.5%] top-[67%] rounded-full border border-white/15 bg-black/60 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white/60">
            Example
          </span>
        </div>

        {/* What it works with — stated as fact, not as endorsement. */}
        <div className="relative z-10 mx-auto max-w-[1360px] px-5 pb-10 sm:px-8 lg:mt-14 lg:px-12">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-14">
            <p className="shrink-0 text-[13.5px] leading-snug text-white/75">
              Works with the tools
              <br className="hidden md:block" /> you already use
            </p>
            <ul className="flex flex-wrap items-center gap-x-10 gap-y-5 text-white/85">
              <li className="flex items-center gap-1.5 text-[24px] font-bold italic tracking-[-0.02em]">
                <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7 fill-current">
                  <path d="M15.3 3.6c-.1 0-.3 0-.4.1l-.6.2C13.9 2.7 13.3 2 12.4 2 10.5 2 9.6 4.4 9.3 5.6l-1.8.6c-.6.2-.6.2-.7.7L5.3 19.9 16.9 22l.6-.1-2.2-18.3zM12.9 4.4l-1.4.5c.3-1.1.8-2.1 1.5-2.4.2.4.2.9 0 1.9zm-1.5-2c.1 0 .2 0 .3.1-.9.4-1.8 1.4-2.2 3.5l-1.1.3c.3-1.3 1.2-3.9 3-3.9zm2.3 13.8c-.9.4-1.8.6-2.7.3-1.6-.5-1.8-1.9-1.4-2.4.2-.3 1.1-.4 1.6-.2.5.2 1.1.6 1.2.2.2-.5-.8-1.2-1.7-1.8-1.6-1.1-1.8-2.9-.4-4 1.1-.9 2.4-.7 3.1-.4l-.5 1.6c-.4-.2-1.2-.4-1.6.1-.3.4.3.9.9 1.3 1.2.8 2.3 1.6 2 3.2-.1.9-.7 1.6-1.5 2.1z" />
                </svg>
                shopify
              </li>
              <li className="flex items-center gap-1.5 text-[24px] font-semibold tracking-[-0.02em]">
                <span className="h-7 w-7"><MetaMark /></span> Meta
              </li>
              <li className="flex items-center gap-2 text-[24px] font-semibold tracking-[-0.02em]">
                <span className="h-6 w-6"><InstagramMark /></span> Instagram
              </li>
              <li className="text-[25px] font-medium tracking-[-0.02em]">Google</li>
              <li className="text-[25px] font-bold tracking-[-0.03em]">stripe</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Four promises, one line each ─────────────────────────────── */}
      <section className="relative mx-auto max-w-[1360px] px-5 pb-12 pt-10 sm:px-8 lg:px-12 lg:pt-14">
        <div className="grid gap-7 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0 lg:divide-x lg:divide-white/[0.08]">
          {[
            { t: "Create ads with AI", b: "Ad words and images made for your business in seconds.", i: FILLED.bolt },
            { t: "Launch in minutes", b: "Mairo sets up and launches your campaigns.", i: FILLED.target },
            { t: "Get more customers", b: "AI checks your ads every day and says what to improve.", i: FILLED.bars },
            { t: "All in one place", b: "Facebook and Instagram ads, managed together.", i: FILLED.user },
          ].map((f) => (
            <div key={f.t} className="flex gap-4 lg:px-7 lg:first:pl-0">
              <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl bg-[#111228] text-[#7c4dff] max-lg:h-12 max-lg:w-12">
                <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>{f.i}</svg>
              </span>
              <div>
                <p className="text-[15.5px] font-bold">{f.t}</p>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/65">{f.b}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Who it's for — pictures of the kinds of businesses Mairo is built for. */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {WHO.map((c) => (
            <div key={c.src} className="relative aspect-[2.3/1] overflow-hidden rounded-2xl border border-white/10">
              <Image src={c.src} alt={c.alt} fill sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="object-cover" style={{ objectPosition: c.pos }} />
              <span className="absolute right-[5%] top-[11%] rounded-xl border border-white/10 bg-[#171428]/90 px-3 py-1.5 text-center backdrop-blur-md">
                <span className="block bg-gradient-to-r from-[#d8b4fe] to-[#a78bfa] bg-clip-text text-[16px] font-extrabold leading-tight text-transparent">{c.v}</span>
                <span className="block text-[10px] text-white/85">{c.k}</span>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12">
        <SectionHead
          title="How Mairo works"
          sub="Go from idea to more customers in minutes. Mairo handles the heavy lifting."
          action={<Link href="/sign-up" className="text-[14px] text-violet-300 hover:text-white">Start your free trial →</Link>}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <Panel key={s.n} className="p-5">
              <div className="flex items-center gap-3">
                <span className={`${ACCENT} flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-semibold`}>{s.n}</span>
                <Icon d={s.icon} />
              </div>
              <p className="mt-4 text-[16px] font-medium">{s.title}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">{s.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* ── Choose your business type ────────────────────────────────── */}
      <section id="business-types" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12">
        <SectionHead
          title="Built for the way you do business."
          sub="Choose your business type and see how Mairo would run your advertising."
        />
        <BusinessTypes />
      </section>

      {/* ── Everything you need ──────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1360px] px-5 py-16 sm:px-8 lg:px-12">
        <SectionHead title="Everything you need to grow, powered by AI" sub="One platform that runs your advertising for real businesses." />
        <div className="grid items-stretch gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <Panel key={f.title} className="p-5">
                <Icon d={f.icon} />
                <p className="mt-4 text-[15px] font-medium">{f.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/60">{f.body}</p>
              </Panel>
            ))}
          </div>
          <Panel className="relative overflow-hidden p-5">
            <div className="flex items-center justify-between">
              <p className="text-[14px] font-medium">Ad versions, written for you</p>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-white/55">Example</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { a: "The benefit", h: "Lighter every mile", t: "from-[#312e81] to-[#7c3aed]" },
                { a: "The problem", h: "No more sore feet", t: "from-[#1e3a8a] to-[#9333ea]" },
                { a: "What's different", h: "Made to be worn daily", t: "from-[#581c87] to-[#db2777]" },
                { a: "The offer", h: "Free returns, always", t: "from-[#0f172a] to-[#4f46e5]" },
              ].map((v) => (
                <div key={v.a} className="overflow-hidden rounded-xl border border-white/10">
                  <div className={`h-24 bg-gradient-to-br ${v.t}`} />
                  <div className="p-2.5">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-violet-300">{v.a}</p>
                    <p className="mt-0.5 text-[12.5px] font-medium">{v.h}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[12.5px] leading-relaxed text-white/55">
              Mairo writes only from what you tell it or what&rsquo;s on your website — never invented prices or offers.
            </p>
          </Panel>
        </div>
      </section>

      {/* ── The dashboard ────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1360px] px-5 py-16 sm:px-8 lg:px-12">
        <SectionHead
          title="A dashboard built to give you results"
          sub="See everything that matters, all in one place — read live from your own ad account."
          action={<Link href="/sign-up" className="text-[14px] text-violet-300 hover:text-white">Explore the dashboard →</Link>}
        />
        <div className="mx-auto max-w-[980px] rounded-2xl border border-white/10 bg-[#0b0b14] p-2 shadow-[0_40px_120px_-40px_rgba(124,92,255,0.5)]">
          <div className="aspect-[4/3] rounded-xl sm:aspect-[16/9]">
            <DashboardMock compact />
          </div>
        </div>
      </section>

      {/* ── See Mairo working (example feed) ─────────────────────────── */}
      <section id="activity" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
          <div>
            <h2 className="text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08] tracking-[-0.03em]">
              See Mairo <span className={GRADIENT_TEXT}>working.</span>
            </h2>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-white/65">
              Your campaigns don&rsquo;t stop when you log out. Mairo keeps analyzing performance and looking for ways to improve your advertising.
            </p>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-white/50">
              Switch between <span className="text-white/80">Simple</span> and <span className="text-white/80">Advanced</span> — the same
              finding, in plain words or in the numbers. It&rsquo;s the same switch you get inside Mairo.
            </p>
          </div>
          <LiveFeed />
        </div>
      </section>

      {/* ── Why Mairo made this decision ─────────────────────────────── */}
      <section id="decisions" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1080px]">
          <h2 className="text-center text-[clamp(28px,4.4vw,48px)] font-semibold leading-[1.08] tracking-[-0.03em]">
            Mairo doesn&rsquo;t just tell you what to do.
            <br />
            <span className={GRADIENT_TEXT}>It shows you why.</span>
          </h2>
          <div className="mt-10">
            <DecisionExplainer />
          </div>
          <p className="mt-5 text-center text-[13.5px] text-white/55">Every Mairo recommendation shows the data behind the decision.</p>
        </div>
      </section>

      {/* ── Mairo AI ─────────────────────────────────────────────────── */}
      <section id="assistant" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[clamp(28px,4vw,44px)] font-semibold leading-[1.08] tracking-[-0.03em]">
              Ask Mairo anything <span className={GRADIENT_TEXT}>about your ads.</span>
            </h2>
            <p className="mt-4 max-w-lg text-[16px] leading-relaxed text-white/65">
              Mairo&rsquo;s assistant answers from your own account&rsquo;s numbers, in plain English. When something needs fixing, it proposes
              the fix — and nothing changes until you approve it.
            </p>
            <ul className="mt-6 space-y-2.5 text-[14.5px] text-white/80">
              {["“Why did my sales drop yesterday?”", "“What should I do with an extra $500 this month?”", "“Which ad is working best, and why?”"].map((q) => (
                <li key={q} className="flex items-center gap-3">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                  {q}
                </li>
              ))}
            </ul>
          </div>
          <Panel className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[13.5px] font-semibold">
                <span className={`${ACCENT} flex h-7 w-7 items-center justify-center rounded-full text-[12px]`}>M</span>
                Mairo
              </p>
              <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Example</span>
            </div>
            <div className="mt-5 space-y-4">
              <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-violet-500/20 px-4 py-2.5 text-[14px] text-white ring-1 ring-violet-400/30">
                Why did my sales drop yesterday?
              </p>
              <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-black/25 px-4 py-3 text-[14px] leading-relaxed text-white/85">
                You spent $84 yesterday and got 3 purchases, down from 6 the day before. Most of the drop came from Creative #2 — people are
                seeing it more often and clicking it less. Creative #4 is still steady.
                <span className="mt-3 block text-white/60">I can write a fresh version of Creative #2 for you to review.</span>
                <span className={`${ACCENT} mt-3 inline-flex rounded-lg px-3 py-1.5 text-[12.5px] font-medium`} aria-hidden>
                  Fix this for me →
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </section>

      {/* ── What you can count on (instead of borrowed testimonials) ─── */}
      <section className="relative mx-auto max-w-[1360px] px-5 py-16 sm:px-8 lg:px-12">
        <SectionHead
          title="You stay in control of every dollar"
          sub="Mairo is new, so there are no customer stories here yet — just what you can count on from day one."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {PROMISES.map((p) => (
            <Panel key={p.title} className="p-6">
              <div className="flex items-start justify-between">
                <p className={`text-[26px] font-semibold tracking-[-0.03em] ${GRADIENT_TEXT}`}>{p.big}</p>
                <Icon d={p.icon} />
              </div>
              <p className="mt-4 text-[15px] font-medium">{p.title}</p>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-white/60">{p.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12">
        <SectionHead
          title="Simple, transparent pricing"
          sub={`All the tools you need to get more customers. Every plan starts with a ${TRIAL_DAYS}-day free trial.`}
        />
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                plan.featured
                  ? "border-violet-400/50 bg-gradient-to-b from-violet-500/[0.14] to-white/[0.02] shadow-[0_30px_80px_-30px_rgba(139,92,246,0.7)]"
                  : "border-white/[0.08] bg-white/[0.025]"
              }`}
            >
              {plan.featured && (
                <span className={`${ACCENT} absolute -top-3 left-6 rounded-full px-3 py-1 text-[11px] font-medium`}>Most popular</span>
              )}
              <p className="text-[16px] font-medium">{plan.name}</p>
              <p className="mt-1 text-[13px] text-white/55">{plan.headline}</p>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-[38px] font-semibold tracking-[-0.03em] tabular-nums">${plan.priceMonthly}</span>
                <span className="text-[13px] text-white/50">/month</span>
              </p>
              <p className="mt-1 text-[13px] text-white/60">{plan.tagline}</p>
              <ul className="mt-5 flex-1 space-y-2 text-[13.5px] text-white/80">
                {plan.inherits && <li className="text-white/50">Everything in {plan.inherits}, plus:</li>}
                {plan.features.map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span aria-hidden className="mt-[3px] text-[11px] text-violet-300">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`mt-6 rounded-full py-3 text-center text-[14px] font-medium transition ${
                  plan.featured ? `${ACCENT} hover:brightness-110` : "border border-white/15 hover:border-white/35"
                }`}
              >
                Start free trial <span aria-hidden>→</span>
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-3xl text-[13px] leading-relaxed text-white/55">
          Your plan pays for Mairo. Your advertising budget is separate — it goes straight from you to Meta, at whatever
          you set. The trial asks for a card and charges nothing for {TRIAL_DAYS} days; cancel before then and you pay nothing.{" "}
          <Link href="/for-freelancers" className="text-violet-300 hover:text-white">Running ads for clients? See the freelancer and agency plans →</Link>
        </p>
        <ResultsNote className="mt-3 max-w-3xl" />
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-16 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[0.7fr_1.3fr]">
          <SectionHead title="Questions, answered" sub="The things people ask before they start." />
          <Faq items={FAQ} />
        </div>
      </section>

      {/* ── Final call ───────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1360px] px-5 pb-20 pt-10 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-3xl border border-violet-400/25 bg-[radial-gradient(120%_140%_at_85%_0%,rgba(168,85,247,0.35),transparent_55%),linear-gradient(135deg,#120c2a,#07060f)] px-6 py-14 text-center sm:px-12">
          <h2 className="text-[clamp(32px,5vw,54px)] font-semibold leading-[1.05] tracking-[-0.035em]">
            Let Mairo run <span className={GRADIENT_TEXT}>your ads.</span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[15.5px] leading-relaxed text-white/70">
            Tell Mairo what you&rsquo;re trying to accomplish. It builds the strategy, checks the campaign before money is
            spent, watches it after launch, and tells you what should change.
          </p>
          <Link
            href="/sign-up"
            className={`${ACCENT} mt-8 inline-flex items-center gap-2 rounded-full px-8 py-4 text-[15px] font-medium shadow-[0_12px_40px_-10px_rgba(139,92,246,0.9)] transition hover:brightness-110`}
          >
            Start your {TRIAL_DAYS}-day free trial <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-[1360px] flex-col gap-6 text-[13px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[18px] font-semibold tracking-[-0.03em] text-white">Mairo</span>
            <span>© {new Date().getFullYear()}</span>
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-3">
            <Link href="/for-freelancers" className="hover:text-white">For freelancers</Link>
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/data-deletion" className="hover:text-white">Data deletion</Link>
            <Link href="/sign-in" className="hover:text-white">Log in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
