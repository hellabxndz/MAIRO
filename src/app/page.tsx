import Link from "next/link";
import { Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { LandingNav } from "@/components/landing/landing-nav";
import { HeroDashboard } from "@/components/landing/hero-dashboard";
import { BusinessSelector } from "@/components/landing/business-selector";
import { FreePlanDemo } from "@/components/landing/free-plan-demo";
import { DashboardModes } from "@/components/landing/dashboard-modes";
import { Faq } from "@/components/faq";
import { InstagramMark, MetaMark } from "@/components/mairo/marks";
import { ResultsNote } from "@/components/results-disclaimer";
import { PLANS, STARTER_TRIAL_DAYS } from "@/lib/plans";
import { AGENTS } from "@/lib/team/agents";
import { AgentIcon } from "@/components/team/agent-ui";

// The marketing page: a premium AI advertising company, not a crypto site.
// White, with violet and electric-blue light, soft cards, and Mairo's own
// software as the only imagery — no people, no stock photos.
//
// Two rules above the design:
//   - Nothing claims what isn't true. No invented customer counts, ratings or
//     revenue; every figure in a product picture is labelled as sample data;
//     only platforms Mairo actually works with are shown.
//   - FREE shows what Mairo would do (the plan); PAID is Mairo doing it
//     (building, launching, optimizing). Nothing here implies a campaign runs
//     before a subscription.

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

const PRIMARY = "bg-gradient-to-r from-[#3b6bff] to-[#8b4dfb] text-white shadow-[0_14px_44px_-12px_rgba(99,102,241,0.9)] transition hover:brightness-110";
const GRADIENT_TEXT = "bg-gradient-to-r from-[#a86bff] via-[#8a6dff] to-[#4f86ff] bg-clip-text text-transparent";
const GLASS = "border border-white/10 bg-white/[0.03] backdrop-blur-xl";

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/[0.08] px-3.5 py-1.5 text-[12.5px] font-medium text-white/90">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-violet-300" fill="currentColor" aria-hidden>
        <path d="M8 1l1.6 4.4L14 7l-4.4 1.6L8 13l-1.6-4.4L2 7l4.4-1.6z" />
      </svg>
      {children}
    </span>
  );
}

function SectionHead({ badge, title, sub }: { badge?: string; title: ReactNode; sub?: string }) {
  return (
    <div className="mx-auto max-w-[760px] text-center">
      {badge && <Badge>{badge}</Badge>}
      <h2 className="mt-4 text-[clamp(30px,4.2vw,50px)] font-bold leading-[1.08] tracking-[-0.035em]">{title}</h2>
      {sub && <p className="mx-auto mt-4 max-w-[620px] text-[16.5px] leading-relaxed text-white/65">{sub}</p>}
    </div>
  );
}

function Check({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M3 8.5l3 3 7-7" />
      </svg>
      {children}
    </li>
  );
}

const CALLOUTS = [
  { text: "Mairo checks your ads every day.", pos: "left-[-9%] top-[-9%]", delay: "0s", icon: "M3 17l5-5 4 4 8-8M14 8h6v6" },
  { text: "Create ads in minutes.", pos: "right-[-14%] top-[13%]", delay: "1.4s", icon: "M4 5h16v14H4zM4 15l5-4 4 3 3-2 4 3" },
  { text: "Find more customers with AI targeting.", pos: "left-[-10%] bottom-[8%]", delay: "2.6s", icon: "M9 11a3 3 0 100-6 3 3 0 000 6zm-6 9c0-3 3-5 6-5s6 2 6 5M17 11a2.5 2.5 0 100-5M21 19c0-2.2-1.6-3.8-4-4.3" },
  { text: "Get clear recommendations on what to do next.", pos: "right-[-12%] bottom-[-10%]", delay: "3.8s", icon: "M5 20V10M11 20V4M17 20v-8" },
];

const STEPS = [
  { n: "01", title: "Tell Mairo your goal", body: "More sales, more leads, more bookings — just tell Mairo what you want.", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zm0-5a4 4 0 100-8 4 4 0 000 8zm0-3a1 1 0 100-2 1 1 0 000 2z" },
  { n: "02", title: "Mairo builds your plan", body: "A custom strategy, audience, budget and creative recommendations for your business — free.", icon: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7" },
  { n: "03", title: "Approve & activate", body: "Review your free plan, make changes with Mairo, connect your account, and choose your subscription.", icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM8 12l3 3 5-6" },
  { n: "04", title: "Mairo launches & optimizes", body: "After payment and your final approval of the campaign, Mairo launches it and keeps watching performance.", icon: "M5 20V10M11 20V4M17 20v-8" },
];

const HEALTH = [
  { k: "Advertising Health", v: 88, c: "from-sky-400 to-blue-500" },
  { k: "Creative Health", v: 72, c: "from-fuchsia-400 to-pink-500" },
  { k: "Website Health", v: 81, c: "from-violet-400 to-fuchsia-500" },
  { k: "Audience Health", v: 91, c: "from-emerald-400 to-teal-400" },
  { k: "Budget Health", v: 79, c: "from-emerald-400 to-lime-400" },
];

const FAQ = [
  {
    q: "What do I get for free?",
    a: "Business setup, a website analysis and a personalized advertising plan — goal, platforms, budget, audience, creative ideas and campaign structure — which you can change with Mairo or by hand and approve. It's strategy only: a Mairo subscription is needed before Mairo builds or launches a real campaign.",
  },
  {
    q: "Do I need any advertising experience?",
    a: "No. Mairo asks plain questions about your business, writes the plan, and explains every recommendation in normal language. Advanced mode shows the full numbers when you want them.",
  },
  {
    q: "Who pays for the ads themselves?",
    a: "You pay Meta directly, from your own ad account, at whatever budget you set. Your Mairo subscription is separate and never includes ad spend.",
  },
  {
    q: "Does Mairo change my campaigns without asking?",
    a: "Only if you let it. The first campaign is built paused and only goes live when you press Launch. In Manual mode nothing changes without your approval; in AI Assist and Full Autopilot, Mairo acts inside the limits you set, and every change is logged with the reason.",
  },
  {
    q: "Which platforms does Mairo work with?",
    a: "Facebook and Instagram, through your own Meta ad account.",
  },
  {
    q: "How does the free trial work?",
    a: `The Starter plan starts with a ${STARTER_TRIAL_DAYS}-day free trial. Stripe takes your card at checkout and the first charge is after the trial. If that payment doesn't go through, Mairo pauses your campaigns and cancels the subscription — your plan stays saved. Growth and Scale don't have a trial; they're billed from the day you subscribe.`,
  },
  {
    q: "Can Mairo guarantee results?",
    a: "No one honestly can. Mairo works from what you tell it and what your ad account reports, shows the data behind every recommendation, and tells you when it doesn't have enough data yet.",
  },
];

function money(n: number): string {
  return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

export default function Home() {
  return (
    <div className={`${jakarta.className} relative min-h-screen overflow-x-hidden bg-paper text-white`}>
      <LandingNav />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section id="product" className="relative isolate scroll-mt-20 overflow-hidden pt-[104px] sm:pt-[120px]">
        {/* Soft neon arcs behind the product. */}
        <svg aria-hidden viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" className="pointer-events-none absolute inset-0 -z-10 h-full w-full">
          <defs>
            <linearGradient id="arc-a" x1="0" x2="1">
              <stop offset="0" stopColor="#8b5cf6" stopOpacity="0" />
              <stop offset="0.5" stopColor="#8b5cf6" stopOpacity="0.9" />
              <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="glow-a" cx="0.72" cy="0.42" r="0.5">
              <stop offset="0" stopColor="#6d4dff" stopOpacity="0.32" />
              <stop offset="1" stopColor="#6d4dff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="1200" height="800" fill="url(#glow-a)" />
          <ellipse cx="860" cy="360" rx="430" ry="250" fill="none" stroke="url(#arc-a)" strokeWidth="1.6" transform="rotate(-14 860 360)" opacity="0.8" />
          <ellipse cx="860" cy="360" rx="520" ry="300" fill="none" stroke="url(#arc-a)" strokeWidth="1" transform="rotate(-8 860 360)" opacity="0.45" />
          <ellipse className="mairo-arc" cx="860" cy="360" rx="430" ry="250" fill="none" stroke="#a78bfa" strokeWidth="2" transform="rotate(-14 860 360)" opacity="0.5" />
          <path d="M-40 640 C 300 520, 620 700, 1240 470" fill="none" stroke="url(#arc-a)" strokeWidth="1.2" opacity="0.5" />
        </svg>

        <div className="mx-auto grid max-w-[1360px] grid-cols-1 items-center gap-14 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-6 lg:px-12">
          <div className="min-w-0">
            <Badge>AI Marketing Manager</Badge>
            <h1 className="mt-6 text-[clamp(34px,3.75vw,60px)] font-extrabold leading-[1.05] tracking-[-0.045em]">
              <span className="sm:whitespace-nowrap">You run the business.</span>
              <br />
              <span className="sm:whitespace-nowrap">Mairo runs the</span>
              <br />
              <span className={`${GRADIENT_TEXT} sm:whitespace-nowrap`}>marketing.</span>
            </h1>
            <p className="mt-6 max-w-[560px] text-[clamp(16px,1.35vw,19px)] leading-relaxed text-white/70">
              Tell Mairo what you want your business to achieve — more sales, more bookings, a new launch. Mairo builds the strategy, creates the ads and content, runs it with your approval, and learns what works.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/sign-up" className={`${PRIMARY} inline-flex min-h-[56px] items-center justify-center gap-2 rounded-full px-8 text-[16px] font-semibold`}>
                Get Your Free Plan <span aria-hidden>→</span>
              </Link>
              <a href="#how-it-works" className="inline-flex min-h-[56px] items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-7 text-[16px] font-medium text-white/90 backdrop-blur transition hover:border-white/30">
                <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 fill-white" aria-hidden><path d="M2 1.2v9.6L10.5 6z" /></svg>
                See How It Works
              </a>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-white/70">
              <Check>No credit card required</Check>
              <Check>Personalized plan for your business</Check>
              <Check>Takes less than 2 minutes</Check>
            </ul>
          </div>

          {/* The floating dashboard with its AI callouts. */}
          <div className="relative min-w-0 lg:[perspective:2000px]">
            <div className="lg:w-[112%] lg:[transform:rotateY(-11deg)_rotateX(5deg)] lg:[transform-style:preserve-3d]">
              <HeroDashboard />
            </div>
            {CALLOUTS.map((c) => (
              <div
                key={c.text}
                className={`mairo-float absolute z-10 hidden max-w-[210px] items-center gap-3 rounded-2xl ${GLASS} bg-paper/90 px-4 py-3 shadow-[0_18px_50px_-18px_rgba(99,102,241,0.9)] xl:flex ${c.pos}`}
                style={{ animationDelay: c.delay }}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f7dff] to-[#8b4dfb]">
                  <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={c.icon} />
                  </svg>
                </span>
                <span className="text-[13px] font-medium leading-snug text-white">{c.text}</span>
              </div>
            ))}
            {/* On smaller screens the callouts sit under the dashboard instead. */}
            <ul className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:hidden">
              {CALLOUTS.map((c) => (
                <li key={c.text} className={`flex items-center gap-3 rounded-2xl ${GLASS} px-4 py-3 text-[13.5px] text-white/90`}>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-gradient-to-r from-[#4f7dff] to-[#8b4dfb]" />
                  {c.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Platform bar ──────────────────────────────────────────── */}
        <div id="platforms" className="mx-auto mt-20 max-w-[1360px] px-5 sm:px-8 lg:px-12">
          <div className={`flex flex-col gap-8 rounded-[28px] ${GLASS} px-6 py-7 sm:px-9 lg:flex-row lg:items-center lg:justify-between`}>
            <div className="min-w-0">
              <p className="text-[13px] text-white/55">Works with the platforms you already use</p>
              <ul className="mt-4 flex flex-wrap items-center gap-x-9 gap-y-4 text-white/85">
                <li className="flex items-center gap-2 text-[21px] font-semibold tracking-[-0.02em]"><span className="h-6 w-6"><MetaMark /></span> Meta</li>
                <li className="flex items-center gap-2 text-[21px] font-semibold tracking-[-0.02em]"><span className="h-5 w-5"><InstagramMark /></span> Instagram</li>
                <li className="text-[21px] font-bold italic tracking-[-0.02em]">shopify</li>
                <li className="text-[19px] font-medium tracking-[-0.01em]">Google Tag Manager</li>
                <li className="text-[22px] font-bold tracking-[-0.03em] text-[#8c86ff]">stripe</li>
              </ul>
            </div>
            <dl className="grid shrink-0 grid-cols-1 gap-5 border-white/10 sm:grid-cols-3 lg:border-l lg:pl-9">
              {[
                ["Facebook + Instagram", "One dashboard"],
                ["AI powered", "Checks your ads every day"],
                ["Simple + Advanced", "Built for any experience level"],
              ].map(([a, b]) => (
                <div key={a}>
                  <dt className="text-[16px] font-semibold text-white">{a}</dt>
                  <dd className="mt-0.5 text-[12.5px] text-white/55">{b}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-24 sm:px-8 lg:px-12">
        <SectionHead
          badge="HOW IT WORKS"
          title="From your goal to a live campaign."
          sub="Mairo handles the strategy, creative, targeting, and optimization — so you don’t have to."
        />
        <ol className="relative mt-14 grid grid-cols-1 gap-10 lg:grid-cols-4 lg:gap-6">
          {/* The timeline line on phones. */}
          <span aria-hidden className="absolute bottom-6 left-[31px] top-6 w-px bg-gradient-to-b from-violet-500/60 via-violet-500/30 to-transparent lg:hidden" />
          {STEPS.map((s, i) => (
            <li key={s.n} className="relative flex gap-5 lg:flex-col lg:gap-0">
              <div className="flex items-center gap-4">
                <span className="relative z-10 flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#7c4dff] to-[#4f6dff] text-[20px] font-bold shadow-[0_0_40px_-4px_rgba(124,77,255,0.85)]">
                  {s.n}
                </span>
                {i < STEPS.length - 1 && (
                  <svg aria-hidden viewBox="0 0 80 12" className="hidden h-3 flex-1 text-violet-400/70 lg:block">
                    <path d="M0 6h74m-6-5l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
              </div>
              <div className="lg:mt-6 lg:pr-6">
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-violet-300" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d={s.icon} />
                </svg>
                <p className="mt-3 text-[18px] font-semibold">{s.title}</p>
                <p className="mt-2 text-[14.5px] leading-relaxed text-white/60">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mx-auto mt-12 max-w-[900px] text-center text-[13px] leading-relaxed text-white/45">
          Free plan → edit plan → approve plan → connect ad account → choose subscription → pay → Mairo builds the campaign → your final approval → launch.
        </p>
      </section>

      {/* ── Your AI advertising team ──────────────────────────────────── */}
      <section id="ai-team" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-24 -z-10 mx-auto h-[420px] max-w-[1000px] rounded-full bg-violet-600/15 blur-[120px]" />
        <SectionHead
          badge="YOUR AI ADVERTISING TEAM"
          title="Meet your new AI advertising team."
          sub="MAIRO brings eight AI specialties together to plan, create, manage, analyze and improve your campaigns — all from one simple dashboard."
        />
        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AGENTS.map((a) => (
            <li key={a.role} className={`rounded-2xl ${GLASS} p-5`}>
              <AgentIcon role={a.role} />
              <p className="mt-4 text-[16px] font-semibold text-white">{a.name}</p>
              <p className="text-[13px] text-violet-200/80">{a.purpose}</p>
              <ul className="mt-3 space-y-1.5 text-[13.5px] leading-relaxed text-white/60">
                {a.does.slice(0, 3).map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className={`rounded-2xl ${GLASS} p-6`}>
            <p className="text-[15px] font-semibold text-white">How they work together</p>
            <ol className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-white/75">
              {["Strategy plans", "Audience picks who to reach", "Creative makes the ads", "Campaign builds it, switched off", "Budget Guardian checks your limits", "You approve", "Campaign launches", "Analytics reports daily", "Optimization proposes improvements", "Growth looks for what's next"].map((step, i, all) => (
                <li key={step} className="flex items-center gap-2">
                  <span className={`rounded-full px-3 py-1 ${step === "You approve" ? "bg-amber-400/15 text-amber-100" : "bg-white/[0.06]"}`}>{step}</span>
                  {i < all.length - 1 && <span aria-hidden className="text-violet-300/60">→</span>}
                </li>
              ))}
            </ol>
            <p className="mt-4 text-[13px] leading-relaxed text-white/50">
              Real examples: &ldquo;Your Campaign Agent built your Meta campaign and is waiting for your approval.&rdquo; &ldquo;Your Budget Guardian
              checked the proposed change against your limits.&rdquo; &ldquo;Your Analytics Agent wrote your weekly report.&rdquo; Every line on your
              AI Team screen is something that really ran.
            </p>
          </div>
          <div className={`rounded-2xl ${GLASS} p-6`}>
            <p className="text-[15px] font-semibold text-white">What always needs your approval</p>
            <ul className="mt-3 space-y-2 text-[13.5px] text-white/70">
              <li>✓ Launching any campaign — with the budget shown first</li>
              <li>✓ Spending more than you&rsquo;ve set</li>
              <li>✓ Changing who a running campaign reaches</li>
              <li>✓ Anything outside the automation level you choose</li>
            </ul>
            <p className="mt-4 text-[12.5px] leading-relaxed text-white/45">
              Eight AI specialties, one AI system — not eight people, and not eight separate programs. They check your campaigns on a schedule,
              once a day and whenever you open MAIRO. MAIRO can&rsquo;t promise sales or a particular return.
            </p>
          </div>
        </div>
        <div className="mt-10 text-center">
          <p className="text-[15px] text-white/70">Your business. Your goals. Your AI advertising team.</p>
          <Link href="/sign-up" className={`${PRIMARY} mt-5 inline-flex min-h-[54px] items-center gap-2 rounded-full px-8 text-[15.5px] font-semibold`}>
            Get started
          </Link>
        </div>
      </section>

      {/* ── Built for your business ─────────────────────────────────── */}
      <section id="business-types" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <SectionHead badge="BUILT FOR YOUR BUSINESS" title="See how Mairo would advertise your business." />
        <div className="mt-10">
          <BusinessSelector />
        </div>
      </section>

      {/* ── Free plan ────────────────────────────────────────────────── */}
      <section id="free-plan" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-10 -z-10 mx-auto h-[420px] max-w-[900px] rounded-full bg-violet-600/15 blur-[120px]" />
        <SectionHead
          badge="YOUR FREE PLAN"
          title="See your advertising plan before you pay."
          sub="Tell Mairo about your business and get a personalized advertising strategy for free."
        />
        <div className="mt-12">
          <FreePlanDemo />
        </div>
        <div className={`mx-auto mt-8 max-w-[860px] rounded-2xl ${GLASS} px-6 py-5 text-center`}>
          <p className="text-[15px] font-semibold text-white">Your free plan is strategy only.</p>
          <p className="mt-1 text-[14px] text-white/60">A Mairo subscription is required before a real campaign is created or launched. Mairo shows you the strategy for free — you subscribe when you want Mairo to actually do it.</p>
        </div>
      </section>

      {/* ── Mairo Decisions ──────────────────────────────────────────── */}
      <section id="decisions" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge>MAIRO DECISIONS</Badge>
            <h2 className="mt-4 text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.035em]">
              Mairo doesn&rsquo;t just manage your ads.
              <br />
              <span className={GRADIENT_TEXT}>It explains what to do and why.</span>
            </h2>
            <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-white/65">
              Every recommendation comes with the numbers behind it and how sure Mairo is. You approve, ask why, or ignore it — and in Manual mode nothing changes without you.
            </p>
          </div>
          <div className={`relative rounded-3xl ${GLASS} p-6 shadow-[0_40px_100px_-40px_rgba(124,77,255,0.8)] sm:p-8`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-violet-300">Mairo Decision</p>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">High Confidence</span>
                <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Demo</span>
              </div>
            </div>
            <p className="mt-3 text-[22px] font-semibold leading-snug">Move $20/day from Creative #2 to Creative #4.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {[
                ["Creative #2", "$46.21", "1.8x", "text-rose-300"],
                ["Creative #4", "$24.30", "4.7x", "text-emerald-300"],
              ].map(([n, cpa, roas, tone]) => (
                <div key={n} className="rounded-2xl border border-white/[0.07] bg-field-2/80 p-4">
                  <p className="text-[13px] font-medium text-white">{n}</p>
                  <p className="mt-2 text-[12px] text-white/50">CPA <span className={`ml-1 text-[15px] font-semibold ${tone}`}>{cpa}</span></p>
                  <p className="text-[12px] text-white/50">ROAS <span className={`ml-1 text-[15px] font-semibold ${tone}`}>{roas}</span></p>
                </div>
              ))}
            </div>
            <p className="mt-5 text-[14px] text-white/75"><span className="text-white/45">Reason: </span>Creative #4 has produced purchases at a lower cost over the last 5 days.</p>
            <p className="mt-2 text-[12.5px] text-white/45">Based on 5 days of data · 2,840 clicks · 64 purchases</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`${PRIMARY} rounded-full px-5 py-2.5 text-[13.5px] font-medium`}>Approve</span>
              <span className="rounded-full border border-white/15 px-5 py-2.5 text-[13.5px] text-white/85">Ask Mairo Why</span>
              <span className="rounded-full border border-white/15 px-5 py-2.5 text-[13.5px] text-white/85">Ignore</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Business Health ──────────────────────────────────────────── */}
      <section id="health" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div className={`order-2 rounded-3xl ${GLASS} p-6 sm:p-8 lg:order-1`}>
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-semibold">Business Health</p>
              <span className="rounded-full border border-white/15 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-white/55">Sample</span>
            </div>
            <p className="mt-3 text-[48px] font-bold leading-none tracking-[-0.03em]">
              84<span className="text-[20px] font-medium text-white/45"> / 100</span>
            </p>
            <ul className="mt-6 space-y-4">
              {HEALTH.map((h) => (
                <li key={h.k}>
                  <div className="flex justify-between text-[13.5px]">
                    <span className="text-white/75">{h.k}</span>
                    <span className="tabular-nums text-white">{h.v}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                    <div className={`h-full rounded-full bg-gradient-to-r ${h.c}`} style={{ width: `${h.v}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="order-1 lg:order-2">
            <Badge>BUSINESS HEALTH</Badge>
            <h2 className="mt-4 text-[clamp(30px,4vw,48px)] font-bold leading-[1.08] tracking-[-0.035em]">
              More than ad metrics.
              <br />
              <span className={GRADIENT_TEXT}>See the health of your entire advertising system.</span>
            </h2>
            <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-white/65">
              Your ads, creative, website, audience and budget, scored in one place so you can see what&rsquo;s holding results back.
            </p>
            <p className="mt-3 max-w-[520px] text-[13.5px] leading-relaxed text-white/45">
              Business Health appears once a real campaign is running and there&rsquo;s enough data to measure — Mairo never fills it with guesses.
            </p>
          </div>
        </div>
      </section>

      {/* ── Dashboard preview ────────────────────────────────────────── */}
      <section id="dashboard" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <SectionHead
          badge="YOUR DASHBOARD"
          title="Three ways to read the same results."
          sub="Simple for a quick answer, Advanced for every metric, Profit First for what your ads actually earn."
        />
        <div className="mt-12">
          <DashboardModes />
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="relative mx-auto max-w-[1360px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <SectionHead
          badge="PRICING"
          title="Start with your free plan. Subscribe when you're ready."
          sub={`Your plan is free. A subscription is what lets Mairo build, launch and optimize it — and Starter comes with a ${STARTER_TRIAL_DAYS}-day free trial.`}
        />
        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`relative flex min-w-0 flex-col rounded-3xl p-6 transition hover:-translate-y-1 ${
                plan.featured ? "border border-violet-400/45 bg-gradient-to-b from-violet-500/[0.14] to-white/[0.02] shadow-[0_30px_80px_-30px_rgba(124,77,255,0.8)]" : GLASS
              }`}
            >
              {plan.featured && (
                <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-[#3b6bff] to-[#8b4dfb] px-3 py-1 text-[11px] font-medium text-white">Most popular</span>
              )}
              <p className="text-[16px] font-semibold">{plan.name}</p>
              <p className="mt-1 text-[13px] text-white/55">{plan.headline}</p>
              <p className="mt-4 flex items-baseline gap-1">
                <span className="text-[38px] font-bold tracking-[-0.03em] tabular-nums">{money(plan.priceMonthly)}</span>
                <span className="text-[13px] text-white/50">/month</span>
              </p>
              {plan.trialDays ? <p className="mt-1 text-[12.5px] font-medium text-emerald-300">{plan.trialDays}-day free trial</p> : null}
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
                className={`mt-6 rounded-full py-3 text-center text-[14px] font-medium ${plan.featured ? PRIMARY : "border border-white/15 transition hover:border-white/35"}`}
              >
                Get Your Free Plan First <span aria-hidden>→</span>
              </Link>
            </div>
          ))}
        </div>
        <p className="mx-auto mt-6 max-w-3xl text-center text-[13px] leading-relaxed text-white/50">
          Your subscription pays for Mairo. Your advertising budget is separate — it goes straight from you to Meta, at whatever you set.{" "}
          <Link href="/for-freelancers" className="text-violet-300 hover:text-white">Running ads for clients? See the freelancer and agency plans →</Link>
        </p>
        <ResultsNote className="mx-auto mt-3 max-w-3xl text-center" />
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="relative mx-auto max-w-[1100px] scroll-mt-20 px-5 py-20 sm:px-8 lg:px-12">
        <SectionHead badge="FAQ" title="Questions, answered." />
        <div className="mt-10">
          <Faq items={FAQ} />
        </div>
      </section>

      {/* ── Final call ───────────────────────────────────────────────── */}
      <section className="relative mx-auto max-w-[1360px] px-5 pb-24 pt-8 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-[32px] border border-violet-400/25 bg-[radial-gradient(90%_120%_at_80%_0%,rgba(99,102,241,0.16),transparent_55%),radial-gradient(70%_100%_at_10%_100%,rgba(139,92,246,0.14),transparent_60%),linear-gradient(135deg,#f6f3ff,#ffffff)] px-6 py-16 text-center sm:px-12">
          <h2 className="mx-auto max-w-[820px] text-[clamp(32px,5vw,56px)] font-bold leading-[1.05] tracking-[-0.04em]">
            Get your free personalized <span className={GRADIENT_TEXT}>advertising plan.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-[16px] leading-relaxed text-white/70">
            Tell Mairo about your business and see exactly how it would approach your advertising before you subscribe.
          </p>
          <Link href="/sign-up" className={`${PRIMARY} mt-9 inline-flex min-h-[58px] items-center gap-2 rounded-full px-9 text-[16px] font-semibold`}>
            Get Your Free Plan <span aria-hidden>→</span>
          </Link>
          <ul className="mx-auto mt-7 flex max-w-[760px] flex-wrap justify-center gap-x-6 gap-y-2 text-[13.5px] text-white/70">
            <Check>No credit card required</Check>
            <Check>Personalized for your business</Check>
            <Check>Edit the plan with Mairo</Check>
            <Check>Pay only when you are ready to activate it</Check>
          </ul>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer className="border-t border-white/[0.06] px-5 py-14 sm:px-8">
        <div className="mx-auto grid max-w-[1360px] grid-cols-2 gap-10 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[18px] font-light tracking-[0.34em] text-white">MAIRO</p>
            <p className="mt-3 max-w-[240px] text-[13px] leading-relaxed text-white/50">Your AI marketing manager. You run the business — Mairo runs the marketing.</p>
            <p className="mt-4 text-[12px] text-white/35">© {new Date().getFullYear()} Mairo</p>
          </div>
          {[
            { h: "Product", l: [["Features", "#product"], ["How It Works", "#how-it-works"], ["Pricing", "#pricing"], ["Integrations", "#platforms"]] },
            { h: "Resources", l: [["Your free plan", "#free-plan"], ["FAQ", "#faq"], ["For freelancers & agencies", "/for-freelancers"]] },
            { h: "Company", l: [["Sign in", "/sign-in"], ["Privacy", "/privacy"], ["Terms", "/terms"], ["Data deletion", "/data-deletion"]] },
          ].map((col) => (
            <div key={col.h}>
              <p className="text-[13px] font-semibold text-white">{col.h}</p>
              <ul className="mt-4 space-y-2.5 text-[13px] text-white/55">
                {col.l.map(([label, href]) => (
                  <li key={label}>
                    {href.startsWith("#") ? (
                      <a href={href} className="hover:text-white">{label}</a>
                    ) : (
                      <Link href={href} className="hover:text-white">{label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
