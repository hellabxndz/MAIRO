import Link from "next/link";
import type { ReactNode } from "react";
import { LandingNav } from "@/components/landing/landing-nav";
import { DuskSky } from "@/components/landing/dusk-sky";
import { DashboardMock, LaptopMock } from "@/components/landing/dashboard-mock";
import { BrandInstagramMark, BrandMetaMark } from "@/components/mairo/marks";
import { ResultsNote } from "@/components/results-disclaimer";
import { PLANS, TRIAL_DAYS } from "@/lib/plans";

// The marketing page.
//
// Dark, violet-lit, product-first: a city at dusk behind the headline, the
// dashboard on a laptop, and every section showing the product rather than
// describing it.
//
// One rule above the design: nothing here claims what isn't true. No invented
// customer counts, no borrowed results, no "no card required" when the trial
// takes a card. Product pictures carry figures, and each one is marked as an
// example. The places a page like this usually puts testimonials say instead
// what a business can count on — until there are real customers to quote.

const ACCENT = "bg-gradient-to-r from-[#7c5cff] to-[#a855f7]";
const GRADIENT_TEXT = "bg-gradient-to-r from-[#c084fc] via-[#a78bfa] to-[#818cf8] bg-clip-text text-transparent";

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

const DECISIONS = [
  {
    tag: "Budget",
    tone: "#818cf8",
    title: "Move budget to a stronger campaign",
    body: "“Spring sale” is getting purchases 38% cheaper than “New arrivals”. Mairo recommends moving $6/day across — your total stays the same.",
    action: "Approve",
  },
  {
    tag: "Creative",
    tone: "#c084fc",
    title: "Creative fatigue detected",
    body: "People are seeing Creative #3 too often and fewer are clicking it — down 29% in 5 days. Mairo can write a fresh version to test.",
    action: "Create replacement",
  },
  {
    tag: "Website",
    tone: "#fbbf24",
    title: "People click but don’t buy",
    body: "120 clicks this week and no purchases. Mairo opened the page as a phone would — it isn’t set up for phones.",
    action: "See the fix",
  },
];

const PROMISES = [
  { big: "You approve", title: "Nothing launches without you", body: "Mairo builds campaigns paused. New campaigns, and any rise in your total budget, always wait for your yes.", icon: I.shield },
  { big: "Your numbers", title: "No borrowed results", body: "Every figure comes from your own ad account. Mairo compares your campaigns with themselves, never with made-up benchmarks.", icon: I.eye },
  { big: "Your limits", title: "A ceiling it can't cross", body: "Set a daily maximum and the most Mairo may change in a day. Every change it makes is logged, with the reason.", icon: I.lock },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#05050b] text-white">
      <LandingNav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative isolate pt-16">
        <DuskSky />
        <div className="relative mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-16 pt-14 sm:px-8 lg:grid-cols-[1fr_1.05fr] lg:pb-24 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-3.5 py-1.5 text-[12.5px] text-violet-100">
              <span aria-hidden className="text-violet-300">✦</span> AI advertising for real businesses
            </span>
            <h1 className="mt-6 text-[clamp(40px,5.2vw,66px)] font-semibold leading-[1] tracking-[-0.045em]">
              <span className="whitespace-nowrap">More customers,</span>
              <br />
              <span className={GRADIENT_TEXT}>less work.</span>
            </h1>
            <p className="mt-6 max-w-[520px] text-[16.5px] leading-relaxed text-white/75">
              Mairo creates, launches, and optimizes your Facebook and Instagram ads with AI — so you can get more
              customers while you run your business.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-up"
                className={`${ACCENT} inline-flex items-center justify-center gap-2 rounded-full px-7 py-3.5 text-[15px] font-medium shadow-[0_12px_40px_-10px_rgba(139,92,246,0.9)] transition hover:brightness-110`}
              >
                Start free trial <span aria-hidden>→</span>
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center gap-2.5 rounded-full border border-white/20 bg-white/[0.03] px-6 py-3.5 text-[15px] text-white/90 transition hover:border-white/35"
              >
                <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] text-black">↓</span>
                See how it works
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-white/65">
              {[`${TRIAL_DAYS}-day free trial`, "Setup in minutes", "Works with your own Meta ad account"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-500 text-[9px]">✓</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <LaptopMock />
        </div>

        {/* What it works with — stated as fact, not as endorsement. */}
        <div className="relative mx-auto max-w-[1200px] px-5 pb-6 sm:px-8">
          <div className="flex flex-col gap-5 border-t border-white/[0.07] pt-8 md:flex-row md:items-center md:gap-10">
            <p className="shrink-0 text-[13px] leading-snug text-white/55">
              Works with the tools
              <br className="hidden md:block" /> you already use
            </p>
            <ul className="flex flex-wrap items-center gap-x-9 gap-y-4 text-white/70">
              <li className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
                <span className="h-6 w-6"><BrandMetaMark /></span> Meta
              </li>
              <li className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
                <span className="h-5 w-5"><BrandInstagramMark /></span> Instagram
              </li>
              <li className="text-[17px] font-semibold tracking-tight">Shopify</li>
              <li className="text-[17px] font-semibold tracking-tight">Google Tag Manager</li>
              <li className="text-[17px] font-semibold tracking-tight">stripe</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── Four promises, one line each ─────────────────────────────── */}
      <section className="relative mx-auto max-w-[1200px] px-5 py-12 sm:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/[0.07]">
          {[
            { t: "Create ads with AI", b: "Ad words and images made for your business in seconds.", i: I.bolt },
            { t: "Launch in minutes", b: "Mairo sets up and launches your campaigns.", i: I.target },
            { t: "Get more customers", b: "Mairo checks your ads every day and says what to improve.", i: I.bars },
            { t: "All in one place", b: "Facebook and Instagram ads, managed together.", i: I.user },
          ].map((f) => (
            <div key={f.t} className="flex gap-4 lg:px-6 lg:first:pl-0">
              <Icon d={f.i} />
              <div>
                <p className="text-[15px] font-medium">{f.t}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-white/55">{f.b}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Four product moments, in place of borrowed results. */}
        <div className="mt-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { k: "Pre-launch score", v: "86/100", note: "Every campaign checked before a dollar is spent", tone: "from-[#1e1b4b] via-[#312e81] to-[#4c1d95]" },
            { k: "Mairo Decisions", v: "3 today", note: "What's worth changing, in plain English", tone: "from-[#0f172a] via-[#1e3a8a] to-[#6d28d9]" },
            { k: "Business Brain", v: "Your site, read", note: "Products, prices and voice — remembered", tone: "from-[#2e1065] via-[#581c87] to-[#9d174d]" },
            { k: "One-Click Fix", v: "Fix this for me", note: "Ask why, then approve the fix", tone: "from-[#172554] via-[#312e81] to-[#86198f]" },
          ].map((c) => (
            <div key={c.k} className={`relative flex aspect-[4/3.2] flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-4 ${c.tone}`}>
              <span className="self-end rounded-xl border border-white/15 bg-black/35 px-3 py-1.5 text-right backdrop-blur">
                <span className="block text-[15px] font-semibold leading-tight sm:text-[18px]">{c.v}</span>
                <span className="block text-[10.5px] text-white/70">{c.k}</span>
              </span>
              <p className="max-w-[90%] text-[12.5px] leading-snug text-white/80">{c.note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative mx-auto max-w-[1200px] scroll-mt-20 px-5 py-16 sm:px-8">
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

      {/* ── Everything you need ──────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
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
      <section className="relative mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
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

      {/* ── Mairo Decisions ──────────────────────────────────────────── */}
      <section id="decisions" className="relative mx-auto max-w-[1200px] scroll-mt-20 px-5 py-16 sm:px-8">
        <SectionHead
          title="Mairo's AI makes smarter decisions, so you get better results"
          sub="Every day Mairo looks at your campaigns and tells you what's worth changing — only when there's something real to act on. You approve, or let it act within your limits."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {DECISIONS.map((d) => (
            <Panel key={d.title} className="flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium" style={{ color: d.tone, border: `1px solid ${d.tone}55` }}>
                  {d.tag}
                </span>
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/40">Example</span>
              </div>
              <p className="mt-3 text-[15.5px] font-medium">{d.title}</p>
              <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-white/60">{d.body}</p>
              <span className={`${ACCENT} mt-5 self-start rounded-full px-4 py-2 text-[12.5px] font-medium`} aria-hidden>
                {d.action}
              </span>
            </Panel>
          ))}
        </div>
      </section>

      {/* ── What you can count on (instead of borrowed testimonials) ─── */}
      <section className="relative mx-auto max-w-[1200px] px-5 py-16 sm:px-8">
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
      <section id="pricing" className="relative mx-auto max-w-[1200px] scroll-mt-20 px-5 py-16 sm:px-8">
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

      {/* ── Final call ───────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1200px] px-5 pb-20 pt-10 sm:px-8">
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
        <div className="mx-auto flex max-w-[1200px] flex-col gap-6 text-[13px] text-white/45 sm:flex-row sm:items-center sm:justify-between">
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
